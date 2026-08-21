-- La Joie Dijital Menü — 2. adım: güvenlik kuralları (RLS)
--
-- Buradaki mantık şu: tarayıcıya giden anahtar herkese açıktır, o yüzden
-- güvenlik tarayıcıda değil veritabanında kurulur. Aşağıdaki kurallar,
-- birisi anahtarı alıp doğrudan veritabanına istek atsa bile
-- menüyü değiştiremeyeceğini garanti eder.

-- ---------- Yönetici mi? ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Tablo izinleri ----------
-- İki katmanlı koruma: önce rolün tabloya hangi işlemleri yapabileceği,
-- sonra RLS'in hangi satırlara izin verdiği. Supabase bu izinleri
-- yeni tablolara genelde kendi verir; yine de açıkça yazıyoruz ki
-- betik her projede aynı sonucu üretsin.

grant usage on schema public to anon, authenticated;

-- Ziyaretçi yalnızca okur.
grant select on public.categories, public.products, public.settings to anon;

-- Giriş yapmış kullanıcı yazma denemesi yapabilir; hangi satıra
-- dokunabileceğine aşağıdaki RLS kuralları karar verir.
grant select, insert, update, delete
  on public.categories, public.products, public.settings to authenticated;

grant select on public.admins, public.events to authenticated;

-- Olay tablosuna hiçbir tarayıcı rolü yazamaz; yazma işini
-- yalnızca Node sunucusu (service_role) yapar.
revoke insert, update, delete on public.events from anon, authenticated;

-- ---------- RLS'i aç ----------
alter table public.admins     enable row level security;
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.settings   enable row level security;
alter table public.events     enable row level security;

-- Eski kurallar varsa temizle (betiği tekrar çalıştırabilmek için)
drop policy if exists admins_self_read        on public.admins;
drop policy if exists categories_public_read  on public.categories;
drop policy if exists categories_admin_write  on public.categories;
drop policy if exists products_public_read    on public.products;
drop policy if exists products_admin_write    on public.products;
drop policy if exists settings_public_read    on public.settings;
drop policy if exists settings_admin_write    on public.settings;
drop policy if exists events_admin_read       on public.events;

-- ---------- Yöneticiler tablosu ----------
-- Kişi yalnızca kendi kaydını görebilir. Yönetici ekleme/çıkarma
-- işlemi sadece Supabase panelinden elle yapılır — böylece
-- bir yönetici hesabı ele geçse bile yeni yönetici üretilemez.
create policy admins_self_read on public.admins
  for select to authenticated
  using (user_id = auth.uid());

-- ---------- Kategoriler ----------
-- Herkes aktif kategorileri okuyabilir; yönetici hepsini görür ve yazar.
create policy categories_public_read on public.categories
  for select to anon, authenticated
  using (active = true or public.is_admin());

create policy categories_admin_write on public.categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Ürünler ----------
create policy products_public_read on public.products
  for select to anon, authenticated
  using (active = true or public.is_admin());

create policy products_admin_write on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Ayarlar ----------
create policy settings_public_read on public.settings
  for select to anon, authenticated
  using (true);

create policy settings_admin_write on public.settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Olaylar ----------
-- Hiç kimse tarayıcıdan olay YAZAMAZ. Yazma işini yalnızca
-- Node sunucusu yapar (service role anahtarıyla, RLS'i aşarak).
-- Böylece istatistikler sahte kayıtlarla şişirilemez.
create policy events_admin_read on public.events
  for select to authenticated
  using (public.is_admin());
