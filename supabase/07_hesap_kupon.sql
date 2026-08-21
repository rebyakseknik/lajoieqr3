-- La Joie Dijital Menü — 7. adım: müşteri hesapları, indirim kuponları, hediye kartları
--
-- Üç ayrı şey ekliyoruz ama hepsi tek bir kurala bağlı:
--   PARAYA DAİR HER HESAP VERİTABANINDA YAPILIR.
-- Tarayıcı "bu kuponla 50 lira indirim var" diyemez; yalnızca kupon kodunu
-- söyler, indirimi buradaki fonksiyon hesaplar ve siparişe yazar.
--
-- Hesap açmak ZORUNLU DEĞİLDİR. Misafir siparişi eskisi gibi çalışır;
-- öğle arası üç dakikası olan müşteriye üyelik dayatmak sistemi öldürür.

-- ============================================================
-- 1) MÜŞTERİ PROFİLLERİ
-- ============================================================
-- Kimlik doğrulamayı Supabase Auth yapar. Burada yalnızca
-- ada/telefona benzer görünür bilgiler durur. Şifre burada yok.

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '' check (char_length(name)  <= 60),
  phone      text not null default '' check (char_length(phone) <= 24),
  created_at timestamptz not null default now()
);

-- Yeni kullanıcı kaydolduğunda profili kendiliğinden açılsın.
create or replace function public.profil_ac()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, name, phone)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name',  ''), 60),
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 24)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profil_ac_tetik on auth.users;
create trigger profil_ac_tetik
  after insert on auth.users
  for each row execute function public.profil_ac();

-- Zaten kayıtlı olanlar için (yöneticiler dahil) eksik profilleri tamamla.
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

alter table public.profiles enable row level security;

grant select, update on public.profiles to authenticated;

drop policy if exists profiles_self_read  on public.profiles;
drop policy if exists profiles_self_write on public.profiles;
drop policy if exists profiles_admin_read on public.profiles;

-- Kişi yalnızca kendi profilini görür ve düzenler.
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy profiles_self_write on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 2) SİPARİŞE YENİ ALANLAR
-- ============================================================
-- Tutar artık tek parça değil. Müşterinin kasada ödeyeceği rakamla
-- yediğinin gerçek bedelini ayrı tutuyoruz ki ciro raporu doğru olsun.

alter table public.orders
  add column if not exists user_id     uuid references auth.users (id) on delete set null,
  add column if not exists subtotal    numeric(10,2) not null default 0,  -- ürünlerin toplamı
  add column if not exists discount    numeric(10,2) not null default 0,  -- kupon indirimi
  add column if not exists gift_used   numeric(10,2) not null default 0,  -- hediye kartından düşen
  add column if not exists coupon_code text not null default '',
  add column if not exists gift_code   text not null default '',
  add column if not exists refunded    boolean not null default false;    -- iptalde iade yapıldı mı

create index if not exists orders_kullanici_idx on public.orders (user_id, created_at desc);

-- Eski siparişlerde subtotal boş kalmasın.
update public.orders set subtotal = total where subtotal = 0 and total > 0;

-- ============================================================
-- 3) İNDİRİM KUPONLARI
-- ============================================================

create table if not exists public.coupons (
  id            bigint generated always as identity primary key,
  code          text not null unique check (char_length(code) between 3 and 24),

  kind          text not null default 'percent' check (kind in ('percent', 'amount')),
  value         numeric(10,2) not null check (value > 0),

  min_total     numeric(10,2) not null default 0 check (min_total >= 0),
  max_discount  numeric(10,2) not null default 0 check (max_discount >= 0), -- 0 = sınırsız

  starts_at     timestamptz,
  ends_at       timestamptz,

  usage_limit   integer not null default 0 check (usage_limit >= 0),  -- 0 = sınırsız
  used_count    integer not null default 0,
  per_user      integer not null default 1 check (per_user >= 0),     -- 0 = sınırsız

  members_only  boolean not null default false,  -- yalnızca üyeler
  note          text    not null default '' check (char_length(note) <= 120),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Kodlar büyük harfe normalize edilir; "yaz20" ile "YAZ20" aynı kupondur.
create unique index if not exists coupons_code_upper_idx on public.coupons (upper(code));

-- ============================================================
-- 4) HEDİYE KARTLARI
-- ============================================================
-- Kupon indirim yapar, hediye kartı bakiye taşır. Kısmen harcanır,
-- kalanı kartta durur. Bu yüzden ayrı tablo.

