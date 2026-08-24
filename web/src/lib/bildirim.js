/**
 * Siparis hazir bildirimi.
 *
 * Iki katmanli calisir:
 *   1) Tarayici bildirimi (push) — sayfa kapali olsa bile telefon titrer.
 *      Android'de sorunsuz. iPhone'da YALNIZCA site ana ekrana
 *      eklenmisse calisir; Apple'in kisiti, asilamiyor.
 *   2) Sayfa acikken sesli uyari — bildirim calismiyorsa yedek.
 */
import { supabase } from './supabase';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

/** Tarayici bu cihazda push destekliyor mu? */
export function pushDestekli() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID)
  );
}

/** iPhone'da ana ekrana eklenmis mi? (eklenmemisse push calismaz) */
export function iosVeEklenmemis() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua);
  const ekranda =
    window.navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches;
  return ios && !ekranda;
}

function base64ToUint8(base64) {
  const dolgu = '='.repeat((4 - (base64.length % 4)) % 4);
  const duz = (base64 + dolgu).replace(/-/g, '+').replace(/_/g, '/');
  const ham = atob(duz);
  return Uint8Array.from([...ham].map((c) => c.charCodeAt(0)));
}

async function calisaniKaydet() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** Mevcut aboneligi verir (varsa). */
export async function mevcutAbonelik() {
  if (!pushDestekli()) return null;
  try {
    const kayit = await navigator.serviceWorker.getRegistration('/');
    if (!kayit) return null;
    return await kayit.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Izin ister ve aboneligi veritabanina yazar.
 * @returns {'ok'|'reddedildi'|'desteklenmiyor'|'hata'}
 */
export async function bildirimAc(siparisKodu) {
  if (!pushDestekli()) return 'desteklenmiyor';

  try {
    const izin = await Notification.requestPermission();
    if (izin !== 'granted') return 'reddedildi';

    const kayit = await calisaniKaydet();
    await navigator.serviceWorker.ready;

    let abone = await kayit.pushManager.getSubscription();
    if (!abone) {
      abone = await kayit.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8(VAPID),
      });
    }

    const veri = abone.toJSON();
    const { error } = await supabase.rpc('bildirim_kaydet', {
      p_kod: siparisKodu,
      p_endpoint: abone.endpoint,
      p_p256dh: veri.keys?.p256dh || '',
      p_auth: veri.keys?.auth || '',
    });
    if (error) return 'hata';

    return 'ok';
  } catch {
    return 'hata';
  }
}

export async function bildirimKapat(siparisKodu) {
  try {
    const abone = await mevcutAbonelik();
    if (!abone) return;
    await supabase.rpc('bildirim_birak', {
      p_kod: siparisKodu,
      p_endpoint: abone.endpoint,
    });
  } catch {
    /* onemli degil */
  }
}

/* ---------- Yedek: sayfa acikken uyari ---------- */

/** Kisa bir zil sesi + titresim. Dosya gerekmez. */
export function yerindeUyar() {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* titresim yoksa sorun degil */
  }

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notalar = [
      [880, 0, 0.25],
      [1180, 0.16, 0.3],
      [1480, 0.34, 0.4],
    ];
    notalar.forEach(([frekans, basla, sure]) => {
      const osc = ctx.createOscillator();
      const kazanc = ctx.createGain();
      osc.connect(kazanc);
      kazanc.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frekans, ctx.currentTime + basla);
      kazanc.gain.setValueAtTime(0.0001, ctx.currentTime + basla);
      kazanc.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + basla + 0.02);
      kazanc.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + basla + sure);
      osc.start(ctx.currentTime + basla);
      osc.stop(ctx.currentTime + basla + sure + 0.05);
    });
  } catch {
    /* tarayici izin vermediyse sessiz gecer */
  }
}
