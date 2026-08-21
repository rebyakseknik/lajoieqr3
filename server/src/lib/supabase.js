import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    '\nEksik ayar: SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlı değil.\n' +
    'server/.env.example dosyasını .env olarak kopyalayıp doldurun.\n'
  );
  process.exit(1);
}

/**
 * service_role anahtarı RLS kurallarını aşar; bu yüzden yalnızca
 * burada, sunucu içinde kullanılır. Tarayıcıya asla gönderilmez.
 */
export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
