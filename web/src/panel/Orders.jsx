import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { para } from '../lib/bicim';
import { saat } from '../lib/siparis';
import { usePanel, PanelBaslik } from './PanelLayout';
import Kart from './parts/Kart';

const SUTUNLAR = [
  { durum: 'new',       ad: 'Yeni',          sonraki: 'preparing', dugme: 'Hazırlamaya başla' },
  { durum: 'preparing', ad: 'Hazırlanıyor',  sonraki: 'ready',     dugme: 'Hazır' },
  { durum: 'ready',     ad: 'Hazır',         sonraki: 'done',      dugme: 'Teslim edildi' },
];

/* ==========================================================
   SES MOTORU
   Dosya gerektirmez; tonlar tarayicinin ses motoruyla uretilir.
   Tek AudioContext kullanilir: tarayicilar cok sayida baglam
   acilmasina izin vermez.
   ========================================================== */

let sesBaglami = null;

function baglamiGetir() {
  try {
    if (!sesBaglami) {
      sesBaglami = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (sesBaglami.state === 'suspended') sesBaglami.resume();
    return sesBaglami;
  } catch {
    return null;
  }
}

/** Tek bir nota calar. */
function nota(ctx, { sekil = 'sine', frekans, baslangic, sure, seviye }) {
  const osc = ctx.createOscillator();
  const kazanc = ctx.createGain();
  osc.connect(kazanc);
  kazanc.connect(ctx.destination);
  osc.type = sekil;
  osc.frequency.setValueAtTime(frekans, ctx.currentTime + baslangic);
  kazanc.gain.setValueAtTime(0.0001, ctx.currentTime + baslangic);
  kazanc.gain.exponentialRampToValueAtTime(seviye, ctx.currentTime + baslangic + 0.015);
  kazanc.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + baslangic + sure);
  osc.start(ctx.currentTime + baslangic);
  osc.stop(ctx.currentTime + baslangic + sure + 0.05);
}

export const TONLAR = [
  { id: 'ding',    ad: 'Ding' },
  { id: 'zil',     ad: 'Zil' },
  { id: 'melodi',  ad: 'Melodi' },
  { id: 'israrci', ad: 'Israrcı' },
];

export const SEVIYELER = [
  { id: 'kisik',  ad: 'Kısık',  deger: 0.06 },
  { id: 'orta',   ad: 'Orta',   deger: 0.16 },
  { id: 'yuksek', ad: 'Yüksek', deger: 0.34 },
];

function tonCal(ton = 'ding', seviyeId = 'orta') {
  const ctx = baglamiGetir();
  if (!ctx || ctx.state === 'suspended') return false;

  const v = (SEVIYELER.find((x) => x.id === seviyeId) || SEVIYELER[1]).deger;

  if (ton === 'zil') {
    nota(ctx, { sekil: 'triangle', frekans: 1560, baslangic: 0,    sure: 0.5, seviye: v });
    nota(ctx, { sekil: 'triangle', frekans: 1560, baslangic: 0.28, sure: 0.7, seviye: v });
  } else if (ton === 'melodi') {
    nota(ctx, { frekans: 660, baslangic: 0,    sure: 0.18, seviye: v });
    nota(ctx, { frekans: 880, baslangic: 0.16, sure: 0.18, seviye: v });
    nota(ctx, { frekans: 1100, baslangic: 0.32, sure: 0.34, seviye: v });
  } else if (ton === 'israrci') {
    nota(ctx, { sekil: 'square', frekans: 950, baslangic: 0,    sure: 0.14, seviye: v * 0.6 });
    nota(ctx, { sekil: 'square', frekans: 950, baslangic: 0.2,  sure: 0.14, seviye: v * 0.6 });
    nota(ctx, { sekil: 'square', frekans: 1150, baslangic: 0.4, sure: 0.2,  seviye: v * 0.6 });
  } else {
    nota(ctx, { frekans: 880,  baslangic: 0,    sure: 0.3, seviye: v });
    nota(ctx, { frekans: 1180, baslangic: 0.14, sure: 0.34, seviye: v });
  }
  return true;
}

/* Cihaza ozel ses tercihi: mutfaktaki telefon kendi ayarini tutar. */
const SES_ANAHTAR = 'lajoie_panel_ses';

function sesAyariOku() {
  try {
    return {
      acik: true,
      ton: 'ding',
      seviye: 'orta',
      tekrar: 5,
      ...JSON.parse(localStorage.getItem(SES_ANAHTAR) || '{}'),
    };
  } catch {
    return { acik: true, ton: 'ding', seviye: 'orta', tekrar: 5 };
  }
}

