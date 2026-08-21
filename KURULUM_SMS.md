# SMS ile giriş + yeni Hesabım ekranı — kurulum

## 1) SQL

`08_sms_hesap.sql` dosyasını SQL Editor'de çalıştırın. Mevcut veriyi bozmaz:
profil tetikleyicisini telefon kayıtlarını tanıyacak şekilde yeniler,
`siparislerim` fonksiyonunu sipariş içeriğiyle dönecek hale getirir
(yeni "Aynısını sepete ekle" düğmesi bunu kullanır) ve `hesap_ozet`
fonksiyonunu ekler.

## 2) SMS sağlayıcısı — işin asıl kısmı burası

Supabase SMS'i kendisi göndermez; bir sağlayıcıya bağlanır.
**Authentication → Providers → Phone** bölümünü açın:

1. "Enable Phone provider" işaretleyin.
2. SMS provider olarak birini seçin: **Twilio**, MessageBird, Vonage
   veya Textlocal. Türkiye'de en sorunsuz bilineni Twilio'dur.
3. Seçtiğiniz sağlayıcıdan hesap açıp API bilgilerini
   (Twilio için Account SID, Auth Token, Message Service SID) buraya girin.

Bilmeniz gerekenler:

- **Her SMS paralıdır.** Twilio'da Türkiye'ye SMS yaklaşık bir kaç cent.
  Aylık giriş sayınızı düşünüp hesaplayın; öğle arası müşterisi için
  makul bir maliyettir ama sıfır değildir.
- **Twilio deneme hesabı yalnızca doğrulanmış numaralara gönderir.**
  Gerçek müşteriye SMS gitmesi için hesabı ücretli plana yükseltmeniz gerekir.
- **Rate limit:** Supabase, Authentication → Rate Limits bölümünde saatte
  gönderilecek SMS sayısını sınırlar. Kötüye kullanımı (birinin sürekli
  kod istetip size fatura yazdırmasını) bu sınır engeller; varsayılanı
  düşürmeyin, gerekiyorsa özelleştirin.

## 3) Panelden yöntemi seçin

Panel → **Ayarlar → Ön sipariş → Üye girişi yöntemi**:

- **E-posta + şifre** (varsayılan) — sağlayıcı gerektirmez.
- **Telefon + SMS kodu** — yukarıdaki kurulum tamamlandıysa seçin.

Bu ayar yalnızca hangi yöntemin önce gösterileceğini belirler; müşteri
penceredeki "E-posta ile devam et / SMS ile devam et" düğmesiyle her
zaman diğerine geçebilir. Yani SMS'te bir sorun çıkarsa kimse dışarıda
kalmaz.

## 4) SMS akışı nasıl çalışır

Kayıt ve giriş ayrı değildir: müşteri numarasını yazar, 6 haneli kod
gelir, kodu girer. Numara sistemde yoksa hesap o anda açılır. Şifre yok.
Kod alanı 6 hane dolunca kendiliğinden doğrular; iOS/Android gelen
SMS'teki kodu klavyenin üstünde önerir (`autocomplete="one-time-code"`).
Kod gelmezse 60 saniye sonra yeniden istenebilir.

Numarayı hangi biçimde yazarsa yazsın (05xx, +90 5xx, 5xx…) sistem
+90'lı standarda çevirir; geçersiz numaraya hiç SMS denenmez.

## 5) Yeni Hesabım ekranı

- **Kapak kartı:** baş harfli avatar, ad, iletişim, üyelik tarihi ve üç
  sayı — sipariş adedi, toplam harcama, kart bakiyesi.
- **Siparişlerim:** her sipariş içeriğiyle listelenir; "Aynısını sepete
  ekle" düğmesi ürünleri GÜNCEL fiyat ve stokla sepete koyup menüde
  sepeti açar. Menüden kalkan ürünler atlanır ve söylenir.
- **Cüzdanım:** hediye kartları gerçek kart görünümünde; biten kartlar
  ayrı bir katlanır listede.
- **Bilgilerim:** ad ve telefon; sepette otomatik dolar.
