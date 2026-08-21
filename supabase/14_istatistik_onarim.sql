-- La Joie Dijital Menü — 14. adım: istatistik onarımı + sipariş istatistikleri
--
-- SORUN NEYDİ: ziyaret olayları /api/track adresindeki Node sunucusuna
-- gidiyordu. Vercel yalnızca statik siteyi yayınladığı için o adres
-- üretimde hiç var olmadı; olaylar sessizce kayboldu, özet ekranı boş kaldı.
--
-- KALICI ÇÖZÜM: aracı sunucuyu tamamen kaldırıyoruz. Olaylar artık
-- doğrudan veritabanındaki bu fonksiyona yazılır — sistemin geri kalanı
-- gibi. Ayrı bir sunucu yok, kurulacak bir şey yok, kaybolacak yer yok.
--
-- Sunucunun tek görevi hız sınırıydı; o sınır da artık burada.

-- ---------- Olay kaydet ----------
create or replace function public.olay_kaydet(
  p_tur       text,
  p_hedef     bigint default null,
  p_ziyaretci text default '',
  p_cihaz     text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zy text := left(coalesce(p_ziyaretci, ''), 64);
begin
  -- Bilinmeyen tür yazılamaz.
  if p_tur not in ('open', 'category', 'product') then
    return;
  end if;

  -- Hız sınırı: aynı ziyaretçi 10 dakikada en çok 80 olay yazabilir.
  -- Menüyü gezen gerçek bir insan bunun yakınına bile gelmez; döngüyle
  -- veri şişirmeye çalışan bot burada durur. Hata fırlatmayız —
  -- istatistik, menüyü asla bozmamalı.
  if v_zy <> '' and (
    select count(*) from events
    where visitor = v_zy and created_at > now() - interval '10 minutes'
  ) >= 80 then
    return;
  end if;

  -- Hedef doğrulama: olmayan ürün/kategori kimliğiyle tablo kirletilmesin.
  if p_tur = 'product' and (p_hedef is null or not exists (select 1 from products   where id = p_hedef)) then
    return;
  end if;
  if p_tur = 'category' and (p_hedef is null or not exists (select 1 from categories where id = p_hedef)) then
    return;
  end if;

  insert into events (type, target_id, visitor, device)
  values (
    p_tur,
    case when p_tur = 'open' then null else p_hedef end,
    v_zy,
    case when p_cihaz in ('mobil', 'tablet', 'masaustu') then p_cihaz else '' end
  );
end;
$$;

revoke all on function public.olay_kaydet(text, bigint, text, text) from public;
grant execute on function public.olay_kaydet(text, bigint, text, text) to anon, authenticated;

-- ---------- Sipariş istatistikleri (özet ekranı için) ----------

-- Son N günün sipariş adedi ve cirosu.
create or replace function public.stats_orders_daily(gun integer default 14)
returns table (gun_tarih date, adet bigint, ciro numeric)
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
  select d::date,
         count(o.id),
         coalesce(sum(o.total), 0)
  from generate_series(
         public.yerel_gun() - (greatest(gun, 1) - 1),
         public.yerel_gun(),
         '1 day'
       ) as d
  left join orders o
    on o.order_day = d::date
   and o.status not in ('cancelled', 'awaiting_payment')
  group by d
  order by d;
end;
$$;

-- En çok satılan ürünler (bakılan değil, gerçekten sipariş edilen).
create or replace function public.stats_sold_products(gun integer default 30, sinir integer default 10)
returns table (urun_ad text, adet bigint, ciro numeric)
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
  select i.name,
         sum(i.qty)::bigint,
         sum(i.qty * i.unit_price)
  from order_items i
  join orders o on o.id = i.order_id
  where o.status not in ('cancelled', 'awaiting_payment')
    and o.created_at >= now() - ((greatest(gun, 1)) || ' days')::interval
  group by i.name
  order by sum(i.qty) desc
  limit greatest(sinir, 1);
end;
$$;

revoke all on function public.stats_orders_daily(integer)            from public;
revoke all on function public.stats_sold_products(integer, integer)  from public;

grant execute on function public.stats_orders_daily(integer)           to authenticated;
grant execute on function public.stats_sold_products(integer, integer) to authenticated;
