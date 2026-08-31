# PayTR entegrasyonu — kurulum ve canlıya alma

Veritabanı tarafı (10_odeme.sql) zaten kurulu. Bu adımda iki sunucu
fonksiyonu yayınlanır ve PayTR paneli bağlanır.

## 1) PayTR panelinden üç değeri alın

Mağaza Paneli → Bilgi sayfasında: **Merchant ID**, **Merchant Key**,
**Merchant Salt**.

## 2) Gizli değerleri Supabase'e tanımlayın

Bilgisayarınızda Supabase CLI kuruluysa (`npm i -g supabase`):

```bash
supabase login
supabase link --project-ref <PROJE_REF>   # panel adresindeki kısa kod

supabase secrets set PAYTR_MERCHANT_ID=xxxxx
supabase secrets set PAYTR_MERCHANT_KEY=xxxxxxxxxxxx
supabase secrets set PAYTR_MERCHANT_SALT=xxxxxxxxxxxx
supabase secrets set SITE_URL=https://SITENIZIN-ADRESI
supabase secrets set PAYTR_TEST=1
```

`SITE_URL` sonunda `/` olmadan yazılır. `PAYTR_TEST=1` test modudur;
gerçek karttan para çekilmez.

## 3) Fonksiyonları yayınlayın

Proje kök klasöründe:

```bash
supabase functions deploy paytr-token
supabase functions deploy paytr-webhook --no-verify-jwt
```

`--no-verify-jwt` webhook için ZORUNLUDUR: PayTR'nin sunucusu Supabase
anahtarı taşımaz; onun kimliğini anahtarla değil, istekteki imzayla
(hash) doğruluyoruz.

## 4) PayTR paneline Bildirim URL'ini yazın

Mağaza Paneli → Ayarlar → **Bildirim URL**:

```
https://<PROJE_REF>.supabase.co/functions/v1/paytr-webhook
```

Siparişi onaylayan tek şey bu adrese gelen bildirimdir. Yanlış yazılırsa
müşteri ödese bile sipariş "ödeme bekleniyor"da kalır.

## 5) Test edin (canlıya almadan)

1. Panel → Ayarlar → Ön sipariş → **Online ödeme** kutusunu işaretleyin.
2. Menüden sipariş verin, "Şimdi online" seçin.
3. Kart ekranında PayTR'nin test kartını kullanın (PayTR dokümanındaki
   test kart numarası; test modunda gerçek kart da çekim yapmaz).
4. Ödeme sonrası sayfanın kendiliğinden takip ekranına geçtiğini,
   mutfak panosuna siparişin "ödendi" rozetiyle düştüğünü ve sesin
   çaldığını görün.
5. Bir de yarıda bırakın: kart ekranını kapatın, 15 dakika sonra
   siparişin kendiliğinden iptal olduğunu ve (kupon kullandıysanız)
   hakkın iade edildiğini doğrulayın.

Sorun çıkarsa: Supabase panel → Edge Functions → Logs. Token hatası
`paytr-token` günlüğünde, bildirim sorunu `paytr-webhook` günlüğünde
sebebiyle görünür. PayTR panelindeki İşlemler sayfası da her denemeyi
listeler.

## 6) Canlıya alın

```bash
supabase secrets set PAYTR_TEST=0
supabase functions deploy paytr-token
supabase functions deploy paytr-webhook --no-verify-jwt
```

(secrets değişince fonksiyonları yeniden yayınlamak gerekir.)

Kendi kartınızla 1 gerçek sipariş verin, tutarın PayTR paneline
düştüğünü görün. İadeyi de PayTR panelinden test edin.

## Güvenlik özeti

- Mağaza anahtarları yalnızca sunucu fonksiyonlarında; tarayıcıya inmez.
- Tutar ve sepet veritabanından okunur; tarayıcının gönderdiği tutar yok.
- Webhook imzası HMAC-SHA256 ile doğrulanır; imzasız "ödendi" işlenmez.
- Aynı bildirim iki kez gelirse ikincisi hiçbir şeyi değiştirmez.
- Kart bilgisi sisteminize hiç girmez; PayTR iframe'inde kalır.

## Not

PayTR imza birleşim sıraları dokümanlarındaki örnek kodla birebir
yazıldı; yine de ilk test "hash" hatası verirse mağaza panelinizdeki
entegrasyon örneğiyle alan sırasını karşılaştırın — PayTR nadiren de
olsa sürüm farkı yapabiliyor.
