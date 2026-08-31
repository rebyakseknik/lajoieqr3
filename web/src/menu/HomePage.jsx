import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { para } from '../lib/bicim';
import { useAyarlar } from '../lib/kancalar';
import { supabase, gorselAdresi } from '../lib/supabase';
import { useKullanici } from '../lib/hesap';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import AuthSheet from './AuthSheet';
import '../styles/menu.css';

/* Üç adımlı anlatım ikonları — dosya indirmez, palete uyar. */

function IkonSec() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="20" cy="24" r="13" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="20" cy="24" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" opacity=".45" />
      <circle cx="33" cy="12" r="8.5" fill="var(--zest)" />
      <path d="M33 8.4v7.2M29.4 12h7.2" stroke="#3A2A02" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

function IkonSaat() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="23" r="14" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M22 15.5V23l5.5 3.4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.5 9.5 8 13M32.5 9.5 36 13" stroke="var(--zest)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function IkonNumara() {
  return (
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <rect x="9" y="8" width="26" height="30" rx="5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M15 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".45" />
      <text x="22" y="32" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--zest)">
        101
      </text>
    </svg>
  );
}

const ADIMLAR = [
  { Ikon: IkonSec, baslik: 'Seçin', metin: 'Menüden istediğinizi sepete ekleyin.' },
  { Ikon: IkonSaat, baslik: 'Saati söyleyin', metin: 'Kaçta hazır olsun? Uygun dilimi seçin.' },
  {
    Ikon: IkonNumara,
    baslik: 'Numaranızla alın',
    metin: 'Sanal masa numaranızı kasada söyleyin, beklemeden alın.',
  },
];

export default function HomePage() {
  const { ayarlar } = useAyarlar();
  const { girisli } = useKullanici();
  const [girisAcik, setGirisAcik] = useState(false);
  const [oneCikan, setOneCikan] = useState([]);

  const simge = ayarlar.currency || '₺';
  const siparisAcik = ayarlar.preorder_enabled === '1';

  useEffect(() => {
    document.title = `${ayarlar.restaurant_name || 'La Joie'} · ${
      ayarlar.tagline || 'Mersin'
    }`;
  }, [ayarlar]);

  /* Şefin önerisi işaretli ürünler vitrine gelsin. */
  useEffect(() => {
    let iptal = false;
    supabase
      .from('products')
      .select('id, name, description, price, image_path')
      .eq('active', true)
      .eq('featured', true)
      .order('position')
      .limit(6)
      .then(({ data }) => !iptal && setOneCikan(data || []));
    return () => {
      iptal = true;
    };
  }, []);

  return (
    <div className="anasayfa">
      <SiteHeader
        tam
        ayarlar={ayarlar}
        girisli={girisli}
        siparisAcik={siparisAcik}
        onGiris={() => setGirisAcik(true)}
      />

      {/* ---------- Kapak ---------- */}
      <section className="kapak">
        <div className="kapak-ic">
          <img className="kapak-logo" src="/marka/logo-dikey-koyu.svg" alt="La Joie" />

          <p className="kapak-slogan">{ayarlar.hero_note || 'Beklemeden ye'}</p>
          <p className="kapak-metin">
            {ayarlar.about_text ||
              'Öğle aranız kısıtlıysa menüden seçip önden sipariş bırakın; geldiğinizde hazır olsun.'}
          </p>

          <div className="kapak-dugmeler">
            <Link className="ana-dugme kapak-ana" to="/">
              {siparisAcik ? 'Sipariş Ver' : 'Menüyü Gör'}
            </Link>
            {siparisAcik ? (
              <Link className="kapak-ikincil" to="/">
                Menüyü incele
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---------- Nasıl çalışır ---------- */}
      {siparisAcik ? (
        <section className="bolum" id="nasil">
          <p className="bolum-etiket">Öğle aranız kısıtlı mı?</p>
          <h2 className="bolum-baslik">Önden sipariş verin, sıra beklemeyin</h2>

          <ol className="as-adimlar">
            {ADIMLAR.map(({ Ikon, baslik, metin }, i) => (
              <li key={baslik}>
                <span className="as-ikon">
                  <Ikon />
                  <b aria-hidden="true">{i + 1}</b>
                </span>
                <p className="as-baslik">{baslik}</p>
                <p className="as-metin">{metin}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* ---------- Öne çıkanlar ---------- */}
      {oneCikan.length ? (
        <section className="bolum bolum-koyu">
          <p className="bolum-etiket">Şefin önerisi</p>
          <h2 className="bolum-baslik">Öne çıkanlar</h2>

          <div className="vitrin">
            {oneCikan.map((u) => {
              const gorsel = gorselAdresi(u.image_path);
              return (
                <Link key={u.id} className="vitrin-kart" to="/">
                  {gorsel ? (
                    <img src={gorsel} alt="" loading="lazy" />
                  ) : (
                    <span className="vitrin-bos" aria-hidden="true" />
                  )}
                  <span className="vitrin-ad">{u.name}</span>
                  <span className="vitrin-fiyat">{para(u.price, simge)}</span>
                </Link>
              );
            })}
          </div>

          <Link className="ana-dugme dugme-ince vitrin-tumu" to="/">
            Tüm menüyü gör
          </Link>
        </section>
      ) : null}

      {/* ---------- Hakkımızda ---------- */}
      <section className="bolum" id="hakkimizda">
        <p className="bolum-etiket">Hakkımızda</p>
        <h2 className="bolum-baslik">{ayarlar.restaurant_name || 'La Joie'}</h2>
        <p className="bolum-metin">
          {ayarlar.about_text ||
            'Mersin’de, günlük hazırlanan malzemelerle çalışan bir mutfak. Öğle arası kısıtlı olanlar için ön sipariş sistemiyle beklemeden yemek.'}
        </p>
      </section>

      <div id="iletisim">
        <SiteFooter />
      </div>

      {girisAcik ? (
        <AuthSheet ayarlar={ayarlar} onKapat={() => setGirisAcik(false)} />
      ) : null}
    </div>
  );
}
