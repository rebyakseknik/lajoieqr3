/**
 * Ziyaret olaylari.
 *
 * Eskiden /api/track adresindeki Node sunucusuna gidiyordu; Vercel o
 * sunucuyu yayinlamadigi icin olaylar uretimde kayboluyordu. Artik
 * dogrudan veritabanindaki olay_kaydet fonksiyonuna yazilir — hiz
 * siniri ve dogrulama orada. Ayri sunucu gerekmiyor.
 *
 * Ilke ayni: istatistik, menuyu ASLA bozmamali. Her cagri sessizce
 * basarisiz olabilir.
 */
import { supabase } from './supabase';
import { ziyaretciKimligi } from './sepet';

const gonderilenler = new Set();

/** Kaba cihaz siniflamasi; istatistikte "nereden bakiyorlar" icin yeter. */
function cihazTuru() {
  try {
    const ua = navigator.userAgent;
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobil';
    return 'masaustu';
  } catch {
    return '';
  }
}

export function olayGonder(tur, hedefId = null) {
  // Ayni olay oturum icinde bir kez sayilir; sayfada gezinirken
  // her donuste "acilis" yazilmasin.
  const anahtar = `${tur}:${hedefId ?? ''}`;
  if (gonderilenler.has(anahtar)) return;
  gonderilenler.add(anahtar);

  try {
    supabase
      .rpc('olay_kaydet', {
        p_tur: tur,
        p_hedef: hedefId,
        p_ziyaretci: ziyaretciKimligi(),
        p_cihaz: cihazTuru(),
      })
      .then(
        () => {},
        () => {}
      );
  } catch {
    /* istatistik menuyu asla bozmasin */
  }
}
