# Ön sipariş katmanı — kurulum

Yeni Supabase projesinde sırayla çalıştırın (SQL Editor):

```
01_schema.sql
02_guvenlik.sql
03_istatistik.sql
04_depo.sql
05_baslangic_verisi.sql
06_onsiparis.sql   ← yeni
```

Mevcut bir projeye ekliyorsanız yalnızca `06_onsiparis.sql` yeterlidir;
dosya `products` tablosuna `orderable` sütununu kendisi ekler ve
ayarları `on conflict do nothing` ile yazar, yani var olan verinizi bozmaz.

## Sonrasında

1. **Database → Replication** bölümünde `orders` tablosunun yayında
   göründüğünü doğrulayın. Panelin siparişi yenilemeden görmesi buna bağlı.
2. Panel → **Ayarlar → Ön sipariş** bölümünden saatleri ve kapasiteyi
   işletmeye göre ayarlayın.
3. Panel → **Ürünler** ekranında ön siparişe kapatmak istediğiniz ürünlerde
   "Ön siparişe açık" kutusunu boşaltın.

## Yeni ekranlar

| Adres | Kim görür | Ne yapar |
|---|---|---|
| `/` | müşteri | menü + sepet + ön sipariş |
| `/siparis/:kod` | müşteri | sanal masa numarası ve canlı durum |
| `/panel/siparisler` | yönetici | mutfak panosu, sesli uyarı |

## Güvenlik notu

Tarayıcı `orders` tablosuna yazamaz. Sipariş oluşturma, okuma ve iptal
işlemleri yalnızca `siparis_*` fonksiyonları üzerinden yapılır. Fiyatlar,
toplam tutar ve masa numarası daima veritabanında hesaplanır; tarayıcıdan
gelen fiyat bilgisi kullanılmaz.