export default function Orders() {
  const { ayarlar, bildirim, bildir } = usePanel();
  const [siparisler, setSiparisler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [ses, setSes] = useState(sesAyariOku);
  const [sesKilitli, setSesKilitli] = useState(false); // tarayici izin bekliyor
  const [gecmis, setGecmis] = useState(false);

  const simge = ayarlar.currency || '₺';
  // id -> son bilinen durum. Salt kimlik tutsaydik, online odenen siparis
  // "odeme bekleniyor"dan "yeni"ye gectiginde ses calmazdi.
  const bilinenler = useRef(new Map());
  const ilkYukleme = useRef(true);
  const sesRef = useRef(ses);

  useEffect(() => {
    sesRef.current = ses;
    try {
      localStorage.setItem(SES_ANAHTAR, JSON.stringify(ses));
    } catch {
      /* onemli degil */
    }
  }, [ses]);

  function cal() {
    const a = sesRef.current;
    if (!a.acik) return;
    const oldu = tonCal(a.ton, a.seviye);
    // Tarayici, kullanici sayfaya dokunmadan ses calmaya izin vermez.
    // Izin yoksa ekranda "sesi ac" dugmesi gosteririz.
    setSesKilitli(!oldu);
  }

  const getir = useCallback(async () => {
    const bugun = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(id, name, qty, unit_price, order_item_options(id, name, price))')
      .eq('order_day', bugun)
      .order('pickup_at', { ascending: true })
      .order('table_no', { ascending: true });

    if (error) {
      bildir(error.message, 'hata');
      setYukleniyor(false);
      return;
    }

    const liste = data || [];

    // Yeni gelen var mi? Iki hal sayilir: hic gorulmemis 'new' siparis,
    // ya da odemesi tamamlanip 'awaiting_payment'ten 'new'e dusen siparis.
    if (!ilkYukleme.current) {
      const yeni = liste.filter((s) => {
        if (s.status !== 'new') return false;
        const onceki = bilinenler.current.get(s.id);
        return onceki === undefined || onceki === 'awaiting_payment';
      });
      if (yeni.length) cal();
    }
    liste.forEach((s) => bilinenler.current.set(s.id, s.status));
    ilkYukleme.current = false;

    setSiparisler(liste);
    setYukleniyor(false);
  }, [bildir]);

  useEffect(() => {
    getir();
  }, [getir]);

  /* Canli yayin: yeni siparis aninda dussun. */
  useEffect(() => {
    const kanal = supabase
      .channel('siparis-akisi')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => getir())
      .subscribe();

    // Baglanti koparsa diye 20 saniyede bir yedek tazeleme.
    const zaman = setInterval(getir, 20000);

    return () => {
      supabase.removeChannel(kanal);
      clearInterval(zaman);
    };
  }, [getir]);

  /* Bekleyen siparis varken, biri onaylayana kadar aralikli calar. */
  const bekleyenVar = siparisler.some((x) => x.status === 'new');

  useEffect(() => {
    if (!bekleyenVar || !ses.acik || ses.tekrar <= 0) return undefined;
    const zaman = setInterval(cal, ses.tekrar * 1000);
    return () => clearInterval(zaman);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bekleyenVar, ses.acik, ses.tekrar]);

  async function durumDegistir(siparis, durum) {
    let sebep = '';
    if (durum === 'cancelled') {
      sebep = window.prompt('İptal sebebi (müşteriye görünecek):', 'Ürün kalmadı');
      if (sebep === null) return;
    }

    const { error } = await supabase.rpc('siparis_durum', {
      p_id: siparis.id,
      p_durum: durum,
      p_sebep: sebep,
    });

    if (error) {
      bildir(error.message, 'hata');
      return;
    }

    // Musteriye bildirim: basarisiz olursa siparis akisini bozmasin.
    supabase.functions
      .invoke('bildirim-gonder', {
        body: { order_id: siparis.id, durum, kod: siparis.code },
      })
      .catch(() => {});

    getir();
  }

  const bitmisler = siparisler.filter((s) => ['done', 'cancelled'].includes(s.status));
  const odemeBekleyen = siparisler.filter((s) => s.status === 'awaiting_payment');
  // Ciroya ödeme bekleyenler girmez; henüz gerçek sipariş değil.
  const ciro = siparisler
    .filter((s) => !['cancelled', 'awaiting_payment'].includes(s.status))
    .reduce((t, s) => t + Number(s.total), 0);

  return (
    <>
      <PanelBaslik baslik="Ön siparişler" bildirim={bildirim} />

      <div className="s-ust">
        <p className="s-ozet">
          Bugün <strong>{siparisler.length}</strong> sipariş · <strong>{para(ciro, simge)}</strong>
        </p>
        {odemeBekleyen.length ? (
          <p className="s-odeme-bekleyen">
            {odemeBekleyen.length} sipariş ödeme bekliyor
          </p>
        ) : null}

        <div className="s-ses-kutu">
          <label className="s-ses">
            <input
              type="checkbox"
              checked={ses.acik}
              onChange={(e) => setSes({ ...ses, acik: e.target.checked })}
            />
            Ses
          </label>

          {ses.acik ? (
            <>
              <select
                aria-label="Uyarı sesi"
                value={ses.ton}
                onChange={(e) => {
                  setSes({ ...ses, ton: e.target.value });
                  tonCal(e.target.value, ses.seviye);
                }}
              >
                {TONLAR.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.ad}
                  </option>
                ))}
              </select>

              <select
                aria-label="Ses seviyesi"
                value={ses.seviye}
                onChange={(e) => {
                  setSes({ ...ses, seviye: e.target.value });
                  tonCal(ses.ton, e.target.value);
                }}
              >
                {SEVIYELER.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.ad}
                  </option>
                ))}
              </select>

              <select
                aria-label="Tekrar aralığı"
                value={ses.tekrar}
                onChange={(e) => setSes({ ...ses, tekrar: Number(e.target.value) })}
              >
                <option value={0}>Tek sefer</option>
                <option value={3}>3 sn'de bir</option>
                <option value={5}>5 sn'de bir</option>
                <option value={10}>10 sn'de bir</option>
                <option value={15}>15 sn'de bir</option>
                <option value={30}>30 sn'de bir</option>
                <option value={60}>Dakikada bir</option>
              </select>

              <button type="button" className="s-ses-dene" onClick={cal}>
                Dene
              </button>
            </>
          ) : null}
        </div>
      </div>

      {sesKilitli && ses.acik ? (
        <button
          type="button"
          className="s-ses-kilit"
          onClick={() => {
            baglamiGetir();
            setSesKilitli(false);
            cal();
          }}
        >
          🔔 Tarayıcı sese izin bekliyor — sesi açmak için buraya dokunun
        </button>
      ) : null}

      {yukleniyor ? (
        <Kart>
          <p className="p-yok">Siparişler yükleniyor…</p>
        </Kart>
      ) : (
        <>
          <div className="s-pano">
            {SUTUNLAR.map((sutun) => {
              const liste = siparisler.filter((s) => s.status === sutun.durum);

              return (
                <section key={sutun.durum} className={`s-sutun s-${sutun.durum}`}>
                  <h2 className="s-sutun-baslik">
                    {sutun.ad}
                    <span>{liste.length}</span>
                  </h2>

                  {!liste.length ? (
                    <p className="s-bos">—</p>
                  ) : (
                    liste.map((s) => (
                      <article key={s.id} className="s-fis">
                        <header className="s-fis-ust">
                          <span className="s-masa">{s.table_no}</span>
                          <div>
                            <p className="s-saat">{saat(s.pickup_at)}</p>
                            <p className="s-mod">
                              {s.mode === 'pickup' ? 'Paket' : 'Masada'}
                              {s.customer_name ? ` · ${s.customer_name}` : ''}
                              {s.payment_status === 'paid' ? (
                                <b className="s-odendi">ödendi</b>
                              ) : null}
                            </p>
                          </div>
                          <span className="s-tutar">
                            {para(s.total, simge)}
                            {Number(s.discount) > 0 || Number(s.gift_used) > 0 ? (
                              <small className="s-indirim">
                                {Number(s.subtotal) > 0 ? para(s.subtotal, simge) : ''}
                              </small>
                            ) : null}
                          </span>
                        </header>

                        <ul className="s-urunler">
                          {(s.order_items || []).map((u) => (
                            <li key={u.id}>
                              <b>{u.qty}×</b> {u.name}
                              {(u.order_item_options || []).length ? (
                                <ul className="s-secimler">
                                  {u.order_item_options.map((x) => (
                                    <li key={x.id}>{x.name}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </li>
                          ))}
                        </ul>

                        {s.note ? <p className="s-not">“{s.note}”</p> : null}
                        {s.customer_phone ? (
                          <p className="s-tel">
                            <a href={`tel:${s.customer_phone.replace(/[^0-9+]/g, '')}`}>
                              {s.customer_phone}
                            </a>
                          </p>
                        ) : null}

                        <div className="s-eylem">
                          <button
                            type="button"
                            className="s-ileri"
                            onClick={() => durumDegistir(s, sutun.sonraki)}
                          >
                            {sutun.dugme}
                          </button>
                          <button
                            type="button"
                            className="s-iptal"
                            onClick={() => durumDegistir(s, 'cancelled')}
                          >
                            İptal
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </section>
              );
            })}
          </div>

          {/* ---------- Kapanmis siparisler ---------- */}
          <Kart>
            <button type="button" className="s-gecmis-dugme" onClick={() => setGecmis(!gecmis)}>
              {gecmis ? '▾' : '▸'} Bugün kapanan siparişler ({bitmisler.length})
            </button>

            {gecmis ? (
              !bitmisler.length ? (
                <p className="p-yok">Henüz yok.</p>
              ) : (
                <ul className="s-gecmis">
                  {bitmisler.map((s) => (
                    <li key={s.id}>
                      <span className="s-gecmis-no">{s.table_no}</span>
                      <span>{saat(s.pickup_at)}</span>
                      <span className={s.status === 'cancelled' ? 's-iptal-etiket' : ''}>
                        {s.status === 'cancelled' ? `İptal${s.cancel_reason ? ` · ${s.cancel_reason}` : ''}` : 'Teslim'}
                      </span>
                      <span className="s-gecmis-tutar">{para(s.total, simge)}</span>
                      {s.status === 'cancelled' ? null : (
                        <button type="button" onClick={() => durumDegistir(s, 'ready')}>
                          Geri al
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </Kart>
        </>
      )}
    </>
  );
}
