-- La Joie Dijital Menü — 16. adım: seçenekler ve varyasyonlar
--
-- İki farklı ihtiyaç, tek yapı:
--
--   BOYUT (S/M/L)  → gruba "tam fiyat" (absolute) denir.
--                    Seçilen seçeneğin fiyatı ürünün fiyatı OLUR.
--                    Zorunludur: en az 1, en fazla 1 seçilir.
--
--   EKSTRA (çedar) → gruba "ekleme" (add) denir.
--                    Seçeneğin fiyatı toplam fiyata EKLENİR.
--                    İsteğe bağlıdır: 0'dan çoğa kadar seçilebilir.
--
-- Fiyat DAİMA burada hesaplanır. Tarayıcı yalnızca "hangi seçenekleri
-- seçtim" bilgisini gönderir; kaç para ettiğini söyleyemez.

-- ---------- Seçenek grupları ----------
create table if not exists public.option_groups (
  id         bigint generated always as identity primary key,
  product_id bigint not null references public.products (id) on delete cascade,

  name       text not null check (char_length(name) between 1 and 40),

  -- 'absolute' = seçilen fiyat ürünün fiyatı olur (boyut)
  -- 'add'      = seçilen fiyat toplama eklenir (ekstra)
  price_mode text not null default 'add' check (price_mode in ('absolute', 'add')),

  min_select integer not null default 0 check (min_select >= 0),
  max_select integer not null default 1 check (max_select >= 1),

  position   integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),

  check (max_select >= min_select)
);

create index if not exists option_groups_urun_idx on public.option_groups (product_id, position, id);

-- Bir üründe en fazla BİR tam fiyat grubu olabilir; iki tanesi olsaydı
-- hangisinin fiyatı geçerli olacağı belirsiz kalırdı.
create unique index if not exists option_groups_tek_absolute
  on public.option_groups (product_id)
  where price_mode = 'absolute' and active;

-- ---------- Seçenekler ----------
create table if not exists public.options (
  id        bigint generated always as identity primary key,
  group_id  bigint not null references public.option_groups (id) on delete cascade,

  name      text not null check (char_length(name) between 1 and 40),
  price     numeric(10,2) not null default 0 check (price >= 0),

  position  integer not null default 0,
  active    boolean not null default true,
  sold_out  boolean not null default false
);

create index if not exists options_grup_idx on public.options (group_id, position, id);

-- ---------- Sipariş satırındaki seçimler ----------
-- Ad ve fiyat kopyalanır: yarın çedar zamlansa bile dünkü fişin dökümü bozulmaz.
create table if not exists public.order_item_options (
  id            bigint generated always as identity primary key,
  order_item_id bigint not null references public.order_items (id) on delete cascade,
  option_id     bigint references public.options (id) on delete set null,
  group_name    text not null default '',
  name          text not null,
  price         numeric(10,2) not null default 0
);

create index if not exists order_item_options_satir_idx on public.order_item_options (order_item_id);

-- ---------- Menü için seçenek listesi ----------
-- Tek çağrıda bütün aktif grup ve seçenekler; menü açılışında bir kez alınır.
create or replace function public.menu_secenekleri()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(g order by g.position, g.id), '[]'::json)
  from (
    select og.id, og.product_id, og.name, og.price_mode,
           og.min_select, og.max_select, og.position,
           coalesce((
             select json_agg(json_build_object(
                      'id', o.id, 'name', o.name, 'price', o.price,
                      'sold_out', o.sold_out
                    ) order by o.position, o.id)
             from options o
             where o.group_id = og.id and o.active
           ), '[]'::json) as options
    from option_groups og
    join products p on p.id = og.product_id
    where og.active and p.active
  ) g;
$$;

