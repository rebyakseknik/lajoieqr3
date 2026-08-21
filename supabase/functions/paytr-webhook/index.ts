// Supabase Edge Function: paytr-webhook
//
// PayTR ödeme sonucunu BURAYA bildirir (PayTR panelindeki "Bildirim URL").
// Siparişi onaylayan ya da düşüren tek yer burasıdır; müşterinin
// tarayıcısına dönen "ok" sayfası yalnızca görsel bir yönlendirmedir.
//
// Üç kural hayati:
//   1) Gelen hash MUTLAKA doğrulanır — yoksa herkes "ödendi" uydurabilir.
//   2) Yanıt olarak düz metin "OK" dönülür — dönülmezse PayTR bildirimi
//      tekrarlar ve panelde uyarı oluşur.
//   3) Aynı bildirim birden çok gelebilir — odeme_sonucu bunu zaten
//      tolere eder, ikinci çağrı hiçbir şeyi değiştirmez.
//
// DİKKAT: bu fonksiyon --no-verify-jwt ile yayınlanmalı; PayTR'nin
// sunucusu Supabase anahtarı taşımaz.

import { createClient } from 'npm:@supabase/supabase-js@2';

async function hmacBase64(mesaj: string, anahtar: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(anahtar),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const imza = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(mesaj));
  let ikili = '';
  new Uint8Array(imza).forEach((b) => (ikili += String.fromCharCode(b)));
  return btoa(ikili);
}

Deno.serve(async (istek) => {
  if (istek.method !== 'POST') return new Response('OK');

  const MKEY = Deno.env.get('PAYTR_MERCHANT_KEY') ?? '';
  const MSALT = Deno.env.get('PAYTR_MERCHANT_SALT') ?? '';

  let form: FormData;
  try {
    form = await istek.formData();
  } catch {
    return new Response('OK'); // bozuk istek; tekrarlatmanın anlamı yok
  }

  const oid = String(form.get('merchant_oid') ?? '');
  const durum = String(form.get('status') ?? '');
  const tutarKurus = String(form.get('total_amount') ?? '');
  const gelenHash = String(form.get('hash') ?? '');
  const sebep = String(form.get('failed_reason_msg') ?? '');

  if (!oid || !durum || !gelenHash) return new Response('OK');

  // İmza doğrulama: PayTR dokümanındaki birleşim sırası.
  const beklenen = await hmacBase64(oid + MSALT + durum + tutarKurus, MKEY);
  if (beklenen !== gelenHash) {
    // Sahte ya da bozuk bildirim. "OK" dönmüyoruz ki PayTR panelinde
    // görünsün — ama siparişe de DOKUNMUYORUZ.
    console.error('paytr-webhook: hash uyusmadi', { oid });
    return new Response('PAYTR notification failed: bad hash', { status: 400 });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await db.rpc('odeme_sonucu', {
    p_oid: oid,
    p_basari: durum === 'success',
    p_tutar: Number(tutarKurus) / 100,
    p_sebep: sebep,
  });

  if (error) {
    // Veritabanına ulaşamadıysak "OK" DÖNMEYİZ: PayTR bildirimi
    // tekrarlasın, sipariş kaybolmasın.
    console.error('paytr-webhook: odeme_sonucu hatasi', error.message);
    return new Response('retry', { status: 500 });
  }

  console.log('paytr-webhook:', oid, durum, JSON.stringify(data));
  return new Response('OK');
});
