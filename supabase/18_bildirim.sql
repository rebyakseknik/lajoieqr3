-- La Joie Dijital Menü — 18. adım: sipariş hazır bildirimi
--
-- Müşteri siparişini bıraktıktan sonra takip sayfasını açık tutmak
-- zorunda kalmasın; siparişi hazır olunca telefonu titresin.
--
-- Abonelik SİPARİŞE bağlanır, kullanıcıya değil: misafir sipariş de
-- (giriş zorunluluğu kapalıysa) bildirim alabilsin.

create table if not exists public.push_subs (
  id         bigint generated always as identity primary key,
  order_id   bigint not null references public.orders (id) on delete cascade,

  -- Tarayıcının verdiği abonelik bilgisi
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,

  created_at timestamptz not null default now(),

  -- Aynı cihaz aynı sipariş için iki kez kaydolmasın
  unique (order_id, endpoint)
);

create index if not exists push_subs_siparis_idx on public.push_subs (order_id);

-- ---------- Abonelik kaydet ----------
-- Sipariş kodunu bilen kaydolabilir; kod zaten gizli.
create or replace function public.bildirim_kaydet(
  p_kod      uuid,
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  select id into v_id from orders
  where code = p_kod and created_at > now() - interval '2 days';

  if v_id is null then
    raise exception 'Sipariş bulunamadı';
  end if;

  if coalesce(btrim(p_endpoint), '') = '' or char_length(p_endpoint) > 500 then
    raise exception 'Geçersiz abonelik';
  end if;

  insert into push_subs (order_id, endpoint, p256dh, auth)
  values (v_id, p_endpoint, left(p_p256dh, 200), left(p_auth, 200))
  on conflict (order_id, endpoint) do nothing;
end;
$$;

-- ---------- Aboneliği bırak ----------
create or replace function public.bildirim_birak(p_kod uuid, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from push_subs s
  using orders o
  where s.order_id = o.id and o.code = p_kod and s.endpoint = p_endpoint;
end;
$$;

-- ---------- Gönderim için hedefler ----------
-- YALNIZCA sunucu (service_role) çağırır. Müşteri başkasının
-- abonelik bilgisine ulaşamaz.
create or replace function public.bildirim_hedefleri(p_id bigint)
returns table (endpoint text, p256dh text, auth text, table_no integer, status text)
language sql
stable
security definer
set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth, o.table_no, o.status
  from push_subs s
  join orders o on o.id = s.order_id
  where s.order_id = p_id;
$$;

-- Geçersiz abonelikleri temizlemek için (tarayıcı 410 dönerse).
create or replace function public.bildirim_sil_endpoint(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from push_subs where endpoint = p_endpoint;
$$;

-- ---------- İzinler ----------
alter table public.push_subs enable row level security;

revoke all on public.push_subs from anon, authenticated;

revoke all on function public.bildirim_kaydet(uuid, text, text, text) from public;
revoke all on function public.bildirim_birak(uuid, text)              from public;
revoke all on function public.bildirim_hedefleri(bigint)              from public;
revoke all on function public.bildirim_sil_endpoint(text)             from public;

grant execute on function public.bildirim_kaydet(uuid, text, text, text) to anon, authenticated;
grant execute on function public.bildirim_birak(uuid, text)              to anon, authenticated;
-- hedefleri ve sil_endpoint yalnızca service_role tarafından çağrılır.