create table if not exists public.gift_cards (
  id          bigint generated always as identity primary key,
  code        text not null unique check (char_length(code) between 6 and 24),

  initial     numeric(10,2) not null check (initial > 0),
  balance     numeric(10,2) not null check (balance >= 0),

  owner_id    uuid references auth.users (id) on delete set null, -- hesabına eklediyse
  buyer_note  text not null default '' check (char_length(buyer_note) <= 120),

  expires_at  timestamptz,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists gift_cards_code_upper_idx on public.gift_cards (upper(code));
create index if not exists gift_cards_owner_idx on public.gift_cards (owner_id);

-- ============================================================
-- 5) KULLANIM KAYDI
-- ============================================================
-- Kim, hangi siparişte, ne kadar kullandı. İptalde iadeyi bu tablo sayesinde
-- tek seferlik yapabiliyoruz.

create table if not exists public.redemptions (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references public.orders (id) on delete cascade,
  coupon_id   bigint references public.coupons (id)    on delete set null,
  gift_id     bigint references public.gift_cards (id) on delete set null,
  user_key    text   not null default '',   -- user_id ya da cihaz kimliği
  amount      numeric(10,2) not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists redemptions_siparis_idx on public.redemptions (order_id);
create index if not exists redemptions_kupon_idx   on public.redemptions (coupon_id, user_key);

-- ============================================================
-- 6) KOD ÜRETİCİ
-- ============================================================
-- Karışan harfler (0/O, 1/I/L) elenmiş alfabe. Hediye kartı kodu
-- para demektir; tahmin edilememesi için 12 karakter kullanıyoruz.

create or replace function public.kod_uret(p_uzunluk integer default 12)
returns text
language plpgsql
as $$
declare
  v_alfabe text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_sonuc  text := '';
  i        integer;
begin
  for i in 1..p_uzunluk loop
    v_sonuc := v_sonuc || substr(v_alfabe, 1 + floor(random() * length(v_alfabe))::int, 1);
  end loop;
  return v_sonuc;
end;
$$;

-- ============================================================
-- 7) KUPON / HEDİYE KARTI HESABI
-- ============================================================
-- Hem ön izleme (müşteri kodu yazınca) hem de sipariş anında
-- aynı fonksiyon çalışır. Böylece gösterilen indirimle uygulanan
-- indirim asla farklı olamaz.

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
      'mesaj', 'Bu kupon en az ' || trim(to_char(k.min_total, 'FM999999990.00')) || ' TL sipariş içindir'
    );
  end if;

  -- Kişi başı sınır
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

  -- İndirim
  if k.kind = 'percent' then
    v_indirim := round(p_tutar * k.value / 100, 2);
    if k.max_discount > 0 then
      v_indirim := least(v_indirim, k.max_discount);
    end if;
  else
    v_indirim := k.value;
  end if;

  v_indirim := least(v_indirim, p_tutar);   -- indirim tutarı aşamaz

  return json_build_object(
    'ok', true,
    'id', k.id,
    'kod', k.code,
    'indirim', v_indirim,
    'mesaj', case when k.kind = 'percent'
                  then '%' || trim(to_char(k.value, 'FM999990.99')) || ' indirim uygulandı'
                  else 'İndirim uygulandı' end
  );
end;
$$;

-- Hediye kartı: kalan bakiyeyi ve uygulanabilir tutarı söyler.
create or replace function public.hediye_hesapla(p_kod text, p_tutar numeric)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  h gift_cards%rowtype;
begin
  select * into h from gift_cards where upper(code) = upper(btrim(p_kod));

  if h.id is null then
    return json_build_object('ok', false, 'mesaj', 'Böyle bir hediye kartı yok');
  end if;
  if not h.active then
    return json_build_object('ok', false, 'mesaj', 'Bu kart kullanıma kapalı');
  end if;
  if h.expires_at is not null and now() > h.expires_at then
    return json_build_object('ok', false, 'mesaj', 'Bu kartın süresi doldu');
  end if;
  if h.balance <= 0 then
    return json_build_object('ok', false, 'mesaj', 'Bu kartta bakiye kalmamış');
  end if;

  return json_build_object(
    'ok', true,
    'id', h.id,
    'kod', h.code,
    'bakiye', h.balance,
    'kullanilacak', least(h.balance, p_tutar),
    'mesaj', 'Kart bakiyesi: ' || trim(to_char(h.balance, 'FM999999990.00')) || ' TL'
  );
