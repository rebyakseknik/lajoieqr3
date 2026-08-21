-- La Joie Dijital Menü — 5. adım: kategoriler ve mevcut kahvaltı ürünleri
-- Bu betik yalnızca tablolar boşsa veri ekler, tekrar çalıştırmak zararsızdır.

insert into public.categories (name, position)
select * from (values
  ('KAHVALTI', 10), ('SALATALAR', 20), ('ATIŞTIRMALIKLAR', 30),
  ('ANA YEMEKLER', 40), ('MAKARNALAR', 50), ('SICAK KAHVELER', 60),
  ('SOĞUK KAHVELER', 70), ('SICAK İÇECEKLER', 80), ('SOĞUK İÇECEKLER', 90),
  ('TATLILAR', 100), ('KAMPANYALI MENÜLER', 110)
) as v(name, position)
where not exists (select 1 from public.categories);

insert into public.products (category_id, name, description, price, position)
select c.id, v.name, v.description, v.price, v.position
from (values
  ('OMLET',               'Yumurta, domates, salata mix',                                        200, 10),
  ('MANTARLI OMLET',      'Yumurta, domates, mantar, salata mix',                                230, 20),
  ('SEBZELİ OMLET',       'Yumurta, domates, mantar, salata mix, çarliston biber, kapya biber',  240, 30),
  ('KAŞARLI TOST',        '',                                                                    200, 40),
  ('SUCUKLU TOST',        'Kaşar, sucuk',                                                        230, 50),
  ('KARIŞIK TOST',        'Sucuk, kaşar, kapya biber, çarliston biber, domates',                 260, 60),
  ('SEBZELİ TOST',        'Domates, çarliston biber, kapya biber, salça, kaşar peyniri',         230, 70),
  ('3 PEYNİRLİ KRUVASAN', 'Mozarella, cheddar, kaşar peyniri, roka',                             275, 80)
) as v(name, description, price, position)
cross join (select id from public.categories where name = 'KAHVALTI' limit 1) c
where not exists (select 1 from public.products);
