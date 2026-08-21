/**
 * Musteri hesabi islemleri.
 *
 * Onemli ayrim: buradaki "kullanici" musteridir, yonetici degil.
 * Yonetici kontrolu kancalar.js icindeki useOturum ve veritabanindaki
 * is_admin() ile yapilir. Musteri hesabi acmak panele hicbir yetki vermez.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { ziyaretciKimligi } from './sepet';

/** Supabase'in Ingilizce hata mesajlarini musterinin anlayacagi hale getirir. */
export function hesapHatasi(hata) {
  const m = (hata?.message || '').toLowerCase();

  if (m.includes('invalid login')) return 'E-posta veya şifre hatalı.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.';
  if (m.includes('password should be')) return 'Şifre en az 8 karakter olmalı.';
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return 'E-posta adresi geçerli görünmüyor.';
  if (m.includes('email not confirmed'))
    return 'E-postanızı doğrulamanız gerekiyor. Gelen kutunuza bakın.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Çok fazla deneme yaptınız. Birkaç dakika sonra tekrar deneyin.';
  if (m.includes('invalid otp') || m.includes('token has expired') || m.includes('otp_expired'))
    return 'Kod hatalı ya da süresi doldu. Yeni kod isteyin.';
  if (m.includes('sms') && (m.includes('provider') || m.includes('not configured') || m.includes('disabled')))
    return 'SMS ile giriş şu anda kullanılamıyor. E-posta ile deneyin.';
  if (m.includes('unsupported phone') || m.includes('invalid phone'))
    return 'Telefon numarası geçerli görünmüyor.';

  return hata?.message || 'Bir sorun oldu, tekrar deneyin.';
}

/**
 * Oturumdaki musteriyi ve profilini verir.
 * Yonetici olup olmadigina bakmaz; menu tarafinin buna ihtiyaci yok.
 */
export function useKullanici() {
  const [kullanici, setKullanici] = useState(null);
  const [profil, setProfil] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const profiliGetir = useCallback(async (k) => {
    if (!k) return null;
    const { data } = await supabase
      .from('profiles')
      .select('name, phone')
      .eq('user_id', k.id)
      .maybeSingle();
    return data || { name: '', phone: '' };
  }, []);

  useEffect(() => {
    let iptal = false;

    supabase.auth.getSession().then(async ({ data }) => {
      const k = data?.session?.user ?? null;
      const p = await profiliGetir(k);
      if (iptal) return;
      setKullanici(k);
      setProfil(p);
      setYukleniyor(false);
    });

    const { data: abone } = supabase.auth.onAuthStateChange(async (olay, oturum) => {
      const k = oturum?.user ?? null;

      // Giris anında, bu cihazdan misafir olarak verilmis siparisleri
      // hesaba bagla. Basarisiz olursa sessiz gecer; kritik degil.
      if (k && (olay === 'SIGNED_IN' || olay === 'USER_UPDATED')) {
        supabase.rpc('siparis_sahiplen', { p_ziyaretci: ziyaretciKimligi() }).then(
          () => {},
          () => {}
        );
      }

      const p = await profiliGetir(k);
      if (iptal) return;
      setKullanici(k);
      setProfil(p);
      setYukleniyor(false);
    });

    return () => {
      iptal = true;
      abone?.subscription?.unsubscribe();
    };
  }, [profiliGetir]);

  return { kullanici, profil, yukleniyor, girisli: Boolean(kullanici) };
}

/* ---------- Islemler ---------- */

/* ---------- Kampanya bagi ---------- */

const KAMPANYA_ANAHTAR = 'lajoie_kampanya';

/** /kayit/<slug> adresinden gelen ziyaretcinin kampanyasini hatirlar. */
export function kampanyayiHatirla(slug) {
  try {
    localStorage.setItem(KAMPANYA_ANAHTAR, JSON.stringify({ slug, zaman: Date.now() }));
  } catch {
    /* onemli degil */
  }
}

export function hatirlananKampanya() {
  try {
    const v = JSON.parse(localStorage.getItem(KAMPANYA_ANAHTAR) || 'null');
    if (!v?.slug) return '';
    // 30 gunden eskiyse artik gecerli saymiyoruz.
    if (Date.now() - v.zaman > 30 * 24 * 60 * 60 * 1000) return '';
    return v.slug;
  } catch {
    return '';
  }
}

export function kampanyayiUnut() {
  try {
    localStorage.removeItem(KAMPANYA_ANAHTAR);
  } catch {
    /* onemli degil */
  }
}

/* ---------- Telefon numarasi duzeni ---------- */

/**
 * Kullanicinin yazdigi her bicimi +90XXXXXXXXXX haline getirir:
 * "0532 111 22 33", "532...", "+90 532...", "90532..." hepsi ayni sonucu verir.
 * Gecersizse null doner.
 */
