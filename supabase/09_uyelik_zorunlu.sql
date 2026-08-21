-- La Joie Dijital Menü — 9. adım: sipariş için üye girişi zorunluluğu
--
-- Kural arayüzde DEĞİL, burada uygulanır. Arayüzü atlayıp doğrudan
-- API'ye istek atan biri de aynı duvara çarpar. Panel ayarıyla
-- açılıp kapatılabilir; işletme dönüşüm düşerse geri dönebilmeli.

-- ---------- Ayarlar ----------
insert into public.settings (key, value) values ('preorder_require_login', '1')
on conflict (key) do nothing;

-- İstek üzerine: üyelik yöntemi varsayılanı SMS olsun.
update public.settings set value = 'phone' where key = 'auth_method';

-- ---------- siparis_olustur: giriş kontrolü ----------
-- Fonksiyonun tamamını yeniden tanımlıyoruz; tek fark başa eklenen kontrol
-- ve kimlik anahtarının artık öncelikle hesaba bağlanması.
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

  ---------- Giriş zorunluluğu ----------
  if public.ayar('preorder_require_login', '1') = '1' and v_uid is null then
    raise exception 'Ön sipariş için giriş yapmanız gerekiyor';
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
  -- Girişliyse sınır hesaba bağlıdır; cihaz değiştirmek işe yaramaz.
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

  ---------- Tutarları yaz ----------
  update orders
  set subtotal    = v_ara,
      discount    = v_indirim,
      gift_used   = v_gift,
      total       = v_ara - v_indirim - v_gift,
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
