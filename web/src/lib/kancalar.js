import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/* ---------- Ayarlar ---------- */

const VARSAYILAN_AYAR = {
  restaurant_name: 'La Joie',
  tagline: '',
  address: '',
  phone: '',
  instagram: '',
  currency: '₺',
  farewell: '',
  // Ayarlar gelene kadar sipariş düğmesi görünmesin diye kapalı başlar.
  preorder_enabled: '0',
  preorder_note: '',
  auth_method: 'email',
  preorder_require_login: '0',
  payment_online_enabled: '0',
  payment_cash_enabled: '1',
  address: '',
  hours: '',
  phone: '',
  instagram: '',
  maps_url: '',
  hero_note: '',
  about_text: '',
};

export function useAyarlar() {
  const [ayarlar, setAyarlar] = useState(VARSAYILAN_AYAR);
  const [yukleniyor, setYukleniyor] = useState(true);

  const getir = useCallback(async () => {
    const { data, error } = await supabase.from('settings').select('key, value');
    if (!error && data) {
      const nesne = { ...VARSAYILAN_AYAR };
      data.forEach((s) => {
        if (s.value !== '') nesne[s.key] = s.value;
      });
      setAyarlar(nesne);
    }
    setYukleniyor(false);
  }, []);

  useEffect(() => {
    getir();
  }, [getir]);

  return { ayarlar, yukleniyor, yenile: getir };
}

/* ---------- Menü verisi ---------- */

/**
 * Kategorileri ve ürünleri birlikte getirir.
 * @param {boolean} hepsi  Panelde pasif kayıtlar da lazım; menüde değil.
 */
export function useMenuVerisi(hepsi = false) {
  const [kategoriler, setKategoriler] = useState([]);
  const [urunler, setUrunler] = useState([]);
  const [secenekler, setSecenekler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(null);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);

    let katSorgu = supabase.from('categories').select('*').order('position').order('id');
    let urnSorgu = supabase.from('products').select('*').order('position').order('id');

    if (!hepsi) {
      katSorgu = katSorgu.eq('active', true);
      urnSorgu = urnSorgu.eq('active', true);
    }

    const [kat, urn, sec] = await Promise.all([
      katSorgu,
      urnSorgu,
      supabase.rpc('menu_secenekleri'),
    ]);

    if (kat.error || urn.error) {
      setHata((kat.error || urn.error).message);
      setYukleniyor(false);
      return;
    }

    setKategoriler(kat.data || []);
    setUrunler(urn.data || []);
    setSecenekler(sec.data || []);
    setYukleniyor(false);
  }, [hepsi]);

  useEffect(() => {
    getir();
  }, [getir]);

  return { kategoriler, urunler, secenekler, yukleniyor, hata, yenile: getir };
}

/* ---------- Oturum ---------- */

export function useOturum() {
  const [oturum, setOturum] = useState(null);
  const [yonetici, setYonetici] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    let iptal = false;

    async function yoneticiMi(aktifOturum) {
      if (!aktifOturum) return false;
      const { data } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', aktifOturum.user.id)
        .maybeSingle();
      return Boolean(data);
    }

    supabase.auth.getSession().then(async ({ data }) => {
      const s = data?.session ?? null;
      const y = await yoneticiMi(s);
      if (iptal) return;
      setOturum(s);
      setYonetici(y);
      setYukleniyor(false);
    });

    const { data: abone } = supabase.auth.onAuthStateChange(async (_olay, s) => {
      const y = await yoneticiMi(s);
      if (iptal) return;
      setOturum(s ?? null);
      setYonetici(y);
      setYukleniyor(false);
    });

    return () => {
      iptal = true;
      abone?.subscription?.unsubscribe();
    };
  }, []);

  return { oturum, yonetici, yukleniyor };
}

/* ---------- Bildirim ---------- */

export function useBildirim() {
  const [bildirim, setBildirim] = useState(null);

  const bildir = useCallback((mesaj, tur = 'ok') => {
    setBildirim({ mesaj, tur });
  }, []);

  useEffect(() => {
    if (!bildirim) return undefined;
    const zaman = setTimeout(() => setBildirim(null), 5000);
    return () => clearTimeout(zaman);
  }, [bildirim]);

  return { bildirim, bildir };
}
