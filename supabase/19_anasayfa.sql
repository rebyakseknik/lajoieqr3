-- La Joie Dijital Menü — 19. adım: ana sayfa ve künye içerik ayarları
--
-- Adres, saat ve iletişim bilgileri panelden düzenlenebilsin diye
-- ayarlar tablosuna yeni anahtarlar. Kod değişmeden güncellenebilir.

insert into public.settings (key, value) values
  ('address',    'Dershaneler Sokağı, Mersin'),
  ('hours',      'Her gün 09:00 – 22:00'),
  ('phone',      ''),
  ('instagram',  ''),
  ('maps_url',   ''),
  ('about_text', 'Öğle aranız kısıtlıysa menüden seçip önden sipariş bırakın; geldiğinizde hazır olsun.'),
  ('hero_note',  'Beklemeden ye')
on conflict (key) do nothing;
