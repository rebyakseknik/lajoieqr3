export function getSupabaseConfig(env = import.meta.env) {
  const url = String(env?.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = String(env?.VITE_SUPABASE_ANON_KEY ?? '').trim();

  return {
    url,
    anonKey,
    ayarEksik: !url || !anonKey,
  };
}