export function telefonNormalize(metin) {
  let n = String(metin || '').replace(/[^0-9]/g, '');
  if (n.startsWith('0090')) n = n.slice(4);
  else if (n.startsWith('90') && n.length === 12) n = n.slice(2);
  else if (n.startsWith('0') && n.length === 11) n = n.slice(1);
  // Turkiye cep numarasi: 5 ile baslayan 10 hane.
  if (n.length !== 10 || !n.startsWith('5')) return null;
  return '+90' + n;
}

/** +905321112233 -> 0532 111 22 33 */
export function telefonYaz(tam) {
  const n = String(tam || '').replace(/[^0-9]/g, '').replace(/^90/, '');
  if (n.length !== 10) return tam || '';
  return `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 8)} ${n.slice(8)}`;
}

/* ---------- SMS ile giris ---------- */

/**
 * Numaraya 6 haneli kod gonderir. Kayit ve giris ayni akistir:
 * numara sistemde yoksa hesap acilir, varsa giris yapilir.
 * NOT: Supabase panelinde bir SMS saglayicisi tanimli olmali.
 */
export async function smsKoduGonder({ telefon, ad }) {
  const tam = telefonNormalize(telefon);
  if (!tam) throw new Error('Geçerli bir cep telefonu yazın (05xx ...)');

  const { error } = await supabase.auth.signInWithOtp({
    phone: tam,
    options: {
      shouldCreateUser: true,
      // Kampanya kodu kayitla birlikte veritabanina gider; kuponu
      // orada tetikleyici tanimlar.
      data: { name: (ad || '').trim(), campaign: hatirlananKampanya() },
    },
  });
  if (error) throw error;
  return tam;
}

export async function smsKoduDogrula({ telefon, kod }) {
  const tam = telefonNormalize(telefon) || telefon;
  const { error } = await supabase.auth.verifyOtp({
    phone: tam,
    token: String(kod || '').trim(),
    type: 'sms',
  });
  if (error) throw error;
}

export async function kayitOl({ eposta, sifre, ad, telefon }) {
  const { data, error } = await supabase.auth.signUp({
    email: eposta.trim(),
    password: sifre,
    options: {
      // Bu bilgiler profiles tablosuna tetikleyiciyle kopyalanir.
      data: {
        name: (ad || '').trim(),
        phone: (telefon || '').trim(),
        campaign: hatirlananKampanya(),
      },
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;

  // E-posta dogrulamasi acikken oturum hemen acilmaz.
  return { dogrulamaGerekli: !data.session };
}

export async function girisYap({ eposta, sifre }) {
  const { error } = await supabase.auth.signInWithPassword({
    email: eposta.trim(),
    password: sifre,
  });
  if (error) throw error;
}

export async function sifreSifirla(eposta) {
  const { error } = await supabase.auth.resetPasswordForEmail(eposta.trim(), {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function cikisYap() {
  await supabase.auth.signOut();
}

export async function profilKaydet({ ad, telefon }) {
  const { data: oturum } = await supabase.auth.getUser();
  const id = oturum?.user?.id;
  if (!id) throw new Error('Giriş yapmalısınız');

  const { error } = await supabase
    .from('profiles')
    .update({ name: (ad || '').trim(), phone: (telefon || '').trim() })
    .eq('user_id', id);
  if (error) throw error;
}

/* ---------- Gecmis ve cuzdan ---------- */

export async function siparislerimGetir(sinir = 20) {
  const { data, error } = await supabase.rpc('siparislerim', { p_sinir: sinir });
  if (error) throw error;
  return data || [];
}

export async function hesapOzetGetir() {
  const { data, error } = await supabase.rpc('hesap_ozet');
  if (error) throw error;
  return data;
}

export async function kartlarimGetir() {
  const { data, error } = await supabase.rpc('kartlarim');
  if (error) throw error;
  return data || [];
}

export async function kartEkle(kod) {
  const { data, error } = await supabase.rpc('kart_ekle', { p_kod: kod });
  if (error) throw error;
  return data;
}

/* ---------- Indirim onizleme ---------- */

/**
 * Sepet ekraninda "bu kupon ne kadar indirim yapiyor?" sorusunu
 * veritabanina sorar. Hesabi asla tarayicida yapmiyoruz; burada
 * gorunen rakamla siparis aninda uygulanan rakam ayni fonksiyondan gelir.
 */
export async function indirimOnizle({ tutar, kodlar = [] }) {
  const { data, error } = await supabase.rpc('indirim_onizle', {
    p_tutar: tutar,
    p_kodlar: kodlar,
    p_ziyaretci: ziyaretciKimligi(),
  });
  if (error) throw error;
  return data;
}

/** Hesaba tanimli, su anki sepette kullanilabilir kuponlar. */
export async function kuponlarimGetir(tutar = 0) {
  const { data, error } = await supabase.rpc('kuponlarim', { p_tutar: tutar });
  if (error) throw error;
  return data || [];
}

export async function kampanyayaKatil(slug) {
  const { data, error } = await supabase.rpc('kampanyaya_katil', { p_slug: slug });
  if (error) throw error;
  return data;
}
