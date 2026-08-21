-- La Joie Dijital Menü — 11. adım: kampanyalar, kişiye özel kuponlar, tek kod alanı
--
-- Dört değişiklik:
--   1) Kupon ve hediye kartı TEK alandan girilir. Kodun hangisi olduğunu
--      veritabanı bulur; müşteri bilmek zorunda değil.
--   2) Kupon artık bir kişiye ait olabilir (owner_id). Kişiye özel kupon
--      başkasının elinde işe yaramaz.
--   3) Kampanyalar: hesap açan herkese ya da belirli bir bağlantıdan
--      kaydolana otomatik kupon tanımlanır.
--   4) Hesaptaki kuponlar sipariş ekranında görünür ve seçilebilir.

-- ============================================================
-- 1) KAMPANYALAR
-- ============================================================
-- Kampanya bir kupon ŞABLONUDUR. Kişi kaydolunca bu şablondan
-- ona özel, tek kullanımlık bir kupon üretilir.

create table if not exists public.campaigns (
  id           bigint generated always as identity primary key,

  -- Bağlantıda görünen ad: /kayit/hosgeldin
  slug         text not null unique
                 check (slug ~ '^[a-z0-9-]{2,32}$'),
  name         text not null check (char_length(name) between 2 and 60),

  -- Üretilecek kuponun özellikleri
  kind         text not null default 'percent' check (kind in ('percent', 'amount')),
  value        numeric(10,2) not null check (value > 0),
  min_total    numeric(10,2) not null default 0 check (min_total >= 0),
  max_discount numeric(10,2) not null default 0 check (max_discount >= 0),

  -- Kupon üretildikten kaç gün sonra geçersiz olsun (0 = süresiz)
  valid_days   integer not null default 30 check (valid_days >= 0),

  -- true: bağlantı olmadan, hesap açan HERKESE verilir
  auto_signup  boolean not null default false,

  -- Toplam kaç kişiye verilebilir (0 = sınırsız)
  issue_limit  integer not null default 0 check (issue_limit >= 0),
  issued_count integer not null default 0,

  note         text    not null default '' check (char_length(note) <= 160),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Aynı anda birden çok "herkese" kampanyası olmasın; kafa karıştırır.
create unique index if not exists campaigns_tek_otomatik
  on public.campaigns ((auto_signup))
  where auto_signup and active;

-- ============================================================
-- 2) KUPON: SAHİPLİK
-- ============================================================
alter table public.coupons
  add column if not exists owner_id    uuid   references auth.users (id) on delete cascade,
  add column if not exists campaign_id bigint references public.campaigns (id) on delete set null;

create index if not exists coupons_sahip_idx on public.coupons (owner_id) where owner_id is not null;

