-- La Joie Dijital Menü — 3. adım: istatistik fonksiyonları
--
-- Özet ekranındaki her rakam burada hesaplanır. Ham ziyaret kayıtları
-- tarayıcıya hiç inmez; sadece toplanmış sonuçlar gider.
-- Her fonksiyon başında yönetici kontrolü vardır.

-- ---------- Üst satırdaki dört kutu ----------
create or replace function public.stats_summary()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sonuc json;
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;

  select json_build_object(
    'today',      count(*) filter (where type = 'open' and created_at >= date_trunc('day', now())),
    'yesterday',  count(*) filter (where type = 'open'
                    and created_at >= date_trunc('day', now()) - interval '1 day'
                    and created_at <  date_trunc('day', now())),
    'week',       count(*) filter (where type = 'open' and created_at >= date_trunc('day', now()) - interval '6 days'),
    'prev_week',  count(*) filter (where type = 'open'
                    and created_at >= date_trunc('day', now()) - interval '13 days'
                    and created_at <  date_trunc('day', now()) - interval '6 days'),
    'total',      count(*) filter (where type = 'open'),
    'products',   (select count(*) from products where active),
    'sold_out',   (select count(*) from products where active and sold_out)
  ) into sonuc
  from events;

  return sonuc;
end;
$$;

-- ---------- Son 14 günün grafiği ----------
create or replace function public.stats_daily(gun integer default 14)
returns table (gun_tarih date, adet bigint)
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
  select d::date, count(e.id)
  from generate_series(
         date_trunc('day', now()) - ((gun - 1) || ' days')::interval,
         date_trunc('day', now()),
         '1 day'
       ) as d
  left join events e
    on e.type = 'open'
   and e.created_at >= d
   and e.created_at <  d + interval '1 day'
  group by d
  order by d;
end;
$$;

-- ---------- Gün içi yoğunluk ----------
create or replace function public.stats_hourly(gun integer default 30)
returns table (saat integer, adet bigint)
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
  select s::integer, count(e.id)
  from generate_series(0, 23) as s
  left join events e
    on e.type = 'open'
   and extract(hour from e.created_at) = s
   and e.created_at >= now() - ((gun) || ' days')::interval
  group by s
  order by s;
end;
$$;

-- ---------- En çok bakılan ürünler ----------
create or replace function public.stats_top_products(gun integer default 30, sinir integer default 10)
returns table (urun_ad text, kategori_ad text, adet bigint)
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
  select p.name, c.name, count(*)
  from events e
  join products p   on p.id = e.target_id
  left join categories c on c.id = p.category_id
  where e.type = 'product'
    and e.created_at >= now() - ((gun) || ' days')::interval
  group by p.id, p.name, c.name
  order by count(*) desc
  limit sinir;
end;
$$;

-- ---------- Kategori ilgisi ----------
create or replace function public.stats_top_categories(gun integer default 30, sinir integer default 8)
returns table (kategori_ad text, adet bigint)
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
  select c.name, count(*)
  from events e
  join categories c on c.id = e.target_id
  where e.type = 'category'
    and e.created_at >= now() - ((gun) || ' days')::interval
  group by c.id, c.name
  order by count(*) desc
  limit sinir;
end;
$$;

-- ---------- Cihaz dağılımı ----------
create or replace function public.stats_devices(gun integer default 30)
returns table (cihaz text, adet bigint)
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
  select coalesce(nullif(e.device, ''), 'bilinmiyor'), count(*)
  from events e
  where e.type = 'open'
    and e.created_at >= now() - ((gun) || ' days')::interval
  group by 1
  order by count(*) desc;
end;
$$;

-- ---------- Eski kayıtları temizle ----------
create or replace function public.stats_prune(gun integer default 365)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  silinen integer;
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;

  delete from events where created_at < now() - ((greatest(gun, 30)) || ' days')::interval;
  get diagnostics silinen = row_count;
  return silinen;
end;
$$;

-- ---------- Sıra değiştirme ----------
-- İki kaydın sırasını tek işlemde takas eder; yarım kalmış
-- güncelleme yüzünden sıralamanın bozulmasını engeller.
create or replace function public.swap_position(tablo text, id_a bigint, id_b bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a integer;
  b integer;
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;

  if tablo = 'products' then
    select position into a from products where id = id_a;
    select position into b from products where id = id_b;
    if a is null or b is null then return; end if;
    update products set position = b where id = id_a;
    update products set position = a where id = id_b;

  elsif tablo = 'categories' then
    select position into a from categories where id = id_a;
    select position into b from categories where id = id_b;
    if a is null or b is null then return; end if;
    update categories set position = b where id = id_a;
    update categories set position = a where id = id_b;

  else
    raise exception 'Bilinmeyen tablo';
  end if;
end;
$$;

-- Fonksiyonları giriş yapmış kullanıcılara aç (içeride ayrıca yönetici kontrolü var)
revoke all on function public.stats_summary()               from public;
revoke all on function public.stats_daily(integer)           from public;
revoke all on function public.stats_hourly(integer)          from public;
revoke all on function public.stats_top_products(integer, integer)   from public;
revoke all on function public.stats_top_categories(integer, integer) from public;
revoke all on function public.stats_devices(integer)         from public;
revoke all on function public.stats_prune(integer)           from public;
revoke all on function public.swap_position(text, bigint, bigint)    from public;

grant execute on function public.stats_summary()             to authenticated;
grant execute on function public.stats_daily(integer)        to authenticated;
grant execute on function public.stats_hourly(integer)       to authenticated;
grant execute on function public.stats_top_products(integer, integer)   to authenticated;
grant execute on function public.stats_top_categories(integer, integer) to authenticated;
grant execute on function public.stats_devices(integer)      to authenticated;
grant execute on function public.stats_prune(integer)        to authenticated;
grant execute on function public.swap_position(text, bigint, bigint)    to authenticated;
