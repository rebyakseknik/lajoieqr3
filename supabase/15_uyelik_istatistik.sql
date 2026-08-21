-- La Joie Dijital Menü — 15. adım: üyelik ve kupon istatistikleri
--
-- Özet ekranına iki soru daha: bugün kaç kişi üye oldu, kuponlar ne
-- kadar kullanıldı. Küçük toplama sorgularıdır; ekrana yük getirmez.

-- Kullanım kayıtlarında tarihe göre arama hızlansın (ileride büyürse).
create index if not exists redemptions_tarih_idx on public.redemptions (created_at desc);

create or replace function public.stats_uyelik_kupon()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gun date := public.yerel_gun();
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;

  return json_build_object(
    -- Üyelik: gün sınırı İstanbul saatine göre çizilir.
    'bugun_uye', (
      select count(*) from profiles
      where (created_at at time zone 'Europe/Istanbul')::date = v_gun
    ),
    'hafta_uye', (
      select count(*) from profiles
      where (created_at at time zone 'Europe/Istanbul')::date > v_gun - 7
    ),
    'toplam_uye', (select count(*) from profiles),

    -- Kupon kullanımı: yalnızca geçerli siparişler sayılır.
    -- İptal edilen siparişin kuponu iade edildiği için hesaba girmez.
    'bugun_kupon_adet', (
      select count(*) from redemptions r
      join orders o on o.id = r.order_id
      where r.coupon_id is not null
        and o.order_day = v_gun
        and o.status <> 'cancelled'
    ),
    'bugun_kupon_tutar', coalesce((
      select sum(r.amount) from redemptions r
      join orders o on o.id = r.order_id
      where r.coupon_id is not null
        and o.order_day = v_gun
        and o.status <> 'cancelled'
    ), 0),

    -- Hediye kartı ayrı sayılır; o indirim değil, önceden ödenmiş paradır.
    'bugun_hediye_tutar', coalesce((
      select sum(r.amount) from redemptions r
      join orders o on o.id = r.order_id
      where r.gift_id is not null
        and o.order_day = v_gun
        and o.status <> 'cancelled'
    ), 0),

    -- Son 30 gün: kampanyaların genel etkisini görmek için.
    'ay_kupon_adet', (
      select count(*) from redemptions r
      join orders o on o.id = r.order_id
      where r.coupon_id is not null
        and o.order_day > v_gun - 30
        and o.status <> 'cancelled'
    ),
    'ay_kupon_tutar', coalesce((
      select sum(r.amount) from redemptions r
      join orders o on o.id = r.order_id
      where r.coupon_id is not null
        and o.order_day > v_gun - 30
        and o.status <> 'cancelled'
    ), 0)
  );
end;
$$;

revoke all on function public.stats_uyelik_kupon() from public;
grant execute on function public.stats_uyelik_kupon() to authenticated;
