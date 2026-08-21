import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const ayarEksik = !url || !anonKey;

if (ayarEksik) {
  console.error(
    'Supabase ayarları eksik. Kök klasördeki .env.example dosyasını .env olarak kopyalayıp doldurun.'
  );
}

/**
 * anon anahtarı herkese açıktır ve bu bir sorun değil: ne yapabileceğini
 * veritabanındaki RLS kuralları belirler. Menüyü okuyabilir,
 * yönetici değilse hiçbir şeyi değiştiremez.
 */
export const supabase = createClient(url || 'http://localhost', anonKey || 'anon', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** Depodaki bir dosyanın herkese açık adresini üretir. */
export function gorselAdresi(yol) {
  if (!yol) return null;
  const { data } = supabase.storage.from('menu-images').getPublicUrl(yol);
  return data?.publicUrl || null;
}
