# Sipariş hazır bildirimi — kurulum

## 1) SQL

`18_bildirim.sql` dosyasını çalıştırın. Ardından:
`notify pgrst, 'reload schema';`

## 2) VAPID anahtarlarını üretin

Bildirim göndermek için bir anahtar çiftine ihtiyaç var. Proje klasöründe:

```bash
npx web-push generate-vapid-keys
```

İki değer basar: **Public Key** ve **Private Key**. Public olan tarayıcıya
gider (gizli değil), Private olan yalnızca sunucuda kalır.

## 3) Anahtarları tanımlayın

Sunucu tarafı:

```bash
npx supabase secrets set VAPID_PUBLIC_KEY=BURAYA_PUBLIC
npx supabase secrets set VAPID_PRIVATE_KEY=BURAYA_PRIVATE
npx supabase secrets set VAPID_SUBJECT=mailto:info@lajoiemersin.com.tr
```

Tarayıcı tarafı — `web/.env` dosyasına ekleyin:

```
VITE_VAPID_PUBLIC_KEY=BURAYA_PUBLIC
```

Aynı değeri **Vercel → Settings → Environment Variables**'a da ekleyin
(`VITE_VAPID_PUBLIC_KEY`). Vercel derlemeyi kendi değişkenleriyle yapar;
oraya eklenmezse canlıda bildirim düğmesi hiç görünmez.

## 4) Fonksiyonu yayınlayın

```bash
npx supabase functions deploy bildirim-gonder --use-api
```

## 5) Test

1. Telefondan sipariş verin.
2. Takip sayfasında **"🔔 Hazır olunca haber ver"** düğmesine dokunun,
   izin verin.
3. Panelden siparişi "Hazır" yapın.
4. Telefona bildirim düşmeli.

## iPhone notu

Apple, tarayıcı bildirimine yalnızca site **ana ekrana eklenmişse** izin
verir. Eklenmemiş iPhone'larda düğme yerine "Ana Ekrana Ekle" yönergesi
görünür. Android'de böyle bir kısıt yok.

Bu yüzden ikinci bir katman var: takip sayfası açıkken sipariş hazır
olduğunda **ses ve titreşim** ile uyarır. Bildirim çalışmasa bile
müşteri fark eder.

## Ne zaman bildirim gider?

- Sipariş "Hazırlanıyor" olunca
- Sipariş "Hazır" olunca
- Sipariş iptal edilince

Bildirim gönderimi başarısız olsa bile sipariş akışı etkilenmez.
