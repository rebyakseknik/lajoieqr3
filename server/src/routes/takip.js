import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { supabase } from '../lib/supabase.js';
import { botMu, cihazTuru, ziyaretciKimligi, acilisSayilsinMi } from '../lib/ziyaretci.js';

export const takipRouter = Router();

/** Tek bir kişi istatistikleri şişiremesin diye dakikada 60 kayıt sınırı. */
const sinir = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { hata: 'Çok fazla istek' },
});

const GECERLI_TURLER = new Set(['open', 'category', 'product']);

takipRouter.post('/', sinir, async (req, res) => {
  const userAgent = req.get('user-agent') || '';

  // Botlara her zaman başarılı yanıt döneriz ama kayıt tutmayız;
  // böylece filtrenin varlığı dışarıdan anlaşılmaz.
  if (botMu(userAgent)) return res.status(204).end();

  const tur = String(req.body?.type || '');
  if (!GECERLI_TURLER.has(tur)) {
    return res.status(400).json({ hata: 'Geçersiz tür' });
  }

  let hedef = null;
  if (tur !== 'open') {
    hedef = Number.parseInt(req.body?.targetId, 10);
    if (!Number.isInteger(hedef) || hedef <= 0) {
      return res.status(400).json({ hata: 'Geçersiz hedef' });
    }
  }

  if (tur === 'open' && !acilisSayilsinMi(req, res)) {
    return res.status(204).end();
  }

  try {
    const { error } = await supabase.from('events').insert({
      type: tur,
      target_id: hedef,
      visitor: ziyaretciKimligi(req, res),
      device: cihazTuru(userAgent),
    });
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    // İstatistik kaydı menüyü asla bozmamalı.
    console.error('Olay kaydedilemedi:', e.message);
    res.status(204).end();
  }
});
