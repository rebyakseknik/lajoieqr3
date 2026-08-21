# La Joie — Dijital Menü

React + Node.js + Supabase ile çalışan QR menü ve yönetim paneli.

---

## Ne nerede duruyor

| Klasör | Ne yapar |
|---|---|
| `supabase/` | Veritabanı betikleri. Bir kez çalıştırılır. |
| `server/` | Node sunucusu. Ziyaret istatistiklerini yazar ve siteyi yayınlar. |
| `web/` | React arayüzü. Hem müşteri menüsü hem yönetim paneli. |

---

## Kurulum

Toplam süre yaklaşık 30 dakika. Bilgisayarınızda **Node.js 20 veya üstü** kurulu olmalı
(nodejs.org adresinden indirebilirsiniz).

### 1. Supabase projesi açın

1. [supabase.com](https://supabase.com) adresine girip ücretsiz hesap açın.
2. **New project** deyin. Bölge olarak **Frankfurt (eu-central-1)** seçin — Türkiye'ye en yakın olanı.
3. Veritabanı şifresi belirleyin ve bir yere kaydedin.
4. Proje hazırlanması birkaç dakika sürer.

### 2. Veritabanını kurun

Supabase panelinde soldaki menüden **SQL Editor** açın. `supabase/` klasöründeki
beş dosyayı **sırayla** açıp içeriğini yapıştırın ve her birinde **Run** deyin:

1. `01_schema.sql` — tablolar
2. `02_guvenlik.sql` — güvenlik kuralları
3. `03_istatistik.sql` — dashboard hesaplamaları
4. `04_depo.sql` — fotoğraf deposu
5. `05_baslangic_verisi.sql` — kategoriler ve mevcut kahvaltı ürünleriniz

Sıra önemli. Her biri "Success" demeden sonrakine geçmeyin.

### 3. Kendinizi yönetici yapın

**a) Kullanıcı oluşturun**

Sol menüden **Authentication → Users → Add user → Create new user**.
E-postanızı ve güçlü bir şifre yazın. **Auto Confirm User** kutusunu işaretleyin.

**b) Yönetici yetkisi verin**

Kullanıcı oluşunca listede görünen **UID** değerini kopyalayın.
SQL Editor'e dönüp şunu çalıştırın (tırnak içini kendi bilgilerinizle değiştirin):

```sql
insert into public.admins (user_id, email)
values ('BURAYA-UID-YAPISTIRIN', 'eposta@adresiniz.com');
```

> Bu adım olmadan giriş yapsanız bile panel açılmaz. Bilerek böyle:
> birisi Supabase'de hesap açsa dahi menünüze dokunamaz.

### 4. Anahtarları alın

Sol menüden **Settings → API**. Üç değer lazım:

| Değer | Nerede kullanılır |
|---|---|
| **Project URL** | Hem `web` hem `server` |
| **anon public** | Sadece `web` |
| **service_role** | Sadece `server` |

> **service_role anahtarı tüm güvenlik kurallarını aşar.** Yalnızca sunucuda durur.
> Tarayıcıya, GitHub'a veya WhatsApp'a asla göndermeyin.

### 5. Ayar dosyasını doldurun

Projede **tek bir `.env` dosyası** vardır ve **kök klasörde** durur.
Hem web hem server buradan okur. Kökteki `.env.example` dosyasını kopyalayıp
adını `.env` yapın:

```
# Tarayiciya giden degerler
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=anon-public-anahtariniz

# Yalnizca sunucunun kullandigi degerler
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role-anahtariniz
ALLOWED_ORIGIN=https://lajoiemersin.com
PORT=3000
```

### 6. Çalıştırın

Terminal açıp sırayla:

```bash
cd server && npm install
cd ../web && npm install && npm run build
cd ../server && npm start
```

Tarayıcıdan `http://localhost:3000` açın. Menü görünmeli.
Panel için `http://localhost:3000/panel` — 3. adımdaki e-posta ve şifreyle girin.

---

## Yayına alma

Menünün internetten erişilebilir olması için Node çalıştırabilen bir yer gerekiyor.
Eski PHP hostingi bunu yapamaz. Üç seçenek:

