/**
 * Siparis islemleri. Hepsi veritabanindaki RPC fonksiyonlarina gider;
 * tarayici orders tablosuna dogrudan dokunamaz.
 */
import { supabase } from './supabase';
import { ziyaretciKimligi } from './sepet';

export const DURUM = {
  awaiting_payment: { ad: 'Ödeme bekleniyor', renk: 'odeme' },
  new:       { ad: 'Onay bekliyor', renk: 'bekleyen' },
  preparing: { ad: 'Hazırlanıyor',  renk: 'hazirlanan' },
  ready:     { ad: 'Hazır',         renk: 'hazir' },
  done:      { ad: 'Teslim edildi', renk: 'teslim' },
  cancelled: { ad: 'İptal edildi',  renk: 'iptal' },
};

/** "12:45" seklinde yazar. */
export function saat(zaman) {
  if (!zaman) return '';
  return new Date(zaman).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

/** Supabase hata mesajlarini musterinin anlayacagi hale getirir. */
export function hataMetni(hata) {
  const ham = hata?.message || '';
  // Postgres "raise exception" mesajlari zaten Turkce ve anlasilir.
  if (ham && !/^(JSON|invalid input|permission denied|function .* does not exist)/i.test(ham)) {
    return ham.replace(/^ERROR:\s*/i, '');
  }
  return 'Sipariş alınamadı. Lütfen tekrar deneyin.';
}

export async function slotlariGetir() {
  const { data, error } = await supabase.rpc('siparis_slotlari');
  if (error) throw error;
  return data || [];
}

export async function siparisVer({ satirlar, teslim, mod, ad, telefon, not, kodlar, odeme }) {
  const { data, error } = await supabase.rpc('siparis_olustur', {
    p_urunler: satirlar.map((s) => ({ id: s.id, qty: s.adet })),
    p_teslim: teslim,
    p_mod: mod,
    p_ad: ad || '',
    p_telefon: telefon || '',
    p_not: not || '',
    p_ziyaretci: ziyaretciKimligi(),
    p_kodlar: kodlar || [],
    p_odeme: odeme === 'online' ? 'online' : 'cash',
  });
  if (error) throw error;
  return data;
}

export async function siparisGetir(kod) {
  const { data, error } = await supabase.rpc('siparis_getir', { p_kod: kod });
  if (error) throw error;
  return data;
}

export async function siparistenVazgec(kod) {
  const { data, error } = await supabase.rpc('siparis_vazgec', { p_kod: kod });
  if (error) throw error;
  return data;
}
