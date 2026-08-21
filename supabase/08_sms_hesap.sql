-- La Joie Dijital Menü — 8. adım: SMS ile giriş + hesap ekranı verileri
--
-- SMS doğrulamasını Supabase Auth yapar; bizim tarafta şifre ya da kod
-- tutulmaz. Bu dosya üç şey yapar:
--   1) Telefonla kaydolan kullanıcının profili doğru dolsun
--   2) Hesap ekranı: siparişler artık içerikleriyle gelsin (tekrarla düğmesi için)
--   3) Hesap özeti: kaç sipariş, ne kadar harcama

-- ---------- Ayar: giriş yöntemi ----------
-- 'email' ya da 'phone'. Panelden değiştirilir. SMS sağlayıcısı
-- Supabase'de tanımlanmadan 'phone' seçilirse kod gönderimi hata verir;
-- arayüz bu hatayı müşteriye anlaşılır biçimde gösterir.
insert into public.settings (key, value) values ('auth_method', 'email')
on conflict (key) do nothing;

-- ---------- Profil tetikleyicisi: telefon kaydını da tanısın ----------
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
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 60),
    -- Telefonla kaydoldu ise numara auth.users.phone alanında durur.
    left(coalesce(nullif(new.raw_user_meta_data ->> 'phone', ''), new.phone, ''), 24)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ---------- Siparişlerim: içerikleriyle ----------
-- "Tekrarla" düğmesi ürün kimliklerine ihtiyaç duyar; adlar yetmez
-- çünkü fiyat ve stok güncel üründen okunmalı.
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
                    'qty', i.qty
                  ) order by i.id)
           from order_items i where i.order_id = o.id
         ), '[]'::json)
  from orders o
  where o.user_id = auth.uid()
  order by o.created_at desc
  limit greatest(least(p_sinir, 50), 1);
end;
$$;

-- ---------- Hesap özeti ----------
create or replace function public.hesap_ozet()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Giriş yapmalısınız';
  end if;

  return (
    select json_build_object(
      'siparis', count(*) filter (where status <> 'cancelled'),
      'harcama', coalesce(sum(total) filter (where status <> 'cancelled'), 0),
      'uyelik',  (select created_at from profiles where user_id = auth.uid())
    )
    from orders where user_id = auth.uid()
  );
end;
$$;

-- ---------- İzinler ----------
revoke all on function public.siparislerim(integer) from public;
revoke all on function public.hesap_ozet()          from public;

grant execute on function public.siparislerim(integer) to authenticated;
grant execute on function public.hesap_ozet()          to authenticated;
