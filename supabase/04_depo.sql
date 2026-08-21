-- La Joie Dijital Menü — 4. adım: fotoğraf deposu

-- Ürün fotoğrafları için herkese açık okunabilir bir kova.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists menu_images_public_read on storage.objects;
drop policy if exists menu_images_admin_write on storage.objects;

-- Müşteriler fotoğrafları görebilir.
create policy menu_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'menu-images');

-- Yükleme, değiştirme ve silme yalnızca yöneticide.
create policy menu_images_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'menu-images' and public.is_admin())
  with check (bucket_id = 'menu-images' and public.is_admin());
