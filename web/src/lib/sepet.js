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
    return Array.isArray(veri) ? veri.filter((s) => s && s.id && s.adet > 0) : [];
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

export function sepeteEkle(urun, adet = 1) {
  const mevcut = durum.find((s) => s.id === urun.id);
  if (mevcut) {
    yaz(durum.map((s) => (s.id === urun.id ? { ...s, adet: Math.min(s.adet + adet, 20) } : s)));
  } else {
    yaz([
      ...durum,
      { id: urun.id, ad: urun.name, fiyat: Number(urun.price) || 0, adet: Math.min(adet, 20) },
    ]);
  }
}

export function adetDegistir(id, adet) {
  if (adet <= 0) return sepettenCikar(id);
  return yaz(durum.map((s) => (s.id === id ? { ...s, adet: Math.min(adet, 20) } : s)));
}

export function sepettenCikar(id) {
  yaz(durum.filter((s) => s.id !== id));
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
