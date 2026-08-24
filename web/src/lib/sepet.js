/**
 * Sepet, tarayicinin kendi hafizasinda durur. Sunucuya yalnizca
 * siparis verilirken gider — o da sadece "urun id + adet" olarak.
 * Fiyati her zaman veritabani hesaplar.
 */
import { useSyncExternalStore } from 'react';

const SEPET_ANAHTAR = 'lajoie_sepet';
const ZIYARETCI_ANAHTAR = 'lajoie_ziyaretci';
const SIPARIS_ANAHTAR = 'lajoie_son_siparis';

/* ---------- Kucuk depo ---------- */

let durum = oku();
const dinleyiciler = new Set();

function oku() {
  try {
    const ham = localStorage.getItem(SEPET_ANAHTAR);
    const veri = ham ? JSON.parse(ham) : [];
    if (!Array.isArray(veri)) return [];
    // Eski surumden kalan sepetlerde anahtar yok; uretip tamamliyoruz.
    return veri
      .filter((s) => s && s.id && s.adet > 0)
      .map((s) => ({
        secimler: [],
        secimAdlari: [],
        ...s,
        anahtar: s.anahtar || String(s.id),
      }));
  } catch {
    return [];
  }
}

function yaz(yeni) {
  durum = yeni;
  try {
    localStorage.setItem(SEPET_ANAHTAR, JSON.stringify(yeni));
  } catch {
    /* gizli sekmede yazamayabilir; sepet yine de calisir */
  }
  dinleyiciler.forEach((f) => f());
}

function abone(f) {
  dinleyiciler.add(f);
  return () => dinleyiciler.delete(f);
}

/* ---------- Islemler ---------- */

/**
 * Satir kimligi: urun + secilen secenekler.
 * Ayni burgerin "S boy" ve "L boy + cedar" hali AYRI satirlardir;
 * bu yuzden kimlik yalnizca urun numarasi olamaz.
 */
export function satirAnahtari(urunId, secimler = []) {
  const sirali = [...secimler].map(Number).sort((a, b) => a - b);
  return sirali.length ? `${urunId}|${sirali.join(',')}` : String(urunId);
}

export function sepeteEkle(urun, adet = 1, secimler = [], birimFiyat = null) {
  const anahtar = satirAnahtari(urun.id, secimler);
  const mevcut = durum.find((s) => s.anahtar === anahtar);

  if (mevcut) {
    yaz(
      durum.map((s) =>
        s.anahtar === anahtar ? { ...s, adet: Math.min(s.adet + adet, 20) } : s
      )
    );
    return;
  }

  yaz([
    ...durum,
    {
      anahtar,
      id: urun.id,
      ad: urun.name,
      // Gosterim icindir; gercek fiyat siparis aninda veritabaninda hesaplanir.
      fiyat: Number(birimFiyat ?? urun.price) || 0,
      adet: Math.min(adet, 20),
      secimler: [...secimler].map(Number),
      secimAdlari: urun.secimAdlari || [],
    },
  ]);
}

/** Sepet satirina secenek adlarini yazar (yalnizca gosterim icin). */
export function secimAdlariniYaz(anahtar, adlar) {
  yaz(durum.map((s) => (s.anahtar === anahtar ? { ...s, secimAdlari: adlar } : s)));
}

export function adetDegistir(anahtar, adet) {
  if (adet <= 0) return sepettenCikar(anahtar);
  return yaz(
    durum.map((s) => (s.anahtar === anahtar ? { ...s, adet: Math.min(adet, 20) } : s))
  );
}

export function sepettenCikar(anahtar) {
  yaz(durum.filter((s) => s.anahtar !== anahtar));
}

export function sepetiBosalt() {
  yaz([]);
}

/* ---------- React tarafi ---------- */

export function useSepet() {
  const satirlar = useSyncExternalStore(abone, () => durum, () => []);

  return {
    satirlar,
    adet: satirlar.reduce((t, s) => t + s.adet, 0),
    tutar: satirlar.reduce((t, s) => t + s.fiyat * s.adet, 0),
    bos: satirlar.length === 0,
  };
}

/* ---------- Ziyaretci kimligi ---------- */

/** Ayni kisinin arka arkaya sahte siparis vermesini sinirlamak icin. */
export function ziyaretciKimligi() {
  try {
    let k = localStorage.getItem(ZIYARETCI_ANAHTAR);
    if (!k) {
      k = (crypto.randomUUID?.() || String(Math.random()).slice(2)) + '';
      localStorage.setItem(ZIYARETCI_ANAHTAR, k);
    }
    return k;
  } catch {
    return '';
  }
}

/* ---------- Son siparis hatirasi ---------- */

/** Menuye donen musteri "siparisim ne oldu?" diye arayamasin diye. */
export function sonSiparisiKaydet(kod) {
  try {
    localStorage.setItem(SIPARIS_ANAHTAR, JSON.stringify({ kod, zaman: Date.now() }));
  } catch {
    /* onemli degil */
  }
}

export function sonSiparis() {
  try {
    const veri = JSON.parse(localStorage.getItem(SIPARIS_ANAHTAR) || 'null');
    if (!veri?.kod) return null;
    // 6 saatten eskiyse artik gostermeye gerek yok.
    if (Date.now() - veri.zaman > 6 * 60 * 60 * 1000) return null;
    return veri.kod;
  } catch {
    return null;
  }
}

export function sonSiparisiUnut() {
  try {
    localStorage.removeItem(SIPARIS_ANAHTAR);
  } catch {
    /* onemli degil */
  }
}
