-- La Joie Dijital Menü — 6. adım: ön sipariş katmanı
--
-- Mantık: müşteri menüden seçer, bir saat dilimi seçer, sipariş bırakır.
-- Kendisine kalıcı bir "sanal masa numarası" verilir; o numarayı söyleyerek
-- siparişini teslim alır ya da oturup yer. Aynı numara mutfak ekranına düşer.
--
-- Güvenlik ilkesi: tarayıcı orders tablosuna DOKUNAMAZ. Bütün işlemler
-- aşağıdaki RPC fonksiyonları üzerinden yapılır. Fiyat, toplam tutar ve
-- masa numarası daima veritabanında hesaplanır — tarayıcıdan gelen
-- fiyat bilgisine asla güvenilmez.

-- ---------- Ürünlere sipariş bayrağı ----------
-- Bazı ürünler menüde görünsün ama ön siparişe kapalı olsun
-- (örn. sadece masada servis edilenler).
alter table public.products
  add column if not exists orderable boolean not null default true;

-- ---------- Ayarlar ----------
insert into public.settings (key, value) values
  ('preorder_enabled',  '1'),        -- ön sipariş açık mı
  ('preorder_start',    '11:30'),    -- ilk teslim saati
  ('preorder_end',      '14:30'),    -- son teslim saati
  ('preorder_step',     '15'),       -- saat dilimi aralığı (dakika)
  ('preorder_lead',     '20'),       -- en yakın teslim kaç dakika sonra olabilir
  ('preorder_capacity', '6'),        -- bir dilimde kaç sipariş alınır
  ('preorder_start_no', '101'),      -- sanal masa numaraları kaçtan başlasın
  ('preorder_note',     'Ödeme kasada · Siparişiniz onaylanınca hazırlanmaya başlar')
on conflict (key) do nothing;

-- ---------- Küçük yardımcılar ----------

-- Ayarı okur, boşsa varsayılanı verir.
create or replace function public.ayar(p_key text, p_varsayilan text default '')
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif((select value from settings where key = p_key), ''), p_varsayilan);
$$;

-- Sunucu UTC çalışır; işletme İstanbul saatinde yaşar. Tek doğruluk kaynağı bu.
create or replace function public.yerel_gun()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Istanbul')::date;
$$;

-- ---------- Siparişler ----------
create table if not exists public.orders (
  id             bigint generated always as identity primary key,

  -- Müşterinin takip bağlantısındaki gizli anahtar. Numarayı bilen
  -- başkasının siparişini göremesin diye tahmin edilemez olmalı.
  code           uuid    not null default gen_random_uuid(),

  -- Yüksek sesle söylenen numara. Her gün baştan başlar.
  table_no       integer not null,
  order_day      date    not null default public.yerel_gun(),

  mode           text    not null default 'dinein'
                   check (mode in ('dinein', 'pickup')),
  status         text    not null default 'new'
                   check (status in ('new', 'preparing', 'ready', 'done', 'cancelled')),

  pickup_at      timestamptz not null,

  customer_name  text    not null default '' check (char_length(customer_name)  <= 60),
  customer_phone text    not null default '' check (char_length(customer_phone) <= 24),
  note           text    not null default '' check (char_length(note)           <= 300),
  cancel_reason  text    not null default '' check (char_length(cancel_reason)  <= 160),

  total          numeric(10,2) not null default 0 check (total >= 0),
  item_count     integer not null default 0,

  visitor        text    not null default '',   -- kötüye kullanım sınırı için
  seen           boolean not null default false,-- panelde okundu mu

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (order_day, table_no)
);

create index if not exists orders_gun_idx    on public.orders (order_day desc, table_no);
create index if not exists orders_durum_idx  on public.orders (status, pickup_at);
create index if not exists orders_ziyaretci_idx on public.orders (visitor, created_at desc);
create unique index if not exists orders_code_idx on public.orders (code);