-- Kişiye özel kuponu yalnızca sahibi kullanabilir.
create or replace function public.kupon_hesapla(
  p_kod      text,
  p_tutar    numeric,
  p_user_key text,
  p_uye      boolean
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k          coupons%rowtype;
  v_indirim  numeric(10,2);
  v_kullanim integer;
begin
  select * into k from coupons where upper(code) = upper(btrim(p_kod));

  if k.id is null then
    return json_build_object('ok', false, 'mesaj', 'Böyle bir kupon yok');
  end if;

  -- Sahiplik: kupon birine tanımlıysa başkası kullanamaz.
  if k.owner_id is not null and k.owner_id is distinct from auth.uid() then
    return json_build_object('ok', false, 'mesaj', 'Bu kupon size tanımlı değil');
  end if;

  if not k.active then
    return json_build_object('ok', false, 'mesaj', 'Bu kupon artık geçerli değil');
  end if;
  if k.starts_at is not null and now() < k.starts_at then
    return json_build_object('ok', false, 'mesaj', 'Bu kupon henüz başlamadı');
  end if;
  if k.ends_at is not null and now() > k.ends_at then
    return json_build_object('ok', false, 'mesaj', 'Bu kuponun süresi doldu');
  end if;
  if k.members_only and not p_uye then
    return json_build_object('ok', false, 'mesaj', 'Bu kupon yalnızca üyeler için');
  end if;
  if k.usage_limit > 0 and k.used_count >= k.usage_limit then
    return json_build_object('ok', false, 'mesaj', 'Bu kuponun kullanım hakkı doldu');
  end if;
  if p_tutar < k.min_total then
    return json_build_object(
      'ok', false,
      'mesaj', 'En az ' || trim(to_char(k.min_total, 'FM999999990.00')) || ' TL sipariş gerekiyor'
    );
  end if;

  if k.per_user > 0 and coalesce(p_user_key, '') <> '' then
    select count(*) into v_kullanim
    from redemptions r
    join orders o on o.id = r.order_id
    where r.coupon_id = k.id
      and r.user_key = p_user_key
      and o.status <> 'cancelled';

    if v_kullanim >= k.per_user then
      return json_build_object('ok', false, 'mesaj', 'Bu kuponu daha önce kullandınız');
    end if;
  end if;

  if k.kind = 'percent' then
    v_indirim := round(p_tutar * k.value / 100, 2);
    if k.max_discount > 0 then
      v_indirim := least(v_indirim, k.max_discount);
    end if;
  else
    v_indirim := k.value;
  end if;

  v_indirim := least(v_indirim, p_tutar);

  return json_build_object(
    'ok', true,
    'id', k.id,
    'kod', k.code,
    'indirim', v_indirim,
    'mesaj', case when k.kind = 'percent'
                  then '%' || trim(to_char(k.value, 'FM999990.99')) || ' indirim'
                  else 'İndirim uygulandı' end
  );
end;
$$;

-- ============================================================
-- 3) KAMPANYADAN KUPON ÜRET
-- ============================================================
create or replace function public.kampanya_kuponu_ver(p_user uuid, p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c     campaigns%rowtype;
  v_kod text;
begin
  select * into c from campaigns
  where slug = lower(btrim(p_slug)) and active
  for update;

  if c.id is null then
    return null;
  end if;
  if c.issue_limit > 0 and c.issued_count >= c.issue_limit then
    return null;
  end if;

  -- Aynı kampanyadan bir kişiye ikinci kupon verilmez.
  if exists (select 1 from coupons where campaign_id = c.id and owner_id = p_user) then
    return null;
  end if;

  loop
    v_kod := upper(left(regexp_replace(c.slug, '[^a-z0-9]', '', 'g'), 4)) || public.kod_uret(6);
    exit when not exists (select 1 from coupons where upper(code) = upper(v_kod));
  end loop;

  insert into coupons (code, kind, value, min_total, max_discount,
                       ends_at, usage_limit, per_user, members_only,
                       note, owner_id, campaign_id)
  values (v_kod, c.kind, c.value, c.min_total, c.max_discount,
          case when c.valid_days > 0 then now() + (c.valid_days || ' days')::interval end,
          1,      -- kişiye özel kupon tek kullanımlıktır
          1,
          true,   -- üyelere özel
          c.name, p_user, c.id);

  update campaigns set issued_count = issued_count + 1 where id = c.id;

  return v_kod;
end;
$$;

-- ============================================================
-- 4) KAYIT ANINDA KUPON TANIMLA
-- ============================================================
-- Kayıt formundan gelen kampanya kodu raw_user_meta_data.campaign
-- içinde taşınır. Ayrıca auto_signup kampanyası varsa o da verilir.
create or replace function public.profil_ac()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'campaign', '')), '');
  v_oto  text;
begin
  insert into public.profiles (user_id, name, phone)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 60),
    left(coalesce(nullif(new.raw_user_meta_data ->> 'phone', ''), new.phone, ''), 24)
  )
  on conflict (user_id) do nothing;

  -- Herkese açık hoş geldin kampanyası
  select slug into v_oto from campaigns where auto_signup and active limit 1;
  if v_oto is not null then
    perform public.kampanya_kuponu_ver(new.id, v_oto);
  end if;

  -- Bağlantıya özel kampanya (varsa ve öncekinden farklıysa)
  if v_slug is not null and v_slug is distinct from v_oto then
    perform public.kampanya_kuponu_ver(new.id, v_slug);
  end if;

  return new;
end;
$$;

