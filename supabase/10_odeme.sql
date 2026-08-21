-- La Joie Dijital Menü — 10. adım: ödeme katmanı (kasada / online)
--
-- Tasarım ilkesi: bu dosya SAĞLAYICIDAN BAĞIMSIZ. PayTR, iyzico ya da
-- başka bir sağlayıcı seçilse de tablolar ve akış aynı kalır; değişen
-- tek şey sunucudaki webhook kodudur.
--
-- İki ödeme yolu:
--   cash   : kasada ödenir. Sipariş anında mutfağa düşer (bugünkü davranış).
--   online : sipariş 'awaiting_payment' durumunda açılır, MUTFAĞA DÜŞMEZ.
--            Sağlayıcıdan "ödendi" bildirimi gelince 'new' olur.
--
-- En kritik kural: ödeme onayını YALNIZCA sunucu (service_role) verebilir.
-- Tarayıcı "ödedim" diyemez.

-- ---------- Ayarlar ----------
insert into public.settings (key, value) values
  ('payment_online_enabled', '0'),   -- sağlayıcı hazır olunca 1 yapın
  ('payment_provider',       ''),    -- 'paytr' | 'iyzico' | ''
  ('payment_hold_minutes',   '15'),  -- ödenmeyen sipariş kaç dakika yer tutar
  ('payment_cash_enabled',   '1')    -- kasada ödeme açık mı
on conflict (key) do nothing;

-- ---------- Siparişe ödeme alanları ----------
alter table public.orders
  add column if not exists payment_method text not null default 'cash'
    check (payment_method in ('cash', 'online')),
  add column if not exists payment_status text not null default 'none'
    check (payment_status in ('none', 'pending', 'paid', 'failed', 'refunded')),
  add column if not exists paid_at    timestamptz,
  add column if not exists expires_at timestamptz;   -- ödeme beklerken son an

create index if not exists orders_odeme_idx on public.orders (payment_status, expires_at);

-- ---------- Yeni sipariş durumu ----------
-- Eski kısıtı kaldırıp 'awaiting_payment' ekliyoruz.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('awaiting_payment', 'new', 'preparing', 'ready', 'done', 'cancelled'));