-- ---------- Sipariş satırları ----------
-- Ürün adı ve fiyatı buraya KOPYALANIR. Yarın fiyat değişse bile
-- dünkü siparişin dökümü bozulmaz.
create table if not exists public.order_items (
  id         bigint generated always as identity primary key,
  order_id   bigint  not null references public.orders (id) on delete cascade,
  product_id bigint           references public.products (id) on delete set null,
  name       text    not null,
  unit_price numeric(10,2) not null default 0 check (unit_price >= 0),
  qty        integer not null default 1 check (qty between 1 and 20)
);

create index if not exists order_items_siparis_idx on public.order_items (order_id);

-- ---------- Günlük numara sayacı ----------
-- Numarayı max()+1 ile üretmek iki kişi aynı anda sipariş verdiğinde
-- çakışır. Tek satırı kilitleyip artırmak bunu imkânsız kılar.
create table if not exists public.order_counter (
  order_day date    primary key,
  last_no   integer not null
);

-- ---------- Boş saat dilimleri ----------
-- Ödeme ekranı hangi saatlerin dolu olduğunu buradan öğrenir.
create or replace function public.siparis_slotlari()
returns table (slot timestamptz, dolu integer, kapasite integer, musait boolean)
language plpgsql
stable
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

  -- En erken teslim: şimdi + hazırlık süresi, yukarı yuvarlanmış.
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

-- ---------- Sipariş oluştur ----------
-- p_urunler örneği: [{"id": 12, "qty": 2}, {"id": 8, "qty": 1}]
create or replace function public.siparis_olustur(
  p_urunler   jsonb,
  p_teslim    timestamptz,
  p_mod       text default 'dinein',
  p_ad        text default '',
  p_telefon   text default '',
  p_not       text default '',
  p_ziyaretci text default ''
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
  v_toplam   numeric(10,2) := 0;
  v_sayi     integer := 0;
  v_no       integer;
  v_id       bigint;
  v_kod      uuid;
  v_zy       text := left(coalesce(p_ziyaretci, ''), 64);
  r          record;
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

  -- Dilime oturuyor mu? (istemci uydurma bir saat gönderemesin)
  v_dakika := extract(epoch from (v_yerel::time - v_bas)) / 60;
  if v_dakika < 0 or (v_dakika % v_adim) <> 0 then
    raise exception 'Geçersiz teslim saati';
  end if;
  if p_teslim < now() + ((v_hazirlik - 1) || ' minutes')::interval then
    raise exception 'Bu saat için çok geç kaldınız, lütfen daha ileri bir saat seçin';
  end if;

  ---------- Kötüye kullanım sınırı ----------
  if v_zy <> '' then
    if exists (
      select 1 from orders
      where visitor = v_zy and created_at > now() - interval '45 seconds'
    ) then
      raise exception 'Çok hızlı sipariş veriyorsunuz, lütfen biraz bekleyin';
    end if;

    if (select count(*) from orders
        where visitor = v_zy
          and order_day = v_gun
          and status in ('new', 'preparing', 'ready')) >= 3 then
      raise exception 'Açık siparişiniz var, önce onu teslim alın';
    end if;
  end if;

  ---------- Kapasite ----------
  -- Kilit alarak sayıyoruz ki iki kişi son yeri aynı anda kapmasın.
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
                      customer_name, customer_phone, note, visitor)
  values (v_no, v_gun,
          case when p_mod = 'pickup' then 'pickup' else 'dinein' end,
          p_teslim,
          left(btrim(coalesce(p_ad, '')), 60),
          left(btrim(coalesce(p_telefon, '')), 24),
          left(btrim(coalesce(p_not, '')), 300),
          v_zy)
  returning id, code into v_id, v_kod;

  ---------- Satırlar: fiyat DAİMA veritabanından ----------
  for r in
    select (e ->> 'id')::bigint as urun_id,
           greatest(least(coalesce((e ->> 'qty')::int, 1), 20), 1) as adet
    from jsonb_array_elements(p_urunler) as e
  loop
    insert into order_items (order_id, product_id, name, unit_price, qty)
    select v_id, p.id, p.name, p.price, r.adet
    from products p
    where p.id = r.urun_id
      and p.active
      and p.orderable
      and not p.sold_out;

    if found then
      select (p.price * r.adet) into v_toplam from products p where p.id = r.urun_id;
      update orders set total = total + v_toplam, item_count = item_count + r.adet
      where id = v_id;
      v_sayi := v_sayi + 1;
    end if;
  end loop;

  if v_sayi = 0 then
    raise exception 'Seçtiğiniz ürünler şu an sipariş edilemiyor';
  end if;

  return (
    select json_build_object(
      'code',      o.code,
      'table_no',  o.table_no,
      'pickup_at', o.pickup_at,
      'total',     o.total,
      'status',    o.status,
      'mode',      o.mode
    )
    from orders o where o.id = v_id
  );
