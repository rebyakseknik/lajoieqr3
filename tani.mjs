/**
 * La Joie — bağlantı teşhisi
 *
 * Kullanım:  web klasöründe   node ../tani.mjs
 *            (veya kök klasörde  node tani.mjs)
 *
 * Menü açılmıyorsa bu betik nedenini tam olarak söyler.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = dirname(fileURLToPath(import.meta.url));

const YESIL = '\x1b[32m', KIRMIZI = '\x1b[31m', SARI = '\x1b[33m', GRI = '\x1b[90m', SIFIR = '\x1b[0m';
const ok = (m) => console.log(`${YESIL}  ✓${SIFIR} ${m}`);
const yok = (m) => console.log(`${KIRMIZI}  ✕${SIFIR} ${m}`);
const not = (m) => console.log(`${SARI}  !${SIFIR} ${m}`);
const ipucu = (m) => console.log(`${GRI}    → ${m}${SIFIR}`);

let sorunVar = false;

function baslik(m) {
  console.log(`\n${m}`);
  console.log('─'.repeat(Math.min(m.length + 6, 60)));
}

/* ---------- .env okuma ---------- */

function envOku(yol) {
  if (!existsSync(yol)) return null;
  const nesne = {};
  for (const satir of readFileSync(yol, 'utf-8').split(/\r?\n/)) {
    const t = satir.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    nesne[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return nesne;
}

/* ---------- 1. Ayar dosyaları ---------- */

baslik('1. Ayar dosyaları');

// Tek .env: kök klasörde durur. (Eski web/.env ve server/.env destekleri kaldırıldı.)
const env = envOku(join(kok, '.env'));

if (!env) {
  yok('.env bulunamadı (kök klasörde olmalı)');
  ipucu('.env.example dosyasını kopyalayıp adını .env yapın');
  sorunVar = true;
} else {
  ok('.env bulundu (kök klasör)');
}

const url = env?.VITE_SUPABASE_URL;
const anon = env?.VITE_SUPABASE_ANON_KEY;

if (!url) { yok('VITE_SUPABASE_URL boş'); sorunVar = true; }
else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
  yok(`VITE_SUPABASE_URL biçimi tuhaf: ${url}`);
  ipucu('https://xxxxx.supabase.co şeklinde olmalı, sonunda / veya /rest gibi ek olmamalı');
  sorunVar = true;
} else ok(`Proje adresi: ${url}`);

if (!anon) { yok('VITE_SUPABASE_ANON_KEY boş'); sorunVar = true; }
else if (!anon.startsWith('eyJ') && !anon.startsWith('sb_')) {
  yok('VITE_SUPABASE_ANON_KEY bir Supabase anahtarına benzemiyor');
  ipucu('Settings > API > anon public değerini kopyalayın');
  sorunVar = true;
} else {
  // JWT ise içindeki rolü kontrol et
  if (anon.startsWith('eyJ')) {
    try {
      const govde = JSON.parse(Buffer.from(anon.split('.')[1], 'base64').toString());
      if (govde.role === 'service_role') {
        yok('DİKKAT: VITE_SUPABASE_ANON_KEY olarak service_role anahtarı konmuş!');
        ipucu('Bu anahtar tarayıcıya gitmemeli. anon public anahtarıyla değiştirin.');
        sorunVar = true;
      } else if (govde.role === 'anon') {
        ok('Anahtar geçerli (rol: anon)');
      } else {
        not(`Anahtardaki rol beklenmedik: ${govde.role}`);
      }
      if (govde.exp && govde.exp * 1000 < Date.now()) {
        yok('Anahtarın süresi dolmuş');
        sorunVar = true;
      }
    } catch {
      not('Anahtar çözümlenemedi, yine de deneyeceğiz');
    }
  } else ok('Anahtar bulundu');
}

if (env && url && env.SUPABASE_URL && env.SUPABASE_URL.replace(/\/$/, '') !== url.replace(/\/$/, '')) {
  yok('VITE_SUPABASE_URL ile SUPABASE_URL farklı Supabase projelerini gösteriyor');
  ipucu(`VITE_SUPABASE_URL: ${url}`);
  ipucu(`SUPABASE_URL: ${env.SUPABASE_URL}`);
  ipucu('Aynı olmalı, yoksa sunucu güvenlik ayarı (CSP) Supabase isteklerini engeller');
  sorunVar = true;
}

if (sorunVar) {
  console.log(`\n${KIRMIZI}Ayarlarda sorun var. Yukarıdakileri düzeltip tekrar çalıştırın.${SIFIR}\n`);
  process.exit(1);
}

/* ---------- 2. Bağlantı ---------- */

baslik('2. Supabase bağlantısı');

const temelUrl = url.replace(/\/$/, '');
const baslik_ = { apikey: anon, Authorization: `Bearer ${anon}` };

async function iste(yol, secenek = {}) {
  const c = new AbortController();
  const zaman = setTimeout(() => c.abort(), 12000);
  try {
    const y = await fetch(`${temelUrl}${yol}`, {
      ...secenek,
      headers: { ...baslik_, ...(secenek.headers || {}) },
      signal: c.signal,
    });
    let govde = null;
    try { govde = await y.json(); } catch { /* boş yanıt olabilir */ }
    return { durum: y.status, govde };
  } catch (e) {
    return { durum: 0, hata: e.name === 'AbortError' ? 'zaman aşımı' : e.message };
  } finally {
    clearTimeout(zaman);
  }
}

const kok_ = await iste('/rest/v1/');
if (kok_.durum === 0) {
  yok(`Sunucuya ulaşılamadı: ${kok_.hata}`);
  ipucu('İnternet bağlantınızı ve proje adresini kontrol edin.');
  ipucu('Supabase projesi duraklatılmış olabilir (ücretsiz projeler bir süre kullanılmazsa durur).');
  ipucu('supabase.com panelinde projenizin "Paused" yazıp yazmadığına bakın.');
  process.exit(1);
} else if (kok_.durum === 401) {
  yok('Anahtar reddedildi (401)');
  ipucu('Settings > API sayfasından anon public anahtarını yeniden kopyalayın.');
  process.exit(1);
} else {
  ok(`Bağlantı kuruldu (HTTP ${kok_.durum})`);
}

/* ---------- 3. Tablolar ---------- */

baslik('3. Tablolar ve okuma izni');

const beklenen = [
  ['settings', 'ayarlar'],
  ['categories', 'kategoriler'],
  ['products', 'ürünler'],
];

let tabloSorunu = false;

for (const [tablo, adi] of beklenen) {
  const y = await iste(`/rest/v1/${tablo}?select=*&limit=5`);

  if (y.durum === 200) {
    const adet = Array.isArray(y.govde) ? y.govde.length : 0;
    if (adet === 0) {
      not(`${adi} tablosu var ama boş görünüyor`);
      if (tablo !== 'settings') {
        ipucu('05_baslangic_verisi.sql çalıştırılmamış olabilir');
      }
    } else {
      ok(`${adi}: ${adet}${adet === 5 ? '+' : ''} kayıt okunabiliyor`);
    }
  } else if (y.durum === 404 || y.govde?.code === '42P01') {
    yok(`${adi} tablosu bulunamadı`);
    ipucu('01_schema.sql çalıştırılmamış. SQL Editor\'de çalıştırın.');
    tabloSorunu = true;
  } else if (y.durum === 401 || y.durum === 403 || y.govde?.code === '42501') {
    yok(`${adi} tablosuna okuma izni yok (${y.durum})`);
    ipucu('02_guvenlik.sql çalıştırılmamış veya yarım kalmış. Tekrar çalıştırın.');
    tabloSorunu = true;
  } else {
    yok(`${adi}: beklenmedik yanıt (${y.durum})`);
    if (y.govde) ipucu(JSON.stringify(y.govde).slice(0, 200));
    tabloSorunu = true;
  }
}

/* ---------- 4. Güvenlik kuralları ---------- */

baslik('4. Güvenlik kuralları');

// Ziyaretçi yazamamalı
const yazma = await iste('/rest/v1/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ category_id: 1, name: 'TANI TESTI', price: 1 }),
});