-- ---------- Bir satırın fiyatını hesapla ----------
-- p_secimler: seçenek kimliklerinden oluşan dizi, örn. [3, 7, 9]
-- Hem doğrular hem fiyat döndürür. Geçersizse hata fırlatır.
create or replace function public.satir_fiyati(p_urun bigint, p_secimler jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fiyat  numeric(10,2);
  v_mutlak numeric(10,2);
  v_ekleme numeric(10,2);
  g        record;
  v_adet   integer;
begin
  select price into v_fiyat from products where id = p_urun;
  if v_fiyat is null then
    raise exception 'Ürün bulunamadı';
  end if;

  if p_secimler is null or jsonb_typeof(p_secimler) <> 'array' then
    p_secimler := '[]'::jsonb;
  end if;

  -- Seçilen her seçenek gerçekten bu ürüne mi ait, satılabilir mi?
  if exists (
    select 1
    from jsonb_array_elements(p_secimler) e
    left join options o on o.id = (e#>>'{}')::bigint
    left join option_groups og on og.id = o.group_id
    where o.id is null
       or not o.active or o.sold_out
       or og.product_id <> p_urun
       or not og.active
  ) then
    raise exception 'Seçtiğiniz bir seçenek şu an geçerli değil';
  end if;

  -- Her grup için seçim sayısı kurallara uyuyor mu?
  for g in
    select og.id, og.name, og.min_select, og.max_select
    from option_groups og
    where og.product_id = p_urun and og.active
  loop
    select count(*) into v_adet
    from jsonb_array_elements(p_secimler) e
    join options o on o.id = (e#>>'{}')::bigint
    where o.group_id = g.id;

    if v_adet < g.min_select then
      raise exception '% için seçim yapmalısınız', g.name;
    end if;
    if v_adet > g.max_select then
      raise exception '% için en fazla % seçim yapabilirsiniz', g.name, g.max_select;
    end if;
  end loop;

  -- Tam fiyat grubu varsa ürünün fiyatını o belirler.
  select o.price into v_mutlak
  from jsonb_array_elements(p_secimler) e
  join options o on o.id = (e#>>'{}')::bigint
  join option_groups og on og.id = o.group_id
  where og.price_mode = 'absolute'
  limit 1;

  if v_mutlak is not null then
    v_fiyat := v_mutlak;
  end if;

  -- Eklemeli seçenekler üstüne biner.
  select coalesce(sum(o.price), 0) into v_ekleme
  from jsonb_array_elements(p_secimler) e
  join options o on o.id = (e#>>'{}')::bigint
  join option_groups og on og.id = o.group_id
  where og.price_mode = 'add';

  return v_fiyat + v_ekleme;
end;
$$;

-- ---------- Sipariş oluşturma: seçenekli sürüm ----------
-- p_urunler artık şöyle gelir:
--   [{"id": 12, "qty": 2, "options": [3, 7]}, {"id": 8, "qty": 1}]
drop function if exists public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text, jsonb, text);

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

  r          record;
  v_satir    bigint;
  v_birim    numeric(10,2);
  v_secimler jsonb;
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
    raise exception 'Tek siparişte en fazla 25 satır olabilir';
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
  -- Seçenekler yüzünden aynı ürün farklı satırlarda olabilir (S ve L gibi),
  -- bu yüzden artık ürüne göre birleştirmiyoruz; her satır kendi başına.
  for r in
    select (e2 ->> 'id')::bigint as urun_id,
           greatest(least(coalesce((e2 ->> 'qty')::int, 1), 20), 1) as adet,
           coalesce(e2 -> 'options', '[]'::jsonb) as secimler
    from jsonb_array_elements(p_urunler) as e2
    where (e2 ->> 'id') ~ '^[0-9]+$'
  loop
    -- Ürün hâlâ satılabilir mi?
    if not exists (
      select 1 from products p
      where p.id = r.urun_id and p.active and p.orderable and not p.sold_out
    ) then
      continue;
    end if;

    -- Fiyat ve seçim doğrulaması tek yerde.
    v_birim := public.satir_fiyati(r.urun_id, r.secimler);

    insert into order_items (order_id, product_id, name, unit_price, qty)
    select v_id, p.id, p.name, v_birim, r.adet
    from products p where p.id = r.urun_id
    returning id into v_satir;

    -- Seçim dökümü satıra kopyalanır.
    insert into order_item_options (order_item_id, option_id, group_name, name, price)
    select v_satir, o.id, og.name, o.name, o.price
    from jsonb_array_elements(r.secimler) e3
    join options o on o.id = (e3#>>'{}')::bigint
    join option_groups og on og.id = o.group_id
    order by og.position, o.position;

    v_ara    := v_ara + (v_birim * r.adet);
    v_toplam := v_toplam + r.adet;
    v_sayi   := v_sayi + 1;
  end loop;

  if v_sayi = 0 then
    raise exception 'Seçtiğiniz ürünler şu an sipariş edilemiyor';
  end if;

  ---------- Kodlar ----------
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

-- ---------- Takip ekranı: seçimler de görünsün ----------
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
      select json_agg(json_build_object(
               'name', i.name, 'qty', i.qty, 'unit_price', i.unit_price,
               'options', coalesce((
                 select json_agg(json_build_object('name', x.name, 'price', x.price) order by x.id)
                 from order_item_options x where x.order_item_id = i.id
               ), '[]'::json)
             ) order by i.id)
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

-- ---------- Geçmiş siparişler: tekrarla için seçimler ----------
drop function if exists public.siparislerim(integer);

create or replace function public.siparislerim(p_sinir integer default 20)
returns table (
  code uuid, table_no integer, status text, mode text, pickup_at timestamptz,
  total numeric, item_count integer, created_at timestamptz, items json
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
  select o.code, o.table_no, o.status, o.mode, o.pickup_at,
         o.total, o.item_count, o.created_at,
         coalesce((
           select json_agg(json_build_object(
                    'product_id', i.product_id,
                    'name', i.name,
                    'qty', i.qty,
                    'option_ids', coalesce((
                      select json_agg(x.option_id) from order_item_options x
                      where x.order_item_id = i.id and x.option_id is not null
                    ), '[]'::json),
                    'option_names', coalesce((
                      select json_agg(x.name order by x.id) from order_item_options x
                      where x.order_item_id = i.id
                    ), '[]'::json)
                  ) order by i.id)
           from order_items i where i.order_id = o.id
         ), '[]'::json)
  from orders o
  where o.user_id = auth.uid()
  order by o.created_at desc
  limit greatest(least(p_sinir, 50), 1);
end;
$$;

-- ---------- İzinler ----------
alter table public.option_groups      enable row level security;
alter table public.options            enable row level security;
alter table public.order_item_options enable row level security;

grant select on public.option_groups, public.options to anon, authenticated;
grant insert, update, delete on public.option_groups, public.options to authenticated;
grant select on public.order_item_options to authenticated;

drop policy if exists option_groups_read  on public.option_groups;
drop policy if exists option_groups_admin on public.option_groups;
drop policy if exists options_read        on public.options;
drop policy if exists options_admin       on public.options;
drop policy if exists oio_read            on public.order_item_options;

create policy option_groups_read on public.option_groups
  for select to anon, authenticated using (active or public.is_admin());
create policy option_groups_admin on public.option_groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy options_read on public.options
  for select to anon, authenticated using (active or public.is_admin());
create policy options_admin on public.options
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy oio_read on public.order_item_options
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from order_items i
      join orders o on o.id = i.order_id
      where i.id = order_item_id and o.user_id = auth.uid()
    )
  );

revoke all on function public.menu_secenekleri()              from public;
revoke all on function public.satir_fiyati(bigint, jsonb)     from public;
revoke all on function public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text, jsonb, text) from public;

grant execute on function public.menu_secenekleri()           to anon, authenticated;
grant execute on function public.satir_fiyati(bigint, jsonb)  to anon, authenticated;
grant execute on function public.siparis_olustur(jsonb, timestamptz, text, text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.siparislerim(integer)        to authenticated;
