import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { para } from '../lib/bicim';
import { useAyarlar } from '../lib/kancalar';
import { DURUM, saat, siparisGetir, siparistenVazgec } from '../lib/siparis';
import { sonSiparisiUnut } from '../lib/sepet';
import {
  bildirimAc,
  bildirimKapat,
  iosVeEklenmemis,
  mevcutAbonelik,
  pushDestekli,
  yerindeUyar,
} from '../lib/bildirim';
import SiteHeader from '../menu/SiteHeader';
import '../styles/menu.css';

const ADIMLAR = ['new', 'preparing', 'ready', 'done'];

const ACIKLAMA = {
  awaiting_payment:
    'Siparişiniz ödeme bekliyor. Ödeme tamamlanana kadar mutfağa düşmez.',
  new: 'Siparişiniz mutfağa düştü. Onaylandığında hazırlanmaya başlayacak.',
  preparing: 'Siparişiniz hazırlanıyor. Belirttiğiniz saatte hazır olacak.',
  ready: 'Siparişiniz hazır! Kasada numaranızı söylemeniz yeterli.',
  done: 'Siparişiniz teslim edildi. Afiyet olsun.',
  cancelled: 'Bu sipariş iptal edildi.',
};

export default function OrderStatus() {
  const { kod } = useParams();
  const { ayarlar } = useAyarlar();
  const [siparis, setSiparis] = useState(null);
  const [hata, setHata] = useState(null);
  const [islem, setIslem] = useState(false);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [bildirimDurumu, setBildirimDurumu] = useState('kapali'); // kapali|acik|bekliyor|yok
  const oncekiDurum = useRef(null);

  const simge = ayarlar.currency || '₺';

  /* Zaten abone mi? */
  useEffect(() => {
    if (!pushDestekli()) {
      setBildirimDurumu('yok');
      return;
    }
    mevcutAbonelik().then((a) => setBildirimDurumu(a ? 'acik' : 'kapali'));
  }, []);

  const getir = useCallback(async () => {
    try {
      setSiparis(await siparisGetir(kod));
    } catch {
      setHata('Sipariş bulunamadı. Bağlantı eskimiş olabilir.');
    }
  }, [kod]);

  useEffect(() => {
    getir();
  }, [getir]);

  /* Sayfa aciksa: durum "hazir"a gecince ses ve titresim.
     Bildirim calismasa bile musteri fark etsin. */
  useEffect(() => {
    if (!siparis) return;
    const onceki = oncekiDurum.current;
    oncekiDurum.current = siparis.status;

    if (onceki && onceki !== siparis.status && siparis.status === 'ready') {
      yerindeUyar();
    }
  }, [siparis]);

  /* Durum degisince ekran kendiliginden guncellensin. */
  useEffect(() => {
    if (!siparis || ['done', 'cancelled'].includes(siparis.status)) return undefined;
    const zaman = setInterval(getir, 12000);
    return () => clearInterval(zaman);
  }, [siparis, getir]);

  /* Baglantiyi paylas/kopyala: musteri sekmeyi kapatirsa siparisine geri donebilsin. */
  async function baglantiyiSakla() {
    const adres = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Siparişim · La Joie', url: adres });
        return;
      }
    } catch {
      /* paylasim iptal edildi; kopyalamaya dus */
    }
    try {
      await navigator.clipboard.writeText(adres);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2400);
    } catch {
      /* eski tarayici; en azindan adres cubugunda duruyor */
    }
  }

  async function vazgec() {
    if (!window.confirm('Siparişinizi iptal etmek istediğinize emin misiniz?')) return;
    setIslem(true);
    try {
      setSiparis(await siparistenVazgec(kod));
      sonSiparisiUnut();
    } catch (e) {
      setHata(e?.message || 'İptal edilemedi.');
    }
    setIslem(false);
  }

  if (hata && !siparis) {
    return (
      <main className="bos">
        <p className="bos-baslik">Sipariş bulunamadı</p>
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
        <p className="bos-alt">Siparişiniz getiriliyor…</p>
      </main>
    );
  }

  const iptal = siparis.status === 'cancelled';
  const odemeBekliyor = siparis.status === 'awaiting_payment';
  const adimNo = ADIMLAR.indexOf(siparis.status);
  const durum = DURUM[siparis.status] || DURUM.new;

  return (
    <>
      <SiteHeader sade />
      <main className="takip">
      {/* ---------- Sanal masa numarasi ---------- */}
      <section
        className={`masa-kart${iptal || odemeBekliyor ? ' sonuk' : ''}${
          siparis.status === 'ready' ? ' hazir' : ''
        }`}
      >
        <p className="masa-etiket">Sanal masa numaranız</p>
        <p className="masa-no">{siparis.table_no}</p>
        <p className="masa-alt">
          {iptal
            ? 'İptal edildi'
            : odemeBekliyor
              ? `Ödeme tamamlanınca geçerli olacak · ${saat(siparis.pickup_at)}`
              : siparis.payment_status === 'paid'
                ? `Ödendi · Numaranızı söyleyip alın · ${saat(siparis.pickup_at)}`
                : `Kasada bu numarayı söylemeniz yeterli · ${saat(siparis.pickup_at)}`}
        </p>
      </section>

      {/* ---------- Durum ---------- */}
      <section className="takip-bolum">
        <p className={`durum-rozet durum-${durum.renk}`}>{durum.ad}</p>
        <p className="takip-aciklama">
          {iptal && siparis.cancel_reason ? siparis.cancel_reason : ACIKLAMA[siparis.status]}
        </p>

        {iptal || odemeBekliyor ? null : (
          <ol className="adimlar" aria-label="Sipariş durumu">
            {['Alındı', 'Hazırlanıyor', 'Hazır', 'Teslim'].map((ad, i) => (
              <li key={ad} className={i <= adimNo ? 'gecti' : ''}>
                <span className="adim-nokta" aria-hidden="true" />
                {ad}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ---------- Dokum ---------- */}
      <section className="takip-bolum">
        <p className="alan-baslik">Siparişiniz</p>
        <ul className="dokum">
          {(siparis.items || []).map((u, i) => (
            <li key={i}>
              <span className="dokum-adet">{u.qty}×</span>
              <span className="dokum-ad">
                {u.name}
                {(u.options || []).length ? (
                  <small className="dokum-secim">
                    {u.options.map((x) => x.name).join(' · ')}
                  </small>
                ) : null}
              </span>
              <span className="cizgi" aria-hidden="true" />
              <span className="dokum-tutar">{para(u.unit_price * u.qty, simge)}</span>
            </li>
          ))}
        </ul>

        {Number(siparis.discount) > 0 || Number(siparis.gift_used) > 0 ? (
          <div className="siparis-dokum-alt">
            <span>
              Ara toplam <b>{para(siparis.subtotal, simge)}</b>
            </span>
            {Number(siparis.discount) > 0 ? (
              <span className="dusen">
                Kupon{siparis.coupon_code ? ` (${siparis.coupon_code})` : ''}{' '}
                <b>−{para(siparis.discount, simge)}</b>
              </span>
            ) : null}
            {Number(siparis.gift_used) > 0 ? (
              <span className="dusen">
                Hediye kartı <b>−{para(siparis.gift_used, simge)}</b>
              </span>
            ) : null}
          </div>
        ) : null}

        <p className="sepet-toplam">
          <span>
            {siparis.payment_status === 'paid'
              ? 'Ödendi'
              : siparis.payment_method === 'online'
                ? 'Online ödenecek'
                : 'Kasada ödenecek'}
          </span>
          <strong>{para(siparis.total, simge)}</strong>
        </p>

        <p className="alan-not">
          {siparis.mode === 'pickup' ? 'Paket olarak hazırlanıyor' : 'Masada servis edilecek'}
          {siparis.note ? ` · Not: ${siparis.note}` : ''}
        </p>
      </section>

      {hata ? <p className="alan-not alan-uyari">{hata}</p> : null}

      <div className="takip-dugmeler">
        {odemeBekliyor ? (
          <Link className="ana-dugme" to={`/odeme/${siparis.code}`}>
            Ödemeyi tamamla
          </Link>
        ) : null}
        {siparis.status === 'new' || odemeBekliyor ? (
          <button type="button" className="dugme-ikincil" onClick={vazgec} disabled={islem}>
            Siparişten vazgeç
          </button>
        ) : null}
        <Link className="ana-dugme dugme-ince" to="/">
          Menüye dön
        </Link>
      </div>

      {['new', 'preparing', 'awaiting_payment'].includes(siparis.status) ? (
        bildirimDurumu === 'yok' ? (
          <p className="alan-not alan-kucuk" style={{ textAlign: 'center' }}>
            {iosVeEklenmemis()
              ? 'Bildirim almak için: paylaş → “Ana Ekrana Ekle”. Sonra bu sayfayı oradan açın.'
              : 'Bu tarayıcı bildirimi desteklemiyor. Sayfa açık kalırsa hazır olunca sesli uyarı verir.'}
          </p>
        ) : (
          <button
            type="button"
            className={`bildirim-dugme${bildirimDurumu === 'acik' ? ' acik' : ''}`}
            disabled={bildirimDurumu === 'bekliyor'}
            onClick={async () => {
              if (bildirimDurumu === 'acik') {
                await bildirimKapat(kod);
                setBildirimDurumu('kapali');
                return;
              }
              setBildirimDurumu('bekliyor');
              const sonuc = await bildirimAc(kod);
              if (sonuc === 'ok') setBildirimDurumu('acik');
              else {
                setBildirimDurumu('kapali');
                setHata(
                  sonuc === 'reddedildi'
                    ? 'Bildirim izni verilmedi. Tarayıcı ayarlarından açabilirsiniz.'
                    : 'Bildirim açılamadı. Sayfa açık kalırsa sesli uyarı yine çalışır.'
                );
              }
            }}
          >
            {bildirimDurumu === 'acik'
              ? '🔔 Hazır olunca haber verilecek · kapat'
              : bildirimDurumu === 'bekliyor'
                ? 'Açılıyor…'
                : '🔔 Hazır olunca haber ver'}
          </button>
        )
      ) : null}

      <button type="button" className="baglanti-sakla" onClick={baglantiyiSakla}>
        {kopyalandi ? 'Bağlantı kopyalandı ✓' : 'Bağlantıyı kaydet / paylaş'}
      </button>

      <p className="alan-not alan-kucuk" style={{ textAlign: 'center' }}>
        Sekmeyi kapatsanız bile bu bağlantıyla siparişinize geri dönebilirsiniz.
      </p>
      </main>
    </>
  );
}