if (yazma.durum === 401 || yazma.durum === 403 || yazma.govde?.code === '42501') {
  ok('Ziyaretçi ürün ekleyemiyor (doğru)');
} else if (yazma.durum === 201 || yazma.durum === 200) {
  yok('TEHLİKE: Ziyaretçi ürün ekleyebiliyor!');
  ipucu('02_guvenlik.sql çalıştırılmamış. Hemen çalıştırın.');
  ipucu('Eklenen "TANI TESTI" kaydını panelden silin.');
  tabloSorunu = true;
} else {
  not(`Yazma denemesi beklenmedik yanıt verdi (${yazma.durum})`);
}

// Olay tablosuna yazamamalı
const olay = await iste('/rest/v1/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({ type: 'open', visitor: 'tani' }),
});
if (olay.durum === 401 || olay.durum === 403 || olay.govde?.code === '42501') {
  ok('Ziyaretçi sahte istatistik yazamıyor (doğru)');
} else if (olay.durum === 201) {
  yok('TEHLİKE: Ziyaretçi istatistik yazabiliyor!');
  tabloSorunu = true;
}

/* ---------- 5. Fotoğraf deposu ---------- */

baslik('5. Fotoğraf deposu');

const kova = await iste('/storage/v1/bucket/menu-images');
if (kova.durum === 200) {
  ok('menu-images kovası hazır');
} else if (kova.durum === 404) {
  not('menu-images kovası yok');
  ipucu('04_depo.sql çalıştırılmamış. Fotoğraf yükleyemezsiniz, menü yine de çalışır.');
} else {
  not(`Depo kontrolü belirsiz (${kova.durum}) — menüyü etkilemez`);
}

/* ---------- Sonuç ---------- */

console.log('\n' + '═'.repeat(60));
if (tabloSorunu) {
  console.log(`${KIRMIZI}Menünün açılmamasının sebebi yukarıda işaretli.${SIFIR}`);
  console.log('Eksik SQL betiğini Supabase > SQL Editor\'de çalıştırıp tekrar deneyin.');
} else {
  console.log(`${YESIL}Supabase tarafında sorun görünmüyor.${SIFIR}`);
  console.log('Menü hâlâ açılmıyorsa:');
  console.log('  1. .env değiştiyse  npm run build  komutunu tekrar çalıştırın');
  console.log('  2. Tarayıcıda F12 > Console sekmesindeki kırmızı satırı bana gönderin');
}
console.log('═'.repeat(60) + '\n');
