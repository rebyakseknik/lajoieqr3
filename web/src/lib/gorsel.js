import { supabase } from './supabase';

const KOVA = 'menu-images';
const EN_BUYUK = 1000;

/**
 * Telefon fotoğrafları 4-5 MB gelebiliyor. Yüklemeden önce tarayıcıda
 * küçültürüz: hem depo şişmez hem menü hızlı açılır.
 */
async function kucult(dosya) {
  const kaynak = await createImageBitmap(dosya).catch(() => null);
  if (!kaynak) throw new Error('Bu dosya bir fotoğraf değil.');

  let { width: g, height: y } = kaynak;
  if (g > EN_BUYUK || y > EN_BUYUK) {
    const oran = Math.min(EN_BUYUK / g, EN_BUYUK / y);
    g = Math.round(g * oran);
    y = Math.round(y * oran);
  }

  const tuval = document.createElement('canvas');
  tuval.width = g;
  tuval.height = y;

  const ctx = tuval.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, g, y);
  ctx.drawImage(kaynak, 0, 0, g, y);
  kaynak.close?.();

  return new Promise((coz, ret) => {
    tuval.toBlob(
      (blob) => (blob ? coz(blob) : ret(new Error('Fotoğraf işlenemedi.'))),
      'image/jpeg',
      0.82
    );
  });
}

/**
 * Fotoğrafı yükler ve depo yolunu döndürür.
 * @returns {Promise<string>} örn. "2026/07/a1b2c3.jpg"
 */
export async function gorselYukle(dosya, klasor = '') {
  if (!dosya.type.startsWith('image/')) {
    throw new Error('Sadece fotoğraf yükleyebilirsiniz.');
  }
  if (dosya.size > 15 * 1024 * 1024) {
    throw new Error('Fotoğraf çok büyük. 15 MB altında bir dosya seçin.');
  }

  const kucuk = await kucult(dosya);

  const simdi = new Date();
  const rastgele = crypto.randomUUID().slice(0, 12);
  const on = klasor ? `${klasor.replace(/\/+$/, '')}/` : '';
  const yol = `${on}${simdi.getFullYear()}/${String(simdi.getMonth() + 1).padStart(2, '0')}/${rastgele}.jpg`;

  const { error } = await supabase.storage.from(KOVA).upload(yol, kucuk, {
    contentType: 'image/jpeg',
    cacheControl: '2592000',
    upsert: false,
  });

  if (error) throw new Error('Fotoğraf yüklenemedi: ' + error.message);
  return yol;
}

/** Ürün silinince veya fotoğrafı değişince eskisini depodan kaldırır. */
export async function gorselSil(yol) {
  if (!yol) return;
  await supabase.storage.from(KOVA).remove([yol]);
}
