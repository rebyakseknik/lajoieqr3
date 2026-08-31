import { Link, useLocation } from 'react-router-dom';

/**
 * Site basligi. Uc halde calisir:
 *
 *   tam   → ana sayfa: bilgi seridi + logo + baglantilar + "Siparis Ver"
 *   normal→ menu: logo + hesap + siparis dugmesi (gezinme baglantisi yok,
 *           cunku menudeki musteri gezinmek degil yemek secmek istiyor)
 *   sade  → siparis takip: yalnizca logo + menuye don
 *
 * Odeme sayfasinda HIC gorunmez: kart girerken sayfadan cikaracak her
 * baglanti odemeyi yarida biraktirir.
 */
export default function SiteHeader({
  tam = false,
  sade = false,
  ayarlar = {},
  girisli = false,
  siparisAcik = false,
  onGiris,
  onSepet,
  sepetAdedi = 0,
}) {
  const konum = useLocation();
  const menudeyiz = konum.pathname === '/';

  return (
    <>
      {/* ---------- Bilgi şeridi (yalnızca ana sayfa) ---------- */}
      {tam ? (
        <div className="ust-serit">
          <div className="ust-serit-ic">
            {ayarlar.address ? <span>{ayarlar.address}</span> : null}
            {ayarlar.address && ayarlar.hours ? (
              <span className="ust-ayrac" aria-hidden="true">
                ·
              </span>
            ) : null}
            {ayarlar.hours ? <span>{ayarlar.hours}</span> : null}
            {ayarlar.phone ? (
              <a className="ust-tel" href={`tel:${ayarlar.phone.replace(/[^0-9+]/g, '')}`}>
                {ayarlar.phone}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <header className={`ust-bant${sade ? ' sade' : ''}${tam ? ' tam' : ''}`}>
        <div className="ust-ic">
          <Link
            className="ust-logo"
            to={menudeyiz ? '/anasayfa' : '/'}
            aria-label="La Joie"
          >
            <img src="/marka/logo-koyu.svg" alt="La Joie" />
          </Link>

          {tam ? (
            <nav className="ust-menu" aria-label="Site menüsü">
              <Link to="/">Menü</Link>
              <a href="#hakkimizda">Hakkımızda</a>
              <a href="#iletisim">İletişim</a>
            </nav>
          ) : null}

          {sade ? (
            <Link className="ust-geri" to="/">
              Menü
            </Link>
          ) : (
            <nav className="ust-eylem" aria-label="Kısayollar">
              {siparisAcik ? (
                girisli ? (
                  <Link className="ust-hesap" to="/hesabim">
                    Hesabım
                  </Link>
                ) : (
                  <button type="button" className="ust-hesap" onClick={onGiris}>
                    Giriş yap
                  </button>
                )
              ) : null}

              {/* Ana eylem: ana sayfada menüye yollar, menüde sepeti açar */}
              {tam ? (
                <Link className="ust-siparis" to="/">
                  {siparisAcik ? 'Sipariş Ver' : 'Menüyü Gör'}
                </Link>
              ) : siparisAcik ? (
                <button type="button" className="ust-siparis" onClick={onSepet}>
                  Sipariş ver
                  {sepetAdedi > 0 ? <span className="ust-rozet">{sepetAdedi}</span> : null}
                </button>
              ) : null}
            </nav>
          )}
        </div>
      </header>
    </>
  );
}
