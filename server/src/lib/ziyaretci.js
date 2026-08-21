import crypto from 'node:crypto';

const BOT_IZLERI = [
  'bot', 'crawl', 'spider', 'slurp', 'facebookexternalhit', 'preview',
  'monitor', 'headless', 'python', 'curl', 'wget', 'axios', 'postman',
  'lighthouse', 'pingdom', 'uptime',
];

/** Otomatik gezginleri istatistiklerin dışında tutar. */
export function botMu(userAgent = '') {
  const ua = String(userAgent).toLowerCase().trim();
  if (!ua) return true;
  return BOT_IZLERI.some((iz) => ua.includes(iz));
}

/** Müşteri hangi cihazdan bakıyor? */
export function cihazTuru(userAgent = '') {
  const ua = String(userAgent).toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobil';
  return 'masaustu';
}

const COOKIE_AYARI = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 1000 * 60 * 60 * 24 * 180,
  path: '/',
};

/**
 * Ziyaretçiye kimlik verir. Kimlik çerezde tutulur ve tarayıcıdan
 * okunamaz; kişisel hiçbir bilgi içermez, sadece rastgele bir dizi.
 */
export function ziyaretciKimligi(req, res) {
  let kimlik = req.cookies?.lj_v;
  if (!kimlik || !/^[a-f0-9]{24}$/.test(kimlik)) {
    kimlik = crypto.randomBytes(12).toString('hex');
    res.cookie('lj_v', kimlik, COOKIE_AYARI);
  }
  return kimlik;
}

/**
 * Aynı kişinin sayfayı yenilemesi tek açılış sayılsın diye
 * 30 dakikalık bir pencere uygular.
 */
export function acilisSayilsinMi(req, res) {
  const son = Number(req.cookies?.lj_o || 0);
  const simdi = Date.now();
  if (son && simdi - son < 30 * 60 * 1000) return false;
  res.cookie('lj_o', String(simdi), { ...COOKIE_AYARI, maxAge: 1000 * 60 * 60 * 12 });
  return true;
}
