// Supabase Edge Function: bildirim-gonder
//
// Sipariş "hazır" olduğunda müşterinin telefonuna bildirim yollar.
// Panel, durumu değiştirdikten hemen sonra bunu çağırır.
//
// Gerekli gizli değerler:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...)
//
// VAPID anahtarlarını üretmek için (bir kez):
//   npx web-push generate-vapid-keys

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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

const METINLER: Record<string, { baslik: string; metin: (n: number) => string }> = {
  preparing: {
    baslik: 'Siparişiniz hazırlanıyor',
    metin: (n) => `${n} numaralı siparişiniz mutfakta. Az kaldı!`,
  },
  ready: {
    baslik: 'Siparişiniz hazır',
    metin: (n) => `Kasada ${n} numarasını söylemeniz yeterli. Afiyet olsun!`,
  },
  cancelled: {
    baslik: 'Siparişiniz iptal edildi',
    metin: (n) => `${n} numaralı sipariş iptal edildi.`,
  },
};

Deno.serve(async (istek) => {
  if (istek.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (istek.method !== 'POST') return cevap({ hata: 'Yalnızca POST' }, 405);

  const ACIK = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const GIZLI = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const KONU = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@lajoiemersin.com.tr';

  if (!ACIK || !GIZLI) {
    return cevap({ hata: 'VAPID anahtarları tanımlı değil' }, 500);
  }

  let govde: { order_id?: number; durum?: string; kod?: string };
  try {
    govde = await istek.json();
  } catch {
    return cevap({ hata: 'Geçersiz istek' }, 400);
  }

  const durum = govde.durum ?? '';
  const metin = METINLER[durum];
  if (!govde.order_id || !metin) {
    // Bildirim gerektirmeyen durum; sessizce geç.
    return cevap({ ok: true, gonderilen: 0 });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: hedefler, error } = await db.rpc('bildirim_hedefleri', {
    p_id: govde.order_id,
  });

  if (error) return cevap({ hata: error.message }, 500);
  if (!hedefler?.length) return cevap({ ok: true, gonderilen: 0 });

  webpush.setVapidDetails(KONU, ACIK, GIZLI);

  const masaNo = hedefler[0].table_no;
  const yuk = JSON.stringify({
    baslik: metin.baslik,
    metin: metin.metin(masaNo),
    etiket: `siparis-${govde.order_id}`,
    yol: govde.kod ? `/siparis/${govde.kod}` : '/',
  });

  let gonderilen = 0;

  await Promise.all(
    hedefler.map(async (h: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: h.endpoint, keys: { p256dh: h.p256dh, auth: h.auth } },
          yuk,
        );
        gonderilen += 1;
      } catch (e) {
        // 404/410: abonelik ölmüş (uygulama silinmiş, izin kaldırılmış).
        // Tabloyu şişirmesin diye temizliyoruz.
        const kod = (e as { statusCode?: number })?.statusCode;
        if (kod === 404 || kod === 410) {
          await db.rpc('bildirim_sil_endpoint', { p_endpoint: h.endpoint });
        } else {
          console.error('push hatasi:', kod, String(e).slice(0, 200));
        }
      }
    }),
  );

  return cevap({ ok: true, gonderilen });
});