end;
$$;

-- Müşterinin sepet ekranında gördüğü ön izleme.
create or replace function public.indirim_onizle(
  p_tutar     numeric,
  p_kupon     text default '',
  p_hediye    text default '',
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
  v_kupon   json := null;
  v_hediye  json := null;
  v_kalan   numeric(10,2) := greatest(coalesce(p_tutar, 0), 0);
  v_indirim numeric(10,2) := 0;
  v_gift    numeric(10,2) := 0;
begin
  if coalesce(btrim(p_kupon), '') <> '' then
    v_kupon := public.kupon_hesapla(p_kupon, v_kalan, v_key, v_uye);
    if (v_kupon ->> 'ok')::boolean then
      v_indirim := (v_kupon ->> 'indirim')::numeric;
      v_kalan := v_kalan - v_indirim;
    end if;
  end if;

  if coalesce(btrim(p_hediye), '') <> '' then
    v_hediye := public.hediye_hesapla(p_hediye, v_kalan);
    if (v_hediye ->> 'ok')::boolean then
      v_gift := (v_hediye ->> 'kullanilacak')::numeric;
      v_kalan := v_kalan - v_gift;
    end if;
  end if;

  return json_build_object(
    'ara_toplam', p_tutar,
    'indirim',    v_indirim,
    'hediye',     v_gift,
    'odenecek',   v_kalan,
    'kupon',      v_kupon,
    'hediye_kart', v_hediye
  );
end;
$$;

-- ============================================================
-- 8) SİPARİŞ OLUŞTURMA — kupon destekli sürüm
-- ============================================================
-- Eski imzayı bırakırsak iki fonksiyon birbirine karışır; kaldırıyoruz.
drop function if exists public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text);

