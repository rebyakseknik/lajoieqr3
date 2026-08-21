# Hesap + kupon katmanı — kurulum

## 1) SQL

Yeni Supabase projesinde sırayla:

```
01_schema.sql
02_guvenlik.sql
03_istatistik.sql
04_depo.sql
05_baslangic_verisi.sql
06_onsiparis.sql
07_hesap_kupon.sql   ← yeni
```

Ön sipariş katmanı zaten kuruluysa yalnızca `07_hesap_kupon.sql` yeterli.
Dosya mevcut verinizi bozmaz: `orders` tablosuna yeni sütunlar ekler,
eski siparişlerin `subtotal` alanını doldurur ve `siparis_olustur`
fonksiyonunu kupon destekli sürümüyle değiştirir.

## 2) Supabase Auth ayarları

**Authentication → Providers → Email** açık olmalı.

**Authentication → URL Configuration → Site URL** alanına sitenin adresini
yazın (`https://...`). Şifre sıfırlama ve doğrulama bağlantıları buraya döner;
boş kalırsa müşteri `localhost` adresine yönlenir.

**E-posta doğrulaması** (Confirm email) varsayılan olarak açıktır. Açık
bırakırsanız müşteri kaydolduktan sonra e-postasını doğrulayana kadar giriş
yapamaz — arayüz bunu zaten söylüyor. Öğle arası akışında sürtünme
yaratıyorsa kapatabilirsiniz; hesap zaten sipariş için zorunlu değil.

Ücretsiz katmanda Supabase'in kendi SMTP'si günde az sayıda e-posta
gönderir. Gerçek kullanıma geçerken **Project Settings → Auth → SMTP**
bölümünden kendi sağlayıcınızı tanımlayın.

## 3) Yeni ekranlar

| Adres | Kim görür | Ne yapar |
|---|---|---|
| `/hesabim` | müşteri | geçmiş siparişler, hediye kartı cüzdanı, bilgiler |
| `/panel/kuponlar` | yönetici | kupon oluştur, hediye kartı üret, durdur |

Menünün sağ üstünde "Giriş yap" / "Hesabım" düğmesi çıkar. Sepet ekranının
5. adımında kupon ve hediye kartı kodu alanları vardır.

## 4) İki kavram karışmasın

**İndirim kuponu** — yüzde ya da tutar indirimi yapar. Aynı kod birçok kişi
tarafından kullanılabilir. Kullanım sınırı, alt limit, tavan, son tarih ve
"yalnızca üyeler" koşulu konabilir.

**Hediye kartı** — bakiye taşır. Kısmen harcanır, kalanı kartta kalır.
Kod 12 karakter ve rastgeledir (karışan harfler elenmiştir); tahmin
edilemez olması gerekir çünkü kodu bilen parayı harcayabilir.

Bir siparişte ikisi birden kullanılabilir: önce kupon indirimi düşer,
kalan tutara hediye kartı uygulanır.

## 5) Güvenlik notları

- Kupon ve hediye kartı tabloları tarayıcıya **açılmaz**. Müşteri yalnızca
  bildiği kodu sorabilir; kod listesini çekemez.
- İndirim hesabı `indirim_onizle` ve `siparis_olustur` içinde **aynı
  fonksiyonla** yapılır. Sepette görünen indirimle uygulanan indirim
  farklı olamaz.
- Hediye kartı bakiyesi düşülürken satır kilitlenir (`for update`).
  Aynı kart iki siparişte aynı anda kullanılırsa bakiye eksiye düşmez.
- Sipariş iptal edilirse hediye kartı bakiyesi geri yüklenir ve kuponun
  kullanım hakkı iade edilir. `refunded` bayrağı çift iadeyi engeller.
- Müşteri hesabı açmak panele **hiçbir yetki vermez**. Panel yetkisi
  yalnızca `admins` tablosundadır.

## 6) Sipariş tutarları

`orders` tablosunda artık dört alan var:

- `subtotal` — ürünlerin gerçek toplamı (ciro analizi bunu kullanmalı)
- `discount` — kupon indirimi
- `gift_used` — hediye kartından düşen
- `total` — **kasada tahsil edilecek** tutar

Paneldeki günün cirosu `total` toplamıdır, yani gerçekten kasaya girecek
paradır. Hediye kartıyla ödenen kısım burada görünmez çünkü o para
kart satılırken zaten tahsil edilmiştir.