-- ---------- Ödeme denemeleri ----------
-- Her deneme için ayrı satır. Sebebi: sağlayıcılar aynı sipariş numarasıyla
-- ikinci kez ödeme denemesini reddeder, o yüzden her denemeye yeni bir
-- "oid" üretiyoruz. Hangi oid hangi siparişe ait, burada tutulur.
create table if not exists public.payments (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references public.orders (id) on delete cascade,
  oid         text   not null unique,      -- sağlayıcıya gönderilen sipariş no
  provider    text   not null default '',
  amount      numeric(10,2) not null check (amount > 0),
  status      text   not null default 'pending'
                check (status in ('pending', 'paid', 'failed')),
  fail_reason text   not null default '' check (char_length(fail_reason) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists payments_siparis_idx on public.payments (order_id, created_at desc);

-- ---------- Süresi geçen ödemeleri temizle ----------
-- Ödemesi tamamlanmayan sipariş, saat dilimini sonsuza kadar tutmasın.
-- Kupon ve hediye kartı iadesi siparis_iade ile yapılır.
create or replace function public.odeme_suresi_gecenler()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_adet integer := 0;
begin
  for r in
    select id from orders
    where status = 'awaiting_payment'
      and expires_at is not null
      and expires_at < now()
    for update skip locked
  loop
    update orders
    set status = 'cancelled',
        payment_status = 'failed',
        cancel_reason = 'Ödeme tamamlanmadı',
        updated_at = now()
    where id = r.id;

    perform public.siparis_iade(r.id);
    v_adet := v_adet + 1;
  end loop;

  update payments p
  set status = 'failed',
      fail_reason = 'Süre doldu',
      updated_at = now()
  where p.status = 'pending'
    and exists (select 1 from orders o where o.id = p.order_id and o.status = 'cancelled');

  return v_adet;
end;
$$;

-- ---------- Boş slotlar: ödeme bekleyenleri de sayar ----------
-- Ödemesi süren sipariş yeri tutar (müşteri kart bilgisi girerken
-- yerini kaptırmasın), süresi geçmişse tutmaz.
create or replace function public.siparis_slotlari()
returns table (slot timestamptz, dolu integer, kapasite integer, musait boolean)
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
  v_gun      date    := public.yerel_gun();
  v_ilk      timestamptz;
begin
  if public.ayar('preorder_enabled', '1') <> '1' then
    return;
  end if;

  -- Yeri boşa tutan ölü siparişleri önce temizle.
  perform public.odeme_suresi_gecenler();

  v_ilk := date_trunc('hour', now() + (v_hazirlik || ' minutes')::interval)
           + (ceil(extract(minute from now() + (v_hazirlik || ' minutes')::interval) / v_adim) * v_adim
              || ' minutes')::interval;

  return query
  select d,
         coalesce(s.adet, 0)::integer,
         v_kap,
         coalesce(s.adet, 0) < v_kap
  from generate_series(
         ((v_gun + v_bas) at time zone 'Europe/Istanbul'),
         ((v_gun + v_bit) at time zone 'Europe/Istanbul'),
         (v_adim || ' minutes')::interval
       ) as d
  left join lateral (
    select count(*) as adet
    from orders o
    where o.pickup_at = d
      and o.status <> 'cancelled'
  ) s on true
  where d >= v_ilk
  order by d;
end;
$$;

-- ---------- Sipariş oluşturma: ödeme yolu seçimi ----------
drop function if exists public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text, text, text);

create or replace function public.siparis_olustur(
  p_urunler   jsonb,
  p_teslim    timestamptz,
  p_mod       text default 'dinein',
  p_ad        text default '',
  p_telefon   text default '',
  p_not       text default '',
  p_ziyaretci text default '',
  p_kupon     text default '',
  p_hediye    text default '',
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

  v_kupon    json;
  v_hediye   json;
  v_indirim  numeric(10,2) := 0;
  v_gift     numeric(10,2) := 0;
  v_kupon_id bigint := null;
  v_gift_id  bigint := null;
  v_kupon_kod text := '';
  v_gift_kod  text := '';
  v_bakiye   numeric(10,2);

  v_online   boolean;
  v_durum    text;
  v_odurum   text;
  v_bitis    timestamptz := null;
begin
  if public.ayar('preorder_enabled', '1') <> '1' then
    raise exception 'Ön sipariş şu anda kapalı';
  end if;

  ---------- Giriş zorunluluğu ----------
  if public.ayar('preorder_require_login', '1') = '1' and v_uid is null then
    raise exception 'Ön sipariş için giriş yapmanız gerekiyor';
  end if;

  ---------- Ödeme yolu ----------
  v_online := (p_odeme = 'online');

  if v_online and public.ayar('payment_online_enabled', '0') <> '1' then
    raise exception 'Online ödeme şu anda kullanılamıyor, kasada ödemeyi seçin';
  end if;
  if not v_online and public.ayar('payment_cash_enabled', '1') <> '1' then
    raise exception 'Kasada ödeme kapalı, online ödemeyi seçin';
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

  ---------- Numara ver ----------
  insert into order_counter (order_day, last_no)
  values (v_gun, v_ilkno)
  on conflict (order_day) do update set last_no = order_counter.last_no + 1
  returning last_no into v_no;

  ---------- Durum ----------
  if v_online then
    v_durum  := 'awaiting_payment';
    v_odurum := 'pending';
    v_bitis  := least(now() + (v_tutma || ' minutes')::interval, p_teslim);
  else
    v_durum  := 'new';
    v_odurum := 'none';
  end if;

  ---------- Siparişi aç ----------
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

  ---------- Satırlar: fiyat DAİMA veritabanından ----------
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

  v_odenecek := v_ara - v_indirim - v_gift;

  ---------- Tutarları yaz ----------
  update orders
  set subtotal    = v_ara,
      discount    = v_indirim,
      gift_used   = v_gift,
      total       = v_odenecek,
      coupon_code = v_kupon_kod,
      gift_code   = v_gift_kod,
      item_count  = v_toplam
  where id = v_id;

  ---------- Hediye kartı her şeyi kapattıysa ----------
  -- Ödenecek tutar sıfırsa online ödemeye gerek yok; sipariş doğrudan geçer.
  if v_online and v_odenecek <= 0 then
    update orders
    set status = 'new', payment_status = 'paid', paid_at = now(),
        expires_at = null, payment_method = 'cash'
    where id = v_id;
    v_durum := 'new';
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

-- ---------- Ödeme denemesi başlat ----------
-- Sunucudaki fonksiyon önce bunu çağırır, dönen oid'yi sağlayıcıya gönderir.
-- Böylece "hangi oid hangi sipariş" eşlemesi veritabanında durur.
create or replace function public.odeme_denemesi_ac(p_kod uuid, p_saglayici text default '')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  o   orders%rowtype;
  v_oid text;
begin
  select * into o from orders where code = p_kod for update;

  if o.id is null then
    raise exception 'Sipariş bulunamadı';
  end if;
  if o.payment_status = 'paid' then
    raise exception 'Bu sipariş zaten ödenmiş';
  end if;
  if o.status <> 'awaiting_payment' then
    raise exception 'Bu sipariş ödeme beklemiyor';
  end if;
  if o.expires_at is not null and o.expires_at < now() then
    raise exception 'Ödeme süresi doldu, siparişi yeniden verin';
  end if;
  if o.total <= 0 then
    raise exception 'Ödenecek tutar yok';
  end if;

  -- Sağlayıcılar oid'de yalnızca harf ve rakam kabul eder.
  loop
    v_oid := 'LJ' || to_char(now(), 'YYMMDD') || public.kod_uret(8);
    exit when not exists (select 1 from payments where oid = v_oid);
  end loop;

  insert into payments (order_id, oid, provider, amount)
  values (o.id, v_oid,
          coalesce(nullif(p_saglayici, ''), public.ayar('payment_provider', '')),
          o.total);

  return json_build_object(
    'oid',        v_oid,
    'amount',     o.total,
    'table_no',   o.table_no,
    'expires_at', o.expires_at,
    -- Sağlayıcıya gidecek sepet dökümü
    'items', coalesce((
      select json_agg(json_build_array(i.name, to_char(i.unit_price, 'FM999999990.00'), i.qty)
                      order by i.id)
      from order_items i where i.order_id = o.id
    ), '[]'::json)
  );
end;
$$;

-- ---------- Ödeme sonucunu işle ----------
-- YALNIZCA sunucu çağırır (service_role). Sağlayıcının imzasını doğrulamak
-- sunucunun işidir; buraya gelen sonuç doğrulanmış kabul edilir.
--
-- Aynı bildirim birden çok kez gelebilir; fonksiyon bunu tolere eder
-- (ikinci çağrıda hiçbir şey değişmez, 'zaten' bilgisi döner).
create or replace function public.odeme_sonucu(
  p_oid    text,
  p_basari boolean,
  p_tutar  numeric default null,
  p_sebep  text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p payments%rowtype;
  o orders%rowtype;
begin
  select * into p from payments where oid = p_oid for update;
  if p.id is null then
    return json_build_object('ok', false, 'mesaj', 'Bilinmeyen ödeme numarası');
  end if;

  select * into o from orders where id = p.order_id for update;

  -- Zaten işlenmişse tekrar dokunma.
  if p.status <> 'pending' then
    return json_build_object('ok', true, 'zaten', true, 'durum', p.status);
  end if;

  if not p_basari then
    update payments
    set status = 'failed', fail_reason = left(coalesce(p_sebep, ''), 200), updated_at = now()
    where id = p.id;

    -- Süre henüz dolmadıysa siparişi iptal etmiyoruz; müşteri tekrar deneyebilir.
    if o.expires_at is not null and o.expires_at < now() then
      update orders
      set status = 'cancelled', payment_status = 'failed',
          cancel_reason = 'Ödeme alınamadı', updated_at = now()
      where id = o.id;
      perform public.siparis_iade(o.id);
    else
      update orders set payment_status = 'pending', updated_at = now() where id = o.id;
    end if;

    return json_build_object('ok', true, 'durum', 'failed');
  end if;

  -- Tutar sağlaması: sağlayıcıdan gelen tutar siparişten farklıysa
  -- otomatik onaylamıyoruz, insan baksın.
  if p_tutar is not null and abs(p_tutar - p.amount) > 0.01 then
    update payments
    set status = 'failed',
        fail_reason = 'Tutar uyuşmuyor: beklenen ' || p.amount || ', gelen ' || p_tutar,
        updated_at = now()
    where id = p.id;
    return json_build_object('ok', false, 'mesaj', 'Tutar uyuşmuyor');
  end if;

  update payments set status = 'paid', updated_at = now() where id = p.id;

  update orders
  set payment_status = 'paid',
      paid_at        = now(),
      expires_at     = null,
      status         = case when status = 'awaiting_payment' then 'new' else status end,
      updated_at     = now()
  where id = o.id;

  return json_build_object('ok', true, 'durum', 'paid', 'table_no', o.table_no);
end;
$$;

-- ---------- Takip ekranı: ödeme bilgisi de gelsin ----------
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
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'expires_at', o.expires_at,
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

-- ---------- Müşteri iptali: ödeme bekleyen sipariş de iptal edilebilsin ----------
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
  if v_durum not in ('new', 'awaiting_payment') then
    raise exception 'Sipariş hazırlanmaya başladı, iptal edemezsiniz';
  end if;

  update orders
  set status = 'cancelled',
      payment_status = case when payment_status = 'paid' then 'paid' else 'failed' end,
      cancel_reason = 'Müşteri vazgeçti',
      updated_at = now()
  where id = v_id;

  perform public.siparis_iade(v_id);

  return public.siparis_getir(p_kod);
end;
$$;

-- ---------- Panel özeti: ödenen / bekleyen ayrımı ----------
create or replace function public.siparis_ozet(p_gun date default null)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gun date := coalesce(p_gun, public.yerel_gun());
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;

  return (
    select json_build_object(
      'toplam',     count(*) filter (where status <> 'awaiting_payment'),
      'odeme_bekleyen', count(*) filter (where status = 'awaiting_payment'),
      'bekleyen',   count(*) filter (where status = 'new'),
      'hazirlanan', count(*) filter (where status = 'preparing'),
      'hazir',      count(*) filter (where status = 'ready'),
      'teslim',     count(*) filter (where status = 'done'),
      'iptal',      count(*) filter (where status = 'cancelled'),
      'ciro',       coalesce(sum(total) filter (where status not in ('cancelled', 'awaiting_payment')), 0),
      'online',     coalesce(sum(total) filter (where payment_status = 'paid' and status <> 'cancelled'), 0)
    )
    from orders where order_day = v_gun
  );
end;
$$;

-- ---------- İzinler ----------
alter table public.payments enable row level security;

revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

drop policy if exists payments_admin_read on public.payments;
create policy payments_admin_read on public.payments
  for select to authenticated using (public.is_admin());

revoke all on function public.odeme_suresi_gecenler()                    from public;
revoke all on function public.odeme_denemesi_ac(uuid, text)              from public;
revoke all on function public.odeme_sonucu(text, boolean, numeric, text) from public;
revoke all on function public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text, text, text, text) from public;

grant execute on function public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text, text, text, text) to anon, authenticated;

-- DİKKAT: odeme_denemesi_ac ve odeme_sonucu tarayıcıya AÇILMAZ.
-- Bunları yalnızca service_role anahtarıyla çalışan sunucu çağırır.
-- (service_role bütün fonksiyonları çağırabilir, ek grant gerekmez.)
