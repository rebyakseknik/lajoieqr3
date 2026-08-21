import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { para } from '../lib/bicim';
import { useAyarlar } from '../lib/kancalar';
import { saat, siparisGetir, siparistenVazgec } from '../lib/siparis';
import { supabase } from '../lib/supabase';
import { useKullanici } from '../lib/hesap';
import '../styles/menu.css';

/**
 * Odeme sayfasi: PayTR'nin kart formu guvenli bir iframe icinde acilir.
 * Kart bilgisi bizim sistemimize HIC ugramaz; PayTR'da kalir.
 *
 * Siparisi onaylayan sey bu sayfa degil, PayTR'nin sunucumuza gonderdigi
 * bildirimdir. Bu sayfa yalnizca durumu izler: odeme dustugu an takip
 * ekranina gecer.
 */
export default function PaymentPage() {
  const { kod } = useParams();
  const git = useNavigate();
  const { ayarlar } = useAyarlar();
  const { kullanici } = useKullanici();

  const [siparis, setSiparis] = useState(null);
  const [token, setToken] = useState('');
  const [hata, setHata] = useState('');
  const [kalan, setKalan] = useState(null);
  const cerceve = useRef(null);

  const simge = ayarlar.currency || '₺';

  /* ---------- Siparisi izle ---------- */
  const getir = useCallback(async () => {
    try {
      const s = await siparisGetir(kod);
      setSiparis(s);
      return s;
    } catch {
      setHata('Sipariş bulunamadı.');
      return null;
    }
  }, [kod]);

  useEffect(() => {
    getir();
  }, [getir]);

  /* Odeme sonucu webhook'la duser; biz sadece durumu yokluyoruz. */
  useEffect(() => {
    if (!siparis) return undefined;

    if (siparis.payment_status === 'paid') {
      git(`/siparis/${kod}`, { replace: true });
      return undefined;
    }
    if (siparis.status === 'cancelled') return undefined;

    const zaman = setInterval(getir, 4000);
    return () => clearInterval(zaman);
  }, [siparis, getir, git, kod]);

  /* ---------- Geri sayim ---------- */
  useEffect(() => {
    if (!siparis?.expires_at) return undefined;
    function say() {
      const fark = Math.max(0, Math.floor((new Date(siparis.expires_at) - Date.now()) / 1000));
      setKalan(fark);
    }
    say();
    const zaman = setInterval(say, 1000);
    return () => clearInterval(zaman);
  }, [siparis?.expires_at]);

  /* ---------- Token al ---------- */
  useEffect(() => {
    if (!siparis || token || hata) return;
    if (siparis.status !== 'awaiting_payment') return;

    let iptal = false;
    supabase.functions
      .invoke('paytr-token', {
        body: { kod, eposta: kullanici?.email || '' },
      })
      .then(({ data, error }) => {
        if (iptal) return;
        if (error || !data?.token) {
          setHata(
            data?.hata || 'Ödeme başlatılamadı. Kasada ödemeyi seçerek yeniden sipariş verebilirsiniz.'
          );
          return;
        }
        setToken(data.token);
      });

    return () => {
      iptal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siparis, kod]);

  /* PayTR'nin iframe boyutlandiricisi: form uzayinca sayfa da uzasin. */
  useEffect(() => {
    if (!token) return undefined;
    const betik = document.createElement('script');
    betik.src = 'https://www.paytr.com/js/iframeResizer.min.js';
    betik.async = true;
    betik.onload = () => {
      try {
        window.iFrameResize?.({ checkOrigin: false }, '#paytr-cerceve');
      } catch {
        /* yukseklik sabit kalir, yine calisir */
      }
    };
    document.body.appendChild(betik);
    return () => betik.remove();
  }, [token]);

  async function vazgec() {
    if (!window.confirm('Ödemeden vazgeçip siparişi iptal etmek istiyor musunuz?')) return;
    try {
      await siparistenVazgec(kod);
      git('/', { replace: true });
    } catch (e) {
      setHata(e?.message || 'İptal edilemedi.');
    }
  }

  /* ---------- Gorunumler ---------- */

  if (hata && !siparis) {
    return (
      <main className="bos">
        <p className="bos-baslik">Bir sorun oldu</p>
        <p className="bos-alt">{hata}</p>
        <p style={{ marginTop: 24 }}>
          <Link className="ana-dugme dugme-ince" to="/">
            Menüye dön
          </Link>
        </p>
      </main>
    );
  }

  if (!siparis) {
    return (
      <main className="bos">
        <p className="bos-alt">Ödeme hazırlanıyor…</p>
      </main>
    );
  }

  if (siparis.status === 'cancelled') {
    return (
      <main className="bos">
        <p className="bos-baslik">Sipariş iptal edildi</p>
        <p className="bos-alt">
          {siparis.cancel_reason === 'Ödeme tamamlanmadı'
            ? 'Ödeme süresi doldu. Dilerseniz yeniden sipariş verebilirsiniz.'
            : siparis.cancel_reason || 'Bu sipariş artık geçerli değil.'}
        </p>
        <p style={{ marginTop: 24 }}>
          <Link className="ana-dugme dugme-ince" to="/">
            Menüye dön
          </Link>
        </p>
      </main>
    );
  }

  const dakika = kalan !== null ? Math.floor(kalan / 60) : null;
  const saniye = kalan !== null ? String(kalan % 60).padStart(2, '0') : null;

  return (
    <main className="odeme">
      <header className="odeme-ust">
        <div>
          <p className="masa-etiket" style={{ color: 'var(--muted)' }}>
            Güvenli ödeme
          </p>
          <h1 className="odeme-baslik">{para(siparis.total, simge)}</h1>
          <p className="odeme-alt">
            Sanal masa {siparis.table_no} · Teslim {saat(siparis.pickup_at)}
          </p>
        </div>

        {kalan !== null ? (
          <div className={`odeme-sayac${kalan < 120 ? ' az' : ''}`} aria-live="polite">
            <b>
              {dakika}:{saniye}
            </b>
            <small>kalan süre</small>
          </div>
        ) : null}
      </header>

      {hata ? <p className="alan-not alan-uyari">{hata}</p> : null}

      {token ? (
        <div className="odeme-cerceve-kutu">
          <iframe
            id="paytr-cerceve"
            ref={cerceve}
            title="PayTR güvenli ödeme"
            src={`https://www.paytr.com/odeme/guvenli/${token}`}
            frameBorder="0"
            scrolling="no"
          />
        </div>
      ) : !hata ? (
        <div className="odeme-bekle">
          <p>Kart ekranı hazırlanıyor…</p>
        </div>
      ) : null}

      <p className="alan-not alan-kucuk" style={{ textAlign: 'center' }}>
        Kart bilgileriniz bize değil, doğrudan PayTR'a iletilir. Ödemeniz
        onaylandığı an siparişiniz mutfağa düşer ve bu sayfa kendiliğinden
        takip ekranına geçer.
      </p>

      <button type="button" className="dugme-ikincil" onClick={vazgec}>
        Vazgeç ve siparişi iptal et
      </button>
    </main>
  );
}