**Render (en kolay, ücretsiz başlangıç)**
1. Kodu GitHub'a yükleyin.
2. [render.com](https://render.com) → New → Web Service → deponuzu seçin.
3. Build Command: `cd web && npm install && npm run build && cd ../server && npm install`
4. Start Command: `cd server && npm start`
5. Environment sekmesinden `.env` içindeki değerleri tek tek girin.
6. Alan adınızı Settings → Custom Domain'den bağlayın.

**Türk VPS (aylık ~150-300 TL)**
Node kurulu bir sunucuda aynı komutları çalıştırıp `pm2` ile ayakta tutun.
Yerel destek isterseniz bu daha rahat.

**Vercel + Render**
Arayüzü Vercel'de, sunucuyu Render'da barındırabilirsiniz. Daha hızlı ama iki yer yönetmek gerekir.

> **Vercel'de beyaz sayfa görüyorsanız:** `.env` dosyası git'e girmediği için Vercel
> onu göremez. Vercel panelinde **Settings → Environment Variables** bölümüne
> `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` değerlerini (kök `.env` dosyanızdaki
> değerlerle aynı) ekleyin ve **Redeploy** yapın. Bu iki değer derleme sırasında
> koda gömülür; eklenmezse menü Supabase'e bağlanamaz.
> `SUPABASE_SERVICE_ROLE_KEY` değerini Vercel'e **eklemeyin** — o yalnızca Node
> sunucusuna (Render/VPS) aittir.

Hangisini seçerseniz seçin, `ALLOWED_ORIGIN` değerini gerçek alan adınızla güncelleyin.

---

## Günlük kullanım

Panel telefondan da çalışır.

- **Ürün bittiğinde:** Ürünler → ilgili ürün → **Bugün yok**. Menüde soluklaşır, fiyatı üstü çizili olur. Ertesi gün **Geri koy**.
- **Zam yaptığınızda:** Ürünler → **Düzenle** → fiyatı değiştirin. Anında yansır.
- **Yeni ürün grubu:** **Toplu ekle** ekranına satır satır yapıştırın, önizlemeyi kontrol edip onaylayın.
- **İstatistikler:** **Özet** ekranı — kaç kişi baktı, hangi saatler yoğun, hangi ürünler ilgi çekiyor.

---

## Güvenlik hakkında

Sistem iki katmanlı korunuyor:

**Veritabanı katmanı (asıl koruma).** Her tabloda satır düzeyi güvenlik açık.
Tarayıcıdaki anon anahtarı ele geçse bile o anahtarla menü değiştirilemez,
ürün silinemez, sahte istatistik yazılamaz. Test edildi.

**Uygulama katmanı.** Panel ekranı yönetici olmayanı içeri almaz, sunucu
istekleri doğrular, dakikada 60 kayıt sınırı ve bot filtresi uygular.

Yeni yönetici eklemek yalnızca Supabase panelinden, elle yapılır.
Bir yönetici hesabı ele geçse bile yeni yönetici üretemez.

---

## Sorun giderme

**Menü boş görünüyor**
Kök klasördeki `.env` dosyasında `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` değerlerini kontrol edin. Değiştirdiyseniz `npm run build` komutunu tekrar çalıştırın.

**"Bu hesap panele yetkili değil"**
3. adımdaki `insert into public.admins` sorgusu çalıştırılmamış veya UID yanlış kopyalanmış.

**Fotoğraf yüklenmiyor**
`04_depo.sql` çalıştırılmamış olabilir. Supabase → Storage bölümünde `menu-images` kovası görünüyor mu bakın.

**İstatistikler artmıyor**
Kök `.env` dosyasında `SUPABASE_SERVICE_ROLE_KEY` eksik veya yanlış olabilir.
Sunucu günlüğünde "Olay kaydedilemedi" satırı varsa sebebi budur.

**Panel açılıyor ama kaydetmiyor**
`02_guvenlik.sql` yarım çalışmış olabilir. SQL Editor'de tekrar çalıştırın; betik
tekrar çalıştırmaya uygun yazıldı, zarar vermez.

---

## Yedek

Supabase günlük otomatik yedek alır. Kendi kopyanızı istiyorsanız
**Database → Backups** bölümünden indirebilirsiniz. Ayda bir yeterli.
