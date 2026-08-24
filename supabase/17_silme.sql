-- La Joie Dijital Menü — 17. adım: kupon / hediye kartı / kampanya silme
--
-- İlke: HİÇ KULLANILMAMIŞ kayıtlar silinebilir. Kullanılmış olan
-- silinemez, yalnızca durdurulur — çünkü silinirse geçmiş siparişlerdeki
-- indirim kaydı da düşer ve ciro raporu bozulur.

-- ---------- Kupon sil ----------
create or replace function public.kupon_sil(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kullanim integer;
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;

  select count(*) into v_kullanim from redemptions where coupon_id = p_id;

  if v_kullanim > 0 then
    raise exception 'Bu kupon % siparişte kullanılmış, silinemez. Durdurabilirsiniz.', v_kullanim;
  end if;

  delete from coupons where id = p_id;
end;
$$;

-- ---------- Hediye kartı sil ----------
create or replace function public.hediye_sil(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h gift_cards%rowtype;
  v_kullanim integer;
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;

  select * into h from gift_cards where id = p_id;
  if h.id is null then
    raise exception 'Kart bulunamadı';
  end if;

  select count(*) into v_kullanim from redemptions where gift_id = p_id;

  if v_kullanim > 0 then
    raise exception 'Bu kart kullanılmış, silinemez. Durdurabilirsiniz.';
  end if;

  -- Bakiyesi eksilmişse bir yerde harcanmış demektir; dokunmuyoruz.
  if h.balance <> h.initial then
    raise exception 'Bu kartın bakiyesi değişmiş, silinemez. Durdurabilirsiniz.';
  end if;

  delete from gift_cards where id = p_id;
end;
$$;

-- ---------- Kampanya sil ----------
-- Kampanyadan kupon üretilmişse silinmez: o kuponlar müşterilerin
-- hesabında duruyor olabilir.
create or replace function public.kampanya_sil(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kupon integer;
begin
  if not public.is_admin() then
    raise exception 'Yetkiniz yok';
  end if;

  select count(*) into v_kupon from coupons where campaign_id = p_id;

  if v_kupon > 0 then
    raise exception 'Bu kampanyadan % kupon verilmiş, silinemez. Durdurabilirsiniz.', v_kupon;
  end if;

  delete from campaigns where id = p_id;
end;
$$;

-- ---------- İzinler ----------
revoke all on function public.kupon_sil(bigint)    from public;
revoke all on function public.hediye_sil(bigint)   from public;
revoke all on function public.kampanya_sil(bigint) from public;

grant execute on function public.kupon_sil(bigint)    to authenticated;
grant execute on function public.hediye_sil(bigint)   to authenticated;
grant execute on function public.kampanya_sil(bigint) to authenticated;