-- Kayıttan sonra bağlantıyı bulan kullanıcılar için: sonradan da alınabilsin.
create or replace function public.kampanyaya_katil(p_slug text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kod text;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısınız';
  end if;

  v_kod := public.kampanya_kuponu_ver(auth.uid(), p_slug);

  if v_kod is null then
    return json_build_object('ok', false, 'mesaj', 'Bu kampanyadan yararlanamıyorsunuz');
  end if;
  return json_build_object('ok', true, 'kod', v_kod);
end;
$$;

-- ============================================================
-- 5) HESABIMDAKİ KUPONLAR
-- ============================================================
-- Sipariş ekranında listelenir. Kullanılmış ve süresi geçmiş olanlar gelmez.
create or replace function public.kuponlarim(p_tutar numeric default 0)
returns table (
  code text, kind text, value numeric, min_total numeric, max_discount numeric,
  ends_at timestamptz, note text, kullanilabilir boolean, indirim numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  select k.code, k.kind, k.value, k.min_total, k.max_discount, k.ends_at, k.note,
         (p_tutar >= k.min_total) as kullanilabilir,
         case
           when k.kind = 'percent' then
             least(
               case when k.max_discount > 0
                    then least(round(p_tutar * k.value / 100, 2), k.max_discount)
                    else round(p_tutar * k.value / 100, 2) end,
               p_tutar)
           else least(k.value, p_tutar)
         end as indirim
  from coupons k
  where k.owner_id = auth.uid()
    and k.active
    and (k.ends_at is null or k.ends_at > now())
    and (k.usage_limit = 0 or k.used_count < k.usage_limit)
    and not exists (
      select 1 from redemptions r
      join orders o on o.id = r.order_id
      where r.coupon_id = k.id
        and r.user_key = auth.uid()::text
        and o.status <> 'cancelled'
    )
  order by k.ends_at nulls last, k.created_at desc;
end;
$$;

-- ============================================================
-- 6) TEK ALAN: KODU ÇÖZ
-- ============================================================
-- Kod kupon mu, hediye kartı mı? Müşteri bilmek zorunda kalmasın.
create or replace function public.kod_turu(p_kod text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from coupons    where upper(code) = upper(btrim(p_kod))) then 'kupon'
    when exists (select 1 from gift_cards where upper(code) = upper(btrim(p_kod))) then 'hediye'
    else 'yok'
  end;
$$;

-- Birden çok kodu birlikte değerlendirir: en fazla 1 kupon + 1 hediye kartı.
create or replace function public.indirim_onizle(
  p_tutar     numeric,
  p_kodlar    jsonb default '[]'::jsonb,
  p_ziyaretci text default ''
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key     text := coalesce(auth.uid()::text, left(coalesce(p_ziyaretci, ''), 64));
  v_uye     boolean := auth.uid() is not null;
  v_kalan   numeric(10,2) := greatest(coalesce(p_tutar, 0), 0);
  v_indirim numeric(10,2) := 0;
  v_gift    numeric(10,2) := 0;
  v_kupon   json := null;
  v_hediye  json := null;
  v_sonuc   jsonb := '[]'::jsonb;
  v_kod     text;
  v_tur     text;
  v_deger   json;
  e         jsonb;
begin
  if p_kodlar is null or jsonb_typeof(p_kodlar) <> 'array' then
    p_kodlar := '[]'::jsonb;
  end if;

  for e in select * from jsonb_array_elements(p_kodlar) limit 6 loop
    v_kod := btrim(trim(both '"' from e::text));
    continue when v_kod = '';

    v_tur := public.kod_turu(v_kod);

    if v_tur = 'kupon' then
      if v_kupon is not null then
        v_sonuc := v_sonuc || jsonb_build_object(
          'kod', v_kod, 'tur', 'kupon', 'ok', false,
          'mesaj', 'Tek siparişte bir kupon kullanılabilir');
        continue;
      end if;

      v_deger := public.kupon_hesapla(v_kod, v_kalan, v_key, v_uye);
      if (v_deger ->> 'ok')::boolean then
        v_kupon := v_deger;
        v_indirim := (v_deger ->> 'indirim')::numeric;
        v_kalan := v_kalan - v_indirim;
        v_sonuc := v_sonuc || jsonb_build_object(
          'kod', v_deger ->> 'kod', 'tur', 'kupon', 'ok', true,
          'tutar', v_indirim, 'mesaj', v_deger ->> 'mesaj');
      else
        v_sonuc := v_sonuc || jsonb_build_object(
          'kod', v_kod, 'tur', 'kupon', 'ok', false, 'mesaj', v_deger ->> 'mesaj');
      end if;

    elsif v_tur = 'hediye' then
      if v_hediye is not null then
        v_sonuc := v_sonuc || jsonb_build_object(
          'kod', v_kod, 'tur', 'hediye', 'ok', false,
          'mesaj', 'Tek siparişte bir hediye kartı kullanılabilir');
        continue;
      end if;

      v_deger := public.hediye_hesapla(v_kod, v_kalan);
      if (v_deger ->> 'ok')::boolean then
        v_hediye := v_deger;
        v_gift := (v_deger ->> 'kullanilacak')::numeric;
        v_kalan := v_kalan - v_gift;
        v_sonuc := v_sonuc || jsonb_build_object(
          'kod', v_deger ->> 'kod', 'tur', 'hediye', 'ok', true,
          'tutar', v_gift, 'mesaj', v_deger ->> 'mesaj');
      else
        v_sonuc := v_sonuc || jsonb_build_object(
          'kod', v_kod, 'tur', 'hediye', 'ok', false, 'mesaj', v_deger ->> 'mesaj');
      end if;

    else
      v_sonuc := v_sonuc || jsonb_build_object(
        'kod', v_kod, 'tur', 'yok', 'ok', false, 'mesaj', 'Böyle bir kod bulunamadı');
    end if;
  end loop;

  return json_build_object(
    'ara_toplam', p_tutar,
    'indirim',    v_indirim,
    'hediye',     v_gift,
    'odenecek',   v_kalan,
    'kupon_kod',  v_kupon ->> 'kod',
    'hediye_kod', v_hediye ->> 'kod',
    'kodlar',     v_sonuc
  );
end;
$$;

-- ============================================================
-- 7) SİPARİŞ: KOD DİZİSİ ALIR
-- ============================================================
drop function if exists public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text, text, text, text);

