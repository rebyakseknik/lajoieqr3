# Kampanyalar + tek kod alanı — kurulum

## SQL

`11_kampanya.sql` dosyasını çalıştırın. Mevcut veriyi bozmaz.

Dikkat: bu dosya `siparis_olustur` fonksiyonunun imzasını değiştirir
(`p_kupon` + `p_hediye` yerine tek `p_kodlar` dizisi). SQL'i çalıştırdıktan
sonra `web/` klasörünü de mutlaka güncelleyin, yoksa sipariş verilemez.

Dosya örnek olarak "hosgeldin" kampanyasını kurar: hesap açan herkese
%10, 30 gün geçerli. İstemiyorsanız Panel → Kampanyalar'dan durdurun.

## Nasıl çalışıyor

**Tek kod alanı.** Müşteri kupon mu hediye kartı mı olduğunu bilmek
zorunda değil; kodu yazar, veritabanı hangisi olduğunu bulur. Bir
siparişte en fazla 1 kupon + 1 hediye kartı kullanılabilir.

**Kampanya = kupon şablonu.** Kişi hesap açtığında şablondan ona özel,
tek kullanımlık bir kupon üretilir. Bu kupon başkasının elinde
çalışmaz (`owner_id` kontrolü veritabanında).

**İki tetikleme yolu:**
- `auto_signup` açık kampanya → hesap açan herkese verilir.
  Aynı anda yalnızca bir tane olabilir.
- Kampanya bağlantısı → `/kayit/<ad>` adresinden gelip kaydolana verilir.

**Bağlantı ve QR.** Panel → Kampanyalar'da her kampanyanın adresi ve
QR kodu var. QR'ı indirip masaya/afişe bastırabilir, adresi Instagram'da
paylaşabilirsiniz. Adres 30 gün tarayıcıda hatırlanır; kişi hemen
kaydolmasa da sonra kaydolduğunda kuponu alır.

**Sipariş ekranında.** Hesabındaki kuponlar kart olarak listelenir,
dokununca uygulanır. Sepet tutarı alt limitin altındaysa kupon soluk
görünür ve neden kullanılamadığı yazar.

## Güvenlik notu

Kupon `/kayit/<ad>` adresine girildiğinde DEĞİL, kişi hesap açtığında
üretilir. Böylece adresi paylaşan biri kupon basamaz. Kampanyaya
"en fazla kaç kişiye" sınırı koyabilirsiniz.
