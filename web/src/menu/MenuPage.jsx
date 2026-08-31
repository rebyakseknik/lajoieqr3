import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAyarlar, useMenuVerisi } from '../lib/kancalar';
import { olayGonder } from '../lib/takip';
import { sonSiparis, useSepet } from '../lib/sepet';
import { hatirlananKampanya, useKullanici } from '../lib/hesap';
import AuthSheet from './AuthSheet';
import CartBar from './CartBar';
import HowItWorks from './HowItWorks';
import Announcements from './Announcements';
import CartSheet from './CartSheet';
import MenuHeader from './MenuHeader';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import CategoryRail from './CategoryRail';
import CategorySection from './CategorySection';
import ProductSheet from './ProductSheet';
import '../styles/menu.css';

export default function MenuPage() {
  const { ayarlar } = useAyarlar();
  const { kategoriler, urunler, secenekler, yukleniyor, hata } = useMenuVerisi(false);

  const [etkinId, setEtkinId] = useState(null);
  const [acikUrun, setAcikUrun] = useState(null);
  const [sepetAcik, setSepetAcik] = useState(false);
  const [girisAcik, setGirisAcik] = useState(false);
  const [tepeKucuk, setTepeKucuk] = useState(false);
  const [acikSiparis, setAcikSiparis] = useState(null);
  const oranlar = useRef(new Map());

  const siparisAcik = ayarlar.preorder_enabled === '1';
  const { girisli } = useKullanici();
  const { adet: sepetAdedi } = useSepet();
  const konum = useLocation();

  /* Hesap sayfasindaki "tekrarla" buraya sepetiAc isaretiyle gonderir. */
  /* Kampanya bağlantısından gelen, henüz üye olmayan ziyaretçi. */
  const kampanyaVar = Boolean(hatirlananKampanya()) && !girisli && siparisAcik;

  /* Kaydirinca marka blogu kuculsun; urunler yukari gelsin. */
  useEffect(() => {
    function bak() {
      setTepeKucuk(window.scrollY > 90);
    }
    bak();
    window.addEventListener('scroll', bak, { passive: true });
    return () => window.removeEventListener('scroll', bak);
  }, []);

  useEffect(() => {
    if (konum.state?.sepetiAc) {
      setSepetAcik(true);
      window.history.replaceState({}, '');
    }
  }, [konum.state]);

  /* Yarim kalmis bir siparis varsa menunun basinda hatirlatalim. */
  useEffect(() => {
    setAcikSiparis(sonSiparis());
  }, []);

  /* Menü açılışını bir kez kaydet */
  useEffect(() => {
    olayGonder('open');
  }, []);

  /* Ürünleri kategorilere dağıt, boş kategorileri gizle */
  const dolular = useMemo(() => {
    const grup = new Map();
    urunler.forEach((u) => {
      const liste = grup.get(u.category_id) || [];
      liste.push(u);
      grup.set(u.category_id, liste);
    });

    return kategoriler
      .filter((k) => (grup.get(k.id) || []).length > 0)
      .map((k) => ({ kategori: k, urunler: grup.get(k.id) }));
  }, [kategoriler, urunler]);

  useEffect(() => {
    if (!etkinId && dolular.length) setEtkinId(dolular[0].kategori.id);
  }, [dolular, etkinId]);

  /* Hangi bölüm daha çok görünüyorsa o etkin olsun */
  const gorunurlukDegisti = useCallback((kategoriId, oran) => {
    oranlar.current.set(kategoriId, oran);

    let enIyi = null;
    let enIyiOran = 0;
    oranlar.current.forEach((deger, id) => {
      if (deger > enIyiOran) {
        enIyiOran = deger;
        enIyi = id;
      }
    });

    if (enIyi) {
      setEtkinId(enIyi);
      olayGonder('category', enIyi);
    }
  }, []);

  function kategoriyeGit(id) {
    olayGonder('category', id);
    setEtkinId(id);
    document.getElementById(`k${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function urunuAc(urun) {
    olayGonder('product', urun.id);
    setAcikUrun(urun);
  }

  const simge = ayarlar.currency || '₺';

  return (
    <>
      <a className="atla" href="#menu">
        Menüye geç
      </a>

      <SiteHeader
        ayarlar={ayarlar}
        girisli={girisli}
        siparisAcik={siparisAcik}
        sepetAdedi={sepetAdedi}
        onGiris={() => setGirisAcik(true)}
        onSepet={() => setSepetAcik(true)}
      />

      <MenuHeader
        kucuk={tepeKucuk}
        ad={ayarlar.restaurant_name}
        altBaslik={ayarlar.tagline}
      />

      <Announcements />

      {acikSiparis ? (
        <Link className="acik-siparis" to={`/siparis/${acikSiparis}`}>
          <span>Devam eden siparişiniz var</span>
          <b>Takip et →</b>
        </Link>
      ) : kampanyaVar ? (
        <button type="button" className="kampanya-serit" onClick={() => setGirisAcik(true)}>
          <span>
            <b>İndirim kuponunuz hazır</b>
            <small>Hesap açın, kupon hesabınıza tanımlansın</small>
          </span>
          <span className="kampanya-ok" aria-hidden="true">→</span>
        </button>
      ) : siparisAcik ? (
        <HowItWorks girisZorunlu={ayarlar.preorder_require_login === '1'} />
      ) : null}

      {yukleniyor ? (
        <main className="bos">
          <p className="bos-alt">Menü yükleniyor…</p>
        </main>
      ) : hata ? (
        <main className="bos">
          <p className="bos-baslik">Menü şu an açılamadı</p>
          <p className="bos-alt">Lütfen birkaç saniye sonra sayfayı yenileyin.</p>
        </main>
      ) : !dolular.length ? (
        <main className="bos">
          <p className="bos-baslik">Menü henüz hazırlanıyor</p>
          <p className="bos-alt">Ürünler eklendiğinde burada görünecek.</p>
        </main>
      ) : (
        <>
          <CategoryRail
            kategoriler={dolular.map((d) => d.kategori)}
            etkinId={etkinId}
            onSec={kategoriyeGit}
          />

          <main id="menu">
            {dolular.map(({ kategori, urunler: liste }) => (
              <CategorySection
                key={kategori.id}
                kategori={kategori}
                urunler={liste}
                simge={simge}
                onAc={urunuAc}
                onGorunur={gorunurlukDegisti}
              />
            ))}
          </main>
        </>
      )}

      <SiteFooter />

      {siparisAcik ? <CartBar simge={simge} onAc={() => setSepetAcik(true)} /> : null}

      {acikUrun ? (
        <ProductSheet
          urun={acikUrun}
          simge={simge}
          siparisAcik={siparisAcik}
          gruplar={(secenekler || []).filter((g) => g.product_id === acikUrun.id)}
          onKapat={() => setAcikUrun(null)}
        />
      ) : null}

      {sepetAcik ? (
        <CartSheet
          simge={simge}
          ayarlar={ayarlar}
          onKapat={() => setSepetAcik(false)}
          onGirisIste={() => {
            setSepetAcik(false);
            setGirisAcik(true);
          }}
        />
      ) : null}

      {girisAcik ? <AuthSheet ayarlar={ayarlar} onKapat={() => setGirisAcik(false)} /> : null}
    </>
  );
}
