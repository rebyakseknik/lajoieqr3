-- La Joie Dijital Menü — 19. adım: künye bilgileri
--
-- Menünün altındaki adres/saat/iletişim bölümü için ayarlar.
-- Boş bırakılan alan menüde hiç görünmez.

insert into public.settings (key, value) values
  ('address',   'Dershaneler Sokağı, Mersin'),
  ('hours',     'Her gün 08:00 – 22:00'),
  ('phone',     ''),
  ('instagram', ''),
  ('maps_url',  '')
on conflict (key) do nothing;