create or replace function public.siparis_olustur(
  p_urunler   jsonb,
  p_teslim    timestamptz,
  p_mod       text default 'dinein',
  p_ad        text default '',
  p_telefon   text default '',
  p_not       text default '',
  p_ziyaretci text default '',
  p_kodlar    jsonb default '[]'::jsonb,
  p_odeme     text default 'cash'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bas      time    := (public.ayar('preorder_start', '11:30'))::time;
  v_bit      time    := (public.ayar('preorder_end',   '14:30'))::time;
  v_adim     integer := greatest((public.ayar('preorder_step',     '15'))::int, 5);
  v_hazirlik integer := greatest((public.ayar('preorder_lead',     '20'))::int, 0);
  v_kap      integer := greatest((public.ayar('preorder_capacity',  '6'))::int, 1);
  v_ilkno    integer := greatest((public.ayar('preorder_start_no','101'))::int, 1);
  v_tutma    integer := greatest((public.ayar('payment_hold_minutes','15'))::int, 3);

  v_gun      date := public.yerel_gun();
  v_yerel    timestamp;
  v_dakika   integer;
  v_adet     integer;
  v_no       integer;
  v_id       bigint;
  v_kod      uuid;
  v_zy       text := left(coalesce(p_ziyaretci, ''), 64);
  v_uid      uuid := auth.uid();
  v_key      text := coalesce(v_uid::text, v_zy);

  v_ara      numeric(10,2) := 0;
  v_sayi     integer := 0;
  v_toplam   integer := 0;
  v_odenecek numeric(10,2);

  v_kupon_kod text := '';
  v_gift_kod  text := '';
  v_indirim  numeric(10,2) := 0;
  v_gift     numeric(10,2) := 0;
  v_kupon_id bigint := null;
  v_gift_id  bigint := null;
  v_deger    json;
  v_tur      text;
  v_metin    text;
  e          jsonb;
  v_bakiye   numeric(10,2);

  v_online   boolean;
  v_durum    text;
  v_odurum   text;
  v_bitis    timestamptz := null;
begin
  if public.ayar('preorder_enabled', '1') <> '1' then
    raise exception 'Ön sipariş şu anda kapalı';
  end if;

  if public.ayar('preorder_require_login', '1') = '1' and v_uid is null then
    raise exception 'Ön sipariş için giriş yapmanız gerekiyor';
  end if;

  v_online := (p_odeme = 'online');

  if v_online and public.ayar('payment_online_enabled', '0') <> '1' then
    raise exception 'Online ödeme şu anda kullanılamıyor, kasada ödemeyi seçin';
  end if;
  if not v_online and public.ayar('payment_cash_enabled', '1') <> '1' then
    raise exception 'Kasada ödeme kapalı, online ödemeyi seçin';
  end if;

  if p_urunler is null or jsonb_typeof(p_urunler) <> 'array' or jsonb_array_length(p_urunler) = 0 then
    raise exception 'Sepetiniz boş';
  end if;
  if jsonb_array_length(p_urunler) > 25 then
    raise exception 'Tek siparişte en fazla 25 farklı ürün olabilir';
  end if;

  ---------- Saat ----------
  v_yerel := p_teslim at time zone 'Europe/Istanbul';

  if v_yerel::date <> v_gun then
    raise exception 'Teslim saati bugünün içinde olmalı';
  end if;
  if v_yerel::time < v_bas or v_yerel::time > v_bit then
    raise exception 'Bu saatte ön sipariş alınmıyor';
  end if;

  v_dakika := extract(epoch from (v_yerel::time - v_bas)) / 60;
  if v_dakika < 0 or (v_dakika % v_adim) <> 0 then
    raise exception 'Geçersiz teslim saati';
  end if;
  if p_teslim < now() + ((v_hazirlik - 1) || ' minutes')::interval then
    raise exception 'Bu saat için çok geç kaldınız, lütfen daha ileri bir saat seçin';
  end if;

  ---------- Kötüye kullanım ----------
  if v_key <> '' then
    if exists (
      select 1 from orders
      where (visitor = v_key or (v_uid is not null and user_id = v_uid))
        and created_at > now() - interval '45 seconds'
    ) then
      raise exception 'Çok hızlı sipariş veriyorsunuz, lütfen biraz bekleyin';
    end if;

    if (select count(*) from orders
        where (visitor = v_key or (v_uid is not null and user_id = v_uid))
          and order_day = v_gun
          and status in ('awaiting_payment', 'new', 'preparing', 'ready')) >= 3 then
      raise exception 'Açık siparişiniz var, önce onu teslim alın';
    end if;
  end if;

  ---------- Kapasite ----------
  perform public.odeme_suresi_gecenler();
  perform pg_advisory_xact_lock(hashtext('lajoie_siparis:' || p_teslim::text)::bigint);

  select count(*) into v_adet
  from orders
  where pickup_at = p_teslim and status <> 'cancelled';

  if v_adet >= v_kap then
    raise exception 'Bu saat doldu, lütfen başka bir saat seçin';
  end if;

  ---------- Numara ----------
  insert into order_counter (order_day, last_no)
  values (v_gun, v_ilkno)
  on conflict (order_day) do update set last_no = order_counter.last_no + 1
  returning last_no into v_no;

  if v_online then
    v_durum  := 'awaiting_payment';
    v_odurum := 'pending';
    v_bitis  := least(now() + (v_tutma || ' minutes')::interval, p_teslim);
  else
    v_durum  := 'new';
    v_odurum := 'none';
  end if;

  insert into orders (table_no, order_day, mode, pickup_at,
                      customer_name, customer_phone, note, visitor, user_id,
                      status, payment_method, payment_status, expires_at)
  values (v_no, v_gun,
          case when p_mod = 'pickup' then 'pickup' else 'dinein' end,
          p_teslim,
          left(btrim(coalesce(p_ad, '')), 60),
          left(btrim(coalesce(p_telefon, '')), 24),
          left(btrim(coalesce(p_not, '')), 300),
          v_zy, v_uid,
          v_durum,
          case when v_online then 'online' else 'cash' end,
          v_odurum, v_bitis)
  returning id, code into v_id, v_kod;

  ---------- Satırlar ----------
  with istek as (
    select (e2 ->> 'id')::bigint as urun_id,
           greatest(least(sum(coalesce((e2 ->> 'qty')::int, 1)), 20), 1) as adet
    from jsonb_array_elements(p_urunler) as e2
    where (e2 ->> 'id') ~ '^[0-9]+$'
    group by 1
  ),
  eklenen as (
    insert into order_items (order_id, product_id, name, unit_price, qty)
    select v_id, p.id, p.name, p.price, i.adet
    from istek i
    join products p on p.id = i.urun_id
    where p.active and p.orderable and not p.sold_out
    returning unit_price, qty
  )
  select coalesce(sum(unit_price * qty), 0), count(*), coalesce(sum(qty), 0)
  into v_ara, v_sayi, v_toplam
  from eklenen;

  if v_sayi = 0 then
    raise exception 'Seçtiğiniz ürünler şu an sipariş edilemiyor';
  end if;

  ---------- Kodlar ----------
  -- Sırayla değerlendirilir; geçersiz kod siparişi düşürür ki müşteri
  -- beklediğinden pahalı bir fatura ile karşılaşmasın.
  if p_kodlar is not null and jsonb_typeof(p_kodlar) = 'array' then
    for e in select * from jsonb_array_elements(p_kodlar) limit 6 loop
      v_metin := btrim(trim(both '"' from e::text));
      continue when v_metin = '';

      v_tur := public.kod_turu(v_metin);

      if v_tur = 'kupon' then
        if v_kupon_kod <> '' then
          raise exception 'Tek siparişte bir kupon kullanılabilir';
        end if;

        perform 1 from coupons where upper(code) = upper(v_metin) for update;
        v_deger := public.kupon_hesapla(v_metin, v_ara, v_key, v_uid is not null);

        if not (v_deger ->> 'ok')::boolean then
          raise exception '%', v_deger ->> 'mesaj';
        end if;

        v_indirim   := (v_deger ->> 'indirim')::numeric;
        v_kupon_id  := (v_deger ->> 'id')::bigint;
        v_kupon_kod := v_deger ->> 'kod';

        update coupons set used_count = used_count + 1 where id = v_kupon_id;
        insert into redemptions (order_id, coupon_id, user_key, amount)
        values (v_id, v_kupon_id, v_key, v_indirim);

      elsif v_tur = 'hediye' then
        if v_gift_kod <> '' then
          raise exception 'Tek siparişte bir hediye kartı kullanılabilir';
        end if;

        select balance into v_bakiye from gift_cards
        where upper(code) = upper(v_metin) for update;

        v_deger := public.hediye_hesapla(v_metin, v_ara - v_indirim);

        if not (v_deger ->> 'ok')::boolean then
          raise exception '%', v_deger ->> 'mesaj';
        end if;

        v_gift     := (v_deger ->> 'kullanilacak')::numeric;
        v_gift_id  := (v_deger ->> 'id')::bigint;
        v_gift_kod := v_deger ->> 'kod';

        update gift_cards set balance = balance - v_gift where id = v_gift_id;
        insert into redemptions (order_id, gift_id, user_key, amount)
        values (v_id, v_gift_id, v_key, v_gift);

      else
        raise exception 'Geçersiz kod: %', v_metin;
      end if;
    end loop;
  end if;

  v_odenecek := v_ara - v_indirim - v_gift;

  update orders
  set subtotal    = v_ara,
      discount    = v_indirim,
      gift_used   = v_gift,
      total       = v_odenecek,
      coupon_code = v_kupon_kod,
      gift_code   = v_gift_kod,
      item_count  = v_toplam
  where id = v_id;

  if v_online and v_odenecek <= 0 then
    update orders
    set status = 'new', payment_status = 'paid', paid_at = now(),
        expires_at = null, payment_method = 'cash'
    where id = v_id;
  end if;

  return (
    select json_build_object(
      'code',           o.code,
      'table_no',       o.table_no,
      'pickup_at',      o.pickup_at,
      'subtotal',       o.subtotal,
      'discount',       o.discount,
      'gift_used',      o.gift_used,
      'total',          o.total,
      'status',         o.status,
      'mode',           o.mode,
      'payment_method', o.payment_method,
      'payment_status', o.payment_status,
      'expires_at',     o.expires_at
    )
    from orders o where o.id = v_id
  );
end;
$$;

-- ============================================================
-- 8) PANEL: KAMPANYA YÖNETİMİ
-- ============================================================

