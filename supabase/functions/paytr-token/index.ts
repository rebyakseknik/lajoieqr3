// Supabase Edge Function: paytr-token
//
// Görevi: müşteri ödeme sayfasını açtığında PayTR'dan iframe token'ı almak.
// Mağaza anahtarları YALNIZCA burada yaşar; tarayıcıya asla inmez.
//
// Akış:
//   1) Tarayıcı sipariş kodunu gönderir.
//   2) Veritabanındaki odeme_denemesi_ac tutarı ve sepeti verir
//      (tutar DAİMA veritabanından gelir; tarayıcıya güvenilmez).
//   3) PayTR'a imzalı istek atılır, dönen token tarayıcıya verilir.
//
// Gerekli gizli değerler (supabase secrets set ...):
//   PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT
//   SITE_URL   (örn. https://menu.lajoie.com.tr — sondaki / olmadan)
//   PAYTR_TEST ('1' = test modu, '0' = canlı; yazılmazsa '1')

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function cevap(govde: unknown, durum = 200) {
  return new Response(JSON.stringify(govde), {
    status: durum,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function hmacBase64(mesaj: string, anahtar: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(anahtar),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const imza = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(mesaj));
  // Uint8Array -> base64
  let ikili = '';
  new Uint8Array(imza).forEach((b) => (ikili += String.fromCharCode(b)));
  return btoa(ikili);
}

function base64utf8(metin: string): string {
  // btoa Turkce karakterlerde patlar; once UTF-8 baytlarina cevir.
  const baytlar = new TextEncoder().encode(metin);
  let ikili = '';
  baytlar.forEach((b) => (ikili += String.fromCharCode(b)));
  return btoa(ikili);
}

Deno.serve(async (istek) => {
  if (istek.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (istek.method !== 'POST') return cevap({ hata: 'Yalnızca POST' }, 405);

  const MID = Deno.env.get('PAYTR_MERCHANT_ID') ?? '';
  const MKEY = Deno.env.get('PAYTR_MERCHANT_KEY') ?? '';
  const MSALT = Deno.env.get('PAYTR_MERCHANT_SALT') ?? '';
  const SITE = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
  const TEST = Deno.env.get('PAYTR_TEST') === '0' ? '0' : '1';

  if (!MID || !MKEY || !MSALT || !SITE) {
    return cevap({ hata: 'Ödeme yapılandırması eksik (secrets)' }, 500);
  }

  let govde: { kod?: string; eposta?: string };
  try {
    govde = await istek.json();
  } catch {
    return cevap({ hata: 'Geçersiz istek' }, 400);
  }
  if (!govde.kod) return cevap({ hata: 'Sipariş kodu gerekli' }, 400);

  // service_role: RPC'leri tam yetkiyle çağırır. Bu anahtar yalnızca
  // sunucu ortamında vardır.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Ödeme denemesini veritabanı açar: tutar, sepet ve tekil oid oradan gelir.
  const { data: deneme, error } = await db.rpc('odeme_denemesi_ac', {
    p_kod: govde.kod,
    p_saglayici: 'paytr',
  });

  if (error) return cevap({ hata: error.message }, 400);

  const tutarKurus = Math.round(Number(deneme.amount) * 100);
  const sepet = base64utf8(JSON.stringify(deneme.items ?? []));
  const eposta =
    govde.eposta && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(govde.eposta)
      ? govde.eposta
      : `masa${deneme.table_no}@siparis.lajoie`;
  const ip =
    istek.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    istek.headers.get('cf-connecting-ip') ||
    '85.34.78.112';

  const taksitYok = '1'; // öğle yemeğine taksit olmaz
  const enCokTaksit = '0';
  const paraBirimi = 'TL';

  // PayTR imzası: alan sırası PayTR dokümanındaki sırayla birebir aynı olmalı.
  const imzaMetni =
    MID + ip + deneme.oid + eposta + tutarKurus + sepet +
    taksitYok + enCokTaksit + paraBirimi + TEST;
  const paytrToken = await hmacBase64(imzaMetni + MSALT, MKEY);

  const alanlar = new URLSearchParams({
    merchant_id: MID,
    user_ip: ip,
    merchant_oid: deneme.oid,
    email: eposta,
    payment_amount: String(tutarKurus),
    paytr_token: paytrToken,
    user_basket: sepet,
    debug_on: TEST,
    no_installment: taksitYok,
    max_installment: enCokTaksit,
    user_name: 'La Joie Müşterisi',
    user_address: 'Mersin',
    user_phone: '05000000000',
    merchant_ok_url: `${SITE}/siparis/${govde.kod}?odeme=ok`,
    merchant_fail_url: `${SITE}/odeme/${govde.kod}?durum=hata`,
    timeout_limit: '15',
    currency: paraBirimi,
    test_mode: TEST,
    lang: 'tr',
  });

  const yanit = await fetch('https://www.paytr.com/odeme/api/get-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: alanlar.toString(),
  });

  const metin = await yanit.text();
  let sonuc: { status?: string; token?: string; reason?: string };
  try {
    sonuc = JSON.parse(metin);
  } catch {
    return cevap({ hata: 'PayTR beklenmedik yanıt verdi: ' + metin.slice(0, 200) }, 502);
  }

  if (sonuc.status !== 'success' || !sonuc.token) {
    return cevap({ hata: 'PayTR: ' + (sonuc.reason ?? 'token alınamadı') }, 502);
  }

  return cevap({ token: sonuc.token, oid: deneme.oid, expires_at: deneme.expires_at });
});
