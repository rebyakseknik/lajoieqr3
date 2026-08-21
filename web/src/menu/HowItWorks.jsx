import { useState } from 'react';

const GIZLEME_ANAHTARI = 'lajoie_nasil_gizli';

/* Ikonlar elle cizilmis SVG; dosya indirmez, palete uyar. */

function IkonSec() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      {/* tabak */}
      <circle cx="20" cy="24" r="13" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="20" cy="24" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" opacity=".45" />
      {/* ekleme rozeti */}
      <circle cx="33" cy="12" r="8.5" fill="var(--zest)" />
      <path d="M33 8.4v7.2M29.4 12h7.2" stroke="#3A2A02" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

function IkonSaat() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="23" r="14" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M22 15.5V23l5.5 3.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* zil ayaklari */}
      <path d="M11.5 9.5 8 13M32.5 9.5 36 13" stroke="var(--zest)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function IkonNumara() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      {/* numara karti */}
      <rect x="9" y="8" width="26" height="30" rx="5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M15 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".45" />
      <text
        x="22"
        y="32"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="var(--zest)"
        fontFamily="inherit"
      >
        101
      </text>
    </svg>
  );
}

const ADIMLAR = [
  {
    Ikon: IkonSec,
    baslik: 'Seçin',
    metin: 'Ürüne dokunun, sepete ekleyin.',
  },
  {
    Ikon: IkonSaat,
    baslik: 'Saati söyleyin',
    metin: 'Kaçta hazır olsun? Uygun dilimi seçin.',
  },
  {
    Ikon: IkonNumara,
    baslik: 'Numaranızla alın',
    metin: 'Sanal masa numaranızı kasada söyleyin; beklemeden alın ya da oturun.',
  },
];

/**
 * On siparisi ilk kez gorene 3 adimda anlatir.
 * Kapatilinca bir daha gorunmez; menuyu isgal etmesin.
 */
export default function HowItWorks({ girisZorunlu = false }) {
  const [gizli, setGizli] = useState(() => {
    try {
      return localStorage.getItem(GIZLEME_ANAHTARI) === '1';
    } catch {
      return false;
    }
  });

  if (gizli) return null;

  function kapat() {
    setGizli(true);
    try {
      localStorage.setItem(GIZLEME_ANAHTARI, '1');
    } catch {
      /* onemli degil */
    }
  }

  return (
    <section className="nasil" aria-label="Ön sipariş nasıl çalışır">
      <div className="nasil-ic">
        <header className="nasil-ust">
          <p className="nasil-etiket">Öğle aranız kısıtlı mı?</p>
          <h2 className="nasil-baslik">Önden sipariş verin, sıra beklemeyin</h2>
          <button type="button" className="nasil-kapat" aria-label="Bu anlatımı kapat" onClick={kapat}>
            &times;
          </button>
        </header>

        <ol className="nasil-adimlar">
          {ADIMLAR.map(({ Ikon, baslik, metin }, i) => (
            <li key={baslik} className="nasil-adim">
              <span className="nasil-ikon">
                <Ikon />
                <b className="nasil-sira" aria-hidden="true">
                  {i + 1}
                </b>
              </span>
              <div>
                <p className="nasil-adim-baslik">{baslik}</p>
                <p className="nasil-adim-metin">{metin}</p>
              </div>
            </li>
          ))}
        </ol>

        {girisZorunlu ? (
          <p className="nasil-not">
            Sipariş verirken telefonunuza gelen tek kodla giriş yaparsınız — şifre yok,
            10 saniye sürer.
          </p>
        ) : null}
      </div>
    </section>
  );
}
