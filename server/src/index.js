import './ortam.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';

import { takipRouter } from './routes/takip.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

const supabaseUrl = process.env.SUPABASE_URL || '';

app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ---------- Güvenlik başlıkları ---------- */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', supabaseUrl].filter(Boolean),
        connectSrc: ["'self'", supabaseUrl].filter(Boolean),
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    // CSP'de frame-ancestors 'none' dedik; eski tarayicilar icin ayni karari
    // X-Frame-Options ile de veriyoruz.
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

/* ---------- CORS ---------- */
const izinliKaynaklar = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      // Aynı sunucudan gelen istekler (origin yok) her zaman serbest.
      if (!origin) return cb(null, true);
      if (!izinliKaynaklar.length) return cb(null, true);
      if (izinliKaynaklar.includes(origin)) return cb(null, true);
      cb(new Error('Bu adrese izin verilmiyor'));
    },
    credentials: true,
  })
);

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '8kb' }));

/* ---------- API ---------- */
app.use('/api/track', takipRouter);

app.get('/api/health', (_req, res) => {
  res.json({ durum: 'çalışıyor', zaman: new Date().toISOString() });
});

/* ---------- React uygulaması ---------- */
const dagitim = path.join(__dirname, '..', '..', 'web', 'dist');

if (fs.existsSync(dagitim)) {
  app.use(
    express.static(dagitim, {
      maxAge: '7d',
      setHeaders(res, dosya) {
        if (dosya.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );

  // Tek sayfa uygulaması: bilinmeyen yollar index.html'e düşer.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dagitim, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(200).send(
      'Sunucu çalışıyor ama arayüz henüz derlenmemiş. ' +
      'web klasöründe "npm run build" komutunu çalıştırın.'
    );
  });
}

app.use((_req, res) => res.status(404).json({ hata: 'Bulunamadı' }));

app.use((err, _req, res, _next) => {
  // Gövde çok büyük geldiğinde doğru kodu döndür.
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ hata: 'Gönderilen veri çok büyük' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ hata: 'Geçersiz veri' });
  }
  if (err?.message === 'Bu adrese izin verilmiyor') {
    return res.status(403).json({ hata: err.message });
  }

  console.error(err.message);
  res.status(500).json({ hata: 'Sunucu hatası' });
});

app.listen(PORT, () => {
  console.log(`La Joie sunucusu ${PORT} portunda çalışıyor`);
});