create or replace function public.siparis_olustur(
  p_urunler   jsonb,
  p_teslim    timestamptz,
  p_mod       text default 'dinein',
  p_ad        text default '',
  p_telefon   text default '',
  p_not       text default '',
  p_ziyaretci text default '',
  p_kupon     text default '',
  p_hediye    text default ''
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

  v_kupon    json;
  v_hediye   json;
  v_indirim  numeric(10,2) := 0;
  v_gift     numeric(10,2) := 0;
  v_kupon_id bigint := null;
  v_gift_id  bigint := null;
  v_kupon_kod text := '';
  v_gift_kod  text := '';
  v_bakiye   numeric(10,2);
begin
  if public.ayar('preorder_enabled', '1') <> '1' then
    raise exception 'Ön sipariş şu anda kapalı';
  end if;

  ---------- Sepet sağlaması ----------
  if p_urunler is null or jsonb_typeof(p_urunler) <> 'array' or jsonb_array_length(p_urunler) = 0 then
    raise exception 'Sepetiniz boş';
  end if;
  if jsonb_array_length(p_urunler) > 25 then
    raise exception 'Tek siparişte en fazla 25 farklı ürün olabilir';
  end if;

  ---------- Saat sağlaması ----------
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

  ---------- Kötüye kullanım sınırı ----------
  if v_key <> '' then
    if exists (
      select 1 from orders
      where (visitor = v_key or user_id::text = v_key)
        and created_at > now() - interval '45 seconds'
    ) then
      raise exception 'Çok hızlı sipariş veriyorsunuz, lütfen biraz bekleyin';
    end if;

    if (select count(*) from orders
        where (visitor = v_key or user_id = v_uid)
          and order_day = v_gun
          and status in ('new', 'preparing', 'ready')) >= 3 then
      raise exception 'Açık siparişiniz var, önce onu teslim alın';
    end if;
  end if;

  ---------- Kapasite ----------
  perform pg_advisory_xact_lock(hashtext('lajoie_siparis:' || p_teslim::text)::bigint);

  select count(*) into v_adet
  from orders
  where pickup_at = p_teslim and status <> 'cancelled';

  if v_adet >= v_kap then
    raise exception 'Bu saat doldu, lütfen başka bir saat seçin';
  end if;

  ---------- Numara ver ----------
  insert into order_counter (order_day, last_no)
  values (v_gun, v_ilkno)
  on conflict (order_day) do update set last_no = order_counter.last_no + 1
  returning last_no into v_no;

  ---------- Siparişi aç ----------
  insert into orders (table_no, order_day, mode, pickup_at,
                      customer_name, customer_phone, note, visitor, user_id)
  values (v_no, v_gun,
          case when p_mod = 'pickup' then 'pickup' else 'dinein' end,
          p_teslim,
          left(btrim(coalesce(p_ad, '')), 60),
          left(btrim(coalesce(p_telefon, '')), 24),
          left(btrim(coalesce(p_not, '')), 300),
          v_zy, v_uid)
  returning id, code into v_id, v_kod;

  ---------- Satırlar: fiyat DAİMA veritabanından ----------
  -- Aynı ürün sepette birden çok satırda geçtiyse birleştiriyoruz.
  with istek as (
    select (e ->> 'id')::bigint as urun_id,
           greatest(least(sum(coalesce((e ->> 'qty')::int, 1)), 20), 1) as adet
    from jsonb_array_elements(p_urunler) as e
    where (e ->> 'id') ~ '^[0-9]+$'
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

  ---------- Kupon ----------
  if coalesce(btrim(p_kupon), '') <> '' then
    -- Satırı kilitliyoruz: son kullanım hakkını iki kişi aynı anda kapamasın.
    perform 1 from coupons where upper(code) = upper(btrim(p_kupon)) for update;

    v_kupon := public.kupon_hesapla(p_kupon, v_ara, v_key, v_uid is not null);

    if not (v_kupon ->> 'ok')::boolean then
      raise exception '%', v_kupon ->> 'mesaj';
    end if;

    v_indirim   := (v_kupon ->> 'indirim')::numeric;
    v_kupon_id  := (v_kupon ->> 'id')::bigint;
    v_kupon_kod := v_kupon ->> 'kod';

    update coupons set used_count = used_count + 1 where id = v_kupon_id;

    insert into redemptions (order_id, coupon_id, user_key, amount)
    values (v_id, v_kupon_id, v_key, v_indirim);
  end if;

  ---------- Hediye kartı ----------
  if coalesce(btrim(p_hediye), '') <> '' then
    -- Bakiye düşürmeden önce kilit şart: aynı kart iki siparişte
    -- aynı anda kullanılırsa bakiye eksiye düşebilirdi.
    select balance into v_bakiye
    from gift_cards
    where upper(code) = upper(btrim(p_hediye))
    for update;

    v_hediye := public.hediye_hesapla(p_hediye, v_ara - v_indirim);

    if not (v_hediye ->> 'ok')::boolean then
      raise exception '%', v_hediye ->> 'mesaj';
    end if;

    v_gift     := (v_hediye ->> 'kullanilacak')::numeric;
    v_gift_id  := (v_hediye ->> 'id')::bigint;
    v_gift_kod := v_hediye ->> 'kod';

    update gift_cards set balance = balance - v_gift where id = v_gift_id;

    insert into redemptions (order_id, gift_id, user_key, amount)
    values (v_id, v_gift_id, v_key, v_gift);
  end if;

  ---------- Tutarları yaz ----------
  update orders
  set subtotal    = v_ara,
      discount    = v_indirim,
      gift_used   = v_gift,
      total       = v_ara - v_indirim - v_gift,   -- kasada ödenecek
      coupon_code = v_kupon_kod,
      gift_code   = v_gift_kod,
      item_count  = v_toplam
  where id = v_id;

  return (
    select json_build_object(
      'code',      o.code,
      'table_no',  o.table_no,
      'pickup_at', o.pickup_at,
      'subtotal',  o.subtotal,
      'discount',  o.discount,
      'gift_used', o.gift_used,
      'total',     o.total,
      'status',    o.status,
      'mode',      o.mode
    )
    from orders o where o.id = v_id
  );
end;
$$;

-- ============================================================
-- 9) İPTALDE İADE
-- ============================================================
-- Sipariş iptal edilirse hediye kartındaki para geri yüklenmeli,
-- kuponun kullanım hakkı geri verilmeli. Aksi halde müşterinin
-- parası buharlaşır. refunded bayrağı iki kez iade etmeyi engeller.

create or replace function public.siparis_iade(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if (select refunded from orders where id = p_id) then
    return;
  end if;

  for r in select * from redemptions where order_id = p_id loop
    if r.gift_id is not null then
      update gift_cards set balance = balance + r.amount where id = r.gift_id;
    end if;
    if r.coupon_id is not null then
      update coupons set used_count = greatest(used_count - 1, 0) where id = r.coupon_id;
    end if;
  end loop;

  update orders set refunded = true where id = p_id;
end;
$$;

-- Durum değiştirme fonksiyonunu iade yapacak şekilde yeniliyoruz.
create or replace function public.siparis_durum(
  p_id bigint,
  p_durum text,
  p_sebep text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;
  if p_durum not in ('new', 'preparing', 'ready', 'done', 'cancelled') then
    raise exception 'Geçersiz durum';
  end if;

  update orders
  set status = p_durum,
      seen   = true,
      cancel_reason = case when p_durum = 'cancelled' then left(coalesce(p_sebep, ''), 160)
                           else cancel_reason end,
      updated_at = now()
  where id = p_id;

  if p_durum = 'cancelled' then
    perform public.siparis_iade(p_id);
  end if;
end;
$$;

create or replace function public.siparis_vazgec(p_kod uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_durum text;
  v_id    bigint;
begin
  select id, status into v_id, v_durum from orders where code = p_kod;
  if v_id is null then
    raise exception 'Sipariş bulunamadı';
  end if;
  if v_durum <> 'new' then
    raise exception 'Sipariş hazırlanmaya başladı, iptal edemezsiniz';
  end if;

  update orders
  set status = 'cancelled', cancel_reason = 'Müşteri vazgeçti', updated_at = now()
  where id = v_id;

  perform public.siparis_iade(v_id);

  return public.siparis_getir(p_kod);
end;
$$;

-- Takip ekranı artık indirim dökümünü de göstersin.
create or replace function public.siparis_getir(p_kod uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sonuc json;
begin
  select json_build_object(
    'code',       o.code,
    'table_no',   o.table_no,
    'status',     o.status,
    'mode',       o.mode,
    'pickup_at',  o.pickup_at,
    'subtotal',   o.subtotal,
    'discount',   o.discount,
    'gift_used',  o.gift_used,
    'coupon_code', o.coupon_code,
    'total',      o.total,
    'note',       o.note,
    'cancel_reason', o.cancel_reason,
    'created_at', o.created_at,
    'items', coalesce((
      select json_agg(json_build_object('name', i.name, 'qty', i.qty, 'unit_price', i.unit_price)
                      order by i.id)
      from order_items i where i.order_id = o.id
    ), '[]'::json)
  ) into sonuc
  from orders o
  where o.code = p_kod
    and o.created_at > now() - interval '2 days';

  if sonuc is null then
    raise exception 'Sipariş bulunamadı';
  end if;
  return sonuc;
end;
$$;

-- ============================================================
-- 10) MÜŞTERİNİN KENDİ EKRANLARI
-- ============================================================

-- Geçmiş siparişlerim
create or replace function public.siparislerim(p_sinir integer default 20)
returns table (
  code uuid, table_no integer, status text, pickup_at timestamptz,
  total numeric, item_count integer, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısınız';
  end if;

  return query
  select o.code, o.table_no, o.status, o.pickup_at, o.total, o.item_count, o.created_at
  from orders o
  where o.user_id = auth.uid()
  order by o.created_at desc
  limit greatest(least(p_sinir, 50), 1);
end;
$$;

-- Giriş yapınca, aynı cihazdan misafir olarak verilmiş siparişleri
-- hesaba bağlar. Böylece "üye olmadan sipariş verdim, sonra üye oldum"
-- durumunda geçmiş kaybolmaz.
create or replace function public.siparis_sahiplen(p_ziyaretci text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adet integer;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısınız';
  end if;
  if coalesce(btrim(p_ziyaretci), '') = '' then
    return 0;
  end if;

  update orders
  set user_id = auth.uid()
  where visitor = left(p_ziyaretci, 64)
    and user_id is null
    and created_at > now() - interval '30 days';

  get diagnostics v_adet = row_count;
  return v_adet;
end;
$$;

-- Cüzdanım: hesaba eklenmiş hediye kartları
create or replace function public.kartlarim()
returns table (code text, balance numeric, expires_at timestamptz, active boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısınız';
  end if;

  return query
  select g.code, g.balance, g.expires_at, g.active
  from gift_cards g
  where g.owner_id = auth.uid()
  order by g.created_at desc;
end;
$$;

-- Hediye kartını hesabıma ekle (kodu bilen sahiplenir)
create or replace function public.kart_ekle(p_kod text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  h gift_cards%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısınız';
  end if;

  select * into h from gift_cards where upper(code) = upper(btrim(p_kod)) for update;

  if h.id is null then
    raise exception 'Böyle bir hediye kartı yok';
  end if;
  if h.owner_id is not null and h.owner_id <> auth.uid() then
    raise exception 'Bu kart başka bir hesaba eklenmiş';
  end if;

  update gift_cards set owner_id = auth.uid() where id = h.id;

  return json_build_object('kod', h.code, 'bakiye', h.balance);
end;
$$;

-- ============================================================
-- 11) PANEL FONKSİYONLARI
-- ============================================================

create or replace function public.kupon_olustur(
  p_kod    text,
  p_tur    text,
  p_deger  numeric,
  p_min    numeric default 0,
  p_tavan  numeric default 0,
  p_bitis  timestamptz default null,
  p_limit  integer default 0,
  p_kisi   integer default 1,
  p_uye    boolean default false,
  p_not    text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kod text := upper(regexp_replace(coalesce(p_kod, ''), '[^A-Za-z0-9]', '', 'g'));
  v_id  bigint;
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;
  if v_kod = '' then
    v_kod := 'LJ' || public.kod_uret(6);
  end if;
  if char_length(v_kod) < 3 then
    raise exception 'Kupon kodu en az 3 karakter olmalı';
  end if;
  if exists (select 1 from coupons where upper(code) = v_kod) then
    raise exception 'Bu kod zaten kullanılıyor';
  end if;
  if p_tur not in ('percent', 'amount') then
    raise exception 'Geçersiz kupon türü';
  end if;
  if p_tur = 'percent' and (p_deger <= 0 or p_deger > 100) then
    raise exception 'Yüzde 1 ile 100 arasında olmalı';
  end if;

  insert into coupons (code, kind, value, min_total, max_discount,
                       ends_at, usage_limit, per_user, members_only, note)
  values (v_kod, p_tur, p_deger, greatest(coalesce(p_min, 0), 0),
          greatest(coalesce(p_tavan, 0), 0), p_bitis,
          greatest(coalesce(p_limit, 0), 0), greatest(coalesce(p_kisi, 0), 0),
          coalesce(p_uye, false), left(coalesce(p_not, ''), 120))
  returning id into v_id;

  return json_build_object('id', v_id, 'kod', v_kod);
end;
$$;

create or replace function public.hediye_olustur(
  p_tutar  numeric,
  p_bitis  timestamptz default null,
  p_not    text default '',
  p_adet   integer default 1
)
returns table (code text, balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kod text;
  i     integer;
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;
  if coalesce(p_tutar, 0) <= 0 then
    raise exception 'Tutar sıfırdan büyük olmalı';
  end if;
  if p_adet < 1 or p_adet > 50 then
    raise exception 'Tek seferde 1 ile 50 arası kart üretilebilir';
  end if;

  for i in 1..p_adet loop
    -- Çok düşük ihtimalle çakışırsa yeniden dener.
    loop
      v_kod := public.kod_uret(12);
      exit when not exists (select 1 from gift_cards g where g.code = v_kod);
    end loop;

    insert into gift_cards (code, initial, balance, expires_at, buyer_note)
    values (v_kod, p_tutar, p_tutar, p_bitis, left(coalesce(p_not, ''), 120));

    code := v_kod;
    balance := p_tutar;
    return next;
  end loop;
end;
$$;

create or replace function public.kupon_durdur(p_id bigint, p_aktif boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;
  update coupons set active = p_aktif where id = p_id;
end;
$$;

create or replace function public.hediye_durdur(p_id bigint, p_aktif boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;
  update gift_cards set active = p_aktif where id = p_id;
end;
$$;

-- ============================================================
-- 12) İZİNLER
-- ============================================================

alter table public.coupons     enable row level security;
alter table public.gift_cards  enable row level security;
alter table public.redemptions enable row level security;

-- Kupon ve kart tabloları tarayıcıya AÇILMAZ. Kod listesi sızarsa
-- herkes bedava yer. Sorgulama yalnızca fonksiyonlarla, kod bilerek yapılır.
revoke all on public.coupons, public.gift_cards, public.redemptions from anon, authenticated;
grant select on public.coupons, public.gift_cards, public.redemptions to authenticated;

drop policy if exists coupons_admin_read     on public.coupons;
drop policy if exists gift_cards_admin_read  on public.gift_cards;
drop policy if exists redemptions_admin_read on public.redemptions;

create policy coupons_admin_read on public.coupons
  for select to authenticated using (public.is_admin());

-- Müşteri yalnızca kendi hesabına eklediği kartı görebilir.
create policy gift_cards_admin_read on public.gift_cards
  for select to authenticated using (public.is_admin() or owner_id = auth.uid());

create policy redemptions_admin_read on public.redemptions
  for select to authenticated using (public.is_admin());

-- Sipariş okuma: yönetici hepsini, müşteri yalnızca kendisininkini.
drop policy if exists orders_admin_read      on public.orders;
drop policy if exists order_items_admin_read on public.order_items;

create policy orders_admin_read on public.orders
  for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

create policy order_items_admin_read on public.order_items
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid())
  );

-- Fonksiyon izinleri
revoke all on function public.kod_uret(integer)                                from public;
revoke all on function public.kupon_hesapla(text, numeric, text, boolean)      from public;
revoke all on function public.hediye_hesapla(text, numeric)                    from public;
revoke all on function public.indirim_onizle(numeric, text, text, text)        from public;
revoke all on function public.siparis_iade(bigint)                             from public;
revoke all on function public.siparislerim(integer)                            from public;
revoke all on function public.siparis_sahiplen(text)                           from public;
revoke all on function public.kartlarim()                                      from public;
revoke all on function public.kart_ekle(text)                                  from public;
revoke all on function public.kupon_olustur(text, text, numeric, numeric, numeric, timestamptz, integer, integer, boolean, text) from public;
revoke all on function public.hediye_olustur(numeric, timestamptz, text, integer) from public;
revoke all on function public.kupon_durdur(bigint, boolean)                    from public;
revoke all on function public.hediye_durdur(bigint, boolean)                   from public;
revoke all on function public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text, text, text) from public;

-- kupon_hesapla ve hediye_hesapla doğrudan çağrılmaz; indirim_onizle üzerinden
-- kullanılır. Böylece kod deneme yüzeyi tek bir noktada kalır.
grant execute on function public.indirim_onizle(numeric, text, text, text) to anon, authenticated;
grant execute on function public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text, text, text) to anon, authenticated;

grant execute on function public.siparislerim(integer)      to authenticated;
grant execute on function public.siparis_sahiplen(text)     to authenticated;
grant execute on function public.kartlarim()                to authenticated;
grant execute on function public.kart_ekle(text)            to authenticated;

grant execute on function public.kupon_olustur(text, text, numeric, numeric, numeric, timestamptz, integer, integer, boolean, text) to authenticated;
grant execute on function public.hediye_olustur(numeric, timestamptz, text, integer) to authenticated;
grant execute on function public.kupon_durdur(bigint, boolean)  to authenticated;
grant execute on function public.hediye_durdur(bigint, boolean) to authenticated;