end;
$$;

-- ---------- Siparişi görüntüle (müşteri) ----------
-- Sadece gizli kodu bilen görebilir. Telefon/ad geri döndürülmez;
-- bağlantı paylaşılırsa kişisel bilgi sızmasın.
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

-- ---------- Müşteri iptali ----------
-- Yalnızca mutfak henüz başlamadıysa.
create or replace function public.siparis_vazgec(p_kod uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_durum text;
begin
  select status into v_durum from orders where code = p_kod;
  if v_durum is null then
    raise exception 'Sipariş bulunamadı';
  end if;
  if v_durum <> 'new' then
    raise exception 'Sipariş hazırlanmaya başladı, iptal edemezsiniz';
  end if;

  update orders
  set status = 'cancelled', cancel_reason = 'Müşteri vazgeçti', updated_at = now()
  where code = p_kod;

  return public.siparis_getir(p_kod);
end;
$$;

-- ---------- Panel: durum değiştir ----------
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
end;
$$;

-- ---------- Panel: günün özeti ----------
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
      'toplam',     count(*),
      'bekleyen',   count(*) filter (where status = 'new'),
      'hazirlanan', count(*) filter (where status = 'preparing'),
      'hazir',      count(*) filter (where status = 'ready'),
      'teslim',     count(*) filter (where status = 'done'),
      'iptal',      count(*) filter (where status = 'cancelled'),
      'ciro',       coalesce(sum(total) filter (where status <> 'cancelled'), 0)
    )
    from orders where order_day = v_gun
  );
end;
$$;

-- ---------- İzinler ----------
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;
alter table public.order_counter enable row level security;

-- Tarayıcı rolleri bu tablolara doğrudan yazamaz; her şey RPC üzerinden.
revoke all on public.orders, public.order_items, public.order_counter from anon, authenticated;
grant select on public.orders, public.order_items to authenticated;

drop policy if exists orders_admin_read      on public.orders;
drop policy if exists order_items_admin_read on public.order_items;

create policy orders_admin_read on public.orders
  for select to authenticated
  using (public.is_admin());

create policy order_items_admin_read on public.order_items
  for select to authenticated
  using (public.is_admin());

-- Fonksiyon izinleri (içeride ayrıca kendi kontrolleri var)
revoke all on function public.ayar(text, text)                       from public;
revoke all on function public.siparis_slotlari()                     from public;
revoke all on function public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text) from public;
revoke all on function public.siparis_getir(uuid)                    from public;
revoke all on function public.siparis_vazgec(uuid)                   from public;
revoke all on function public.siparis_durum(bigint, text, text)      from public;
revoke all on function public.siparis_ozet(date)                     from public;

grant execute on function public.siparis_slotlari()                  to anon, authenticated;
grant execute on function public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text) to anon, authenticated;
grant execute on function public.siparis_getir(uuid)                 to anon, authenticated;
grant execute on function public.siparis_vazgec(uuid)                to anon, authenticated;
grant execute on function public.siparis_durum(bigint, text, text)   to authenticated;
grant execute on function public.siparis_ozet(date)                  to authenticated;

-- ---------- Canlı yayın ----------
-- Panelin yeni siparişi yenilemeden görmesi için.
alter table public.orders replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime yayini yok; canli akis atlandi.';
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
