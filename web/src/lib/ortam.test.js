import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupabaseConfig } from './ortam.js';

test('eksik ortam değişkenleri için uyarı döndürür', () => {
  const config = getSupabaseConfig({});

  assert.equal(config.ayarEksik, true);
  assert.equal(config.url, '');
  assert.equal(config.anonKey, '');
});

test('değerleri temizleyip döndürür', () => {
  const config = getSupabaseConfig({
    VITE_SUPABASE_URL: ' https://example.supabase.co ',
    VITE_SUPABASE_ANON_KEY: ' public-key ',
  });

  assert.equal(config.url, 'https://example.supabase.co');
  assert.equal(config.anonKey, 'public-key');
  assert.equal(config.ayarEksik, false);
});