create or replace function public.kampanya_olustur(
  p_slug   text,
  p_ad     text,
  p_tur    text,
  p_deger  numeric,
  p_min    numeric default 0,
  p_tavan  numeric default 0,
  p_gun    integer default 30,
  p_oto    boolean default false,
  p_limit  integer default 0,
  p_not    text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(regexp_replace(coalesce(p_slug, ''), '[^A-Za-z0-9-]', '', 'g'));
  v_id   bigint;
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;
  if char_length(v_slug) < 2 then
    raise exception 'Bağlantı adı en az 2 karakter olmalı (örn: hosgeldin)';
  end if;
  if exists (select 1 from campaigns where slug = v_slug) then
    raise exception 'Bu bağlantı adı kullanılıyor';
  end if;
  if p_tur not in ('percent', 'amount') then
    raise exception 'Geçersiz kupon türü';
  end if;
  if p_tur = 'percent' and (p_deger <= 0 or p_deger > 100) then
    raise exception 'Yüzde 1 ile 100 arasında olmalı';
  end if;

  -- "Herkese" kampanyası tek olabilir; yenisi gelirse eskisi kapanır.
  if p_oto then
    update campaigns set auto_signup = false where auto_signup and active;
  end if;

  insert into campaigns (slug, name, kind, value, min_total, max_discount,
                         valid_days, auto_signup, issue_limit, note)
  values (v_slug, left(btrim(p_ad), 60), p_tur, p_deger,
          greatest(coalesce(p_min, 0), 0), greatest(coalesce(p_tavan, 0), 0),
          greatest(coalesce(p_gun, 0), 0), coalesce(p_oto, false),
          greatest(coalesce(p_limit, 0), 0), left(coalesce(p_not, ''), 160))
  returning id into v_id;

  return json_build_object('id', v_id, 'slug', v_slug);
end;
$$;

create or replace function public.kampanya_durdur(p_id bigint, p_aktif boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;
  update campaigns set active = p_aktif where id = p_id;
end;
$$;

-- Kampanya başarısı: kaç kupon verildi, kaçı kullanıldı, ne ciro getirdi
create or replace function public.kampanya_ozet()
returns table (
  id bigint, slug text, name text, issued integer, used bigint,
  ciro numeric, active boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;

  return query
  select c.id, c.slug, c.name, c.issued_count,
         count(r.id),
         coalesce(sum(o.subtotal), 0),
         c.active
  from campaigns c
  left join coupons k on k.campaign_id = c.id
  left join redemptions r on r.coupon_id = k.id
  left join orders o on o.id = r.order_id and o.status <> 'cancelled'
  group by c.id, c.slug, c.name, c.issued_count, c.active
  order by c.created_at desc;
end;
$$;

-- ============================================================
-- 9) İZİNLER
-- ============================================================
alter table public.campaigns enable row level security;

revoke all on public.campaigns from anon, authenticated;
grant select on public.campaigns to authenticated;

drop policy if exists campaigns_admin_read on public.campaigns;
create policy campaigns_admin_read on public.campaigns
  for select to authenticated using (public.is_admin());

-- Müşteri kendi kuponunu görebilsin (kuponlarim zaten filtreliyor,
-- bu RLS satırı doğrudan tablo okumasını da güvene alır).
drop policy if exists coupons_admin_read on public.coupons;
create policy coupons_admin_read on public.coupons
  for select to authenticated
  using (public.is_admin() or owner_id = auth.uid());

revoke all on function public.kampanya_kuponu_ver(uuid, text)              from public;
revoke all on function public.kampanyaya_katil(text)                       from public;
revoke all on function public.kuponlarim(numeric)                          from public;
revoke all on function public.kod_turu(text)                               from public;
revoke all on function public.indirim_onizle(numeric, jsonb, text)         from public;
revoke all on function public.kampanya_olustur(text, text, text, numeric, numeric, numeric, integer, boolean, integer, text) from public;
revoke all on function public.kampanya_durdur(bigint, boolean)             from public;
revoke all on function public.kampanya_ozet()                              from public;
revoke all on function public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text, jsonb, text) from public;

grant execute on function public.indirim_onizle(numeric, jsonb, text) to anon, authenticated;
grant execute on function public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text, jsonb, text) to anon, authenticated;

grant execute on function public.kuponlarim(numeric)      to authenticated;
grant execute on function public.kampanyaya_katil(text)   to authenticated;

grant execute on function public.kampanya_olustur(text, text, text, numeric, numeric, numeric, integer, boolean, integer, text) to authenticated;
grant execute on function public.kampanya_durdur(bigint, boolean) to authenticated;
grant execute on function public.kampanya_ozet()                  to authenticated;

-- ============================================================
-- 10) ÖRNEK KAMPANYA
-- ============================================================
-- Hesap açan herkese %10, 30 gün geçerli. İstemezseniz panelden kapatın.
insert into public.campaigns (slug, name, kind, value, min_total, valid_days, auto_signup, note)
values ('hosgeldin', 'Hoş geldin indirimi', 'percent', 10, 0, 30, true, 'İlk siparişe özel')
on conflict (slug) do nothing;
