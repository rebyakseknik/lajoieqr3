import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAyarlar, useBildirim } from '../lib/kancalar';
import '../styles/panel.css';

const MENU = [
  { yol: '/panel', ad: 'Özet', tam: true },
  { yol: '/panel/siparisler', ad: 'Siparişler' },
  { yol: '/panel/duyurular', ad: 'Duyurular' },
  { yol: '/panel/kuponlar', ad: 'Kuponlar' },
  { yol: '/panel/kampanyalar', ad: 'Kampanyalar' },
  { yol: '/panel/urunler', ad: 'Ürünler' },
  { yol: '/panel/kategoriler', ad: 'Kategoriler' },
  { yol: '/panel/toplu', ad: 'Toplu ekle' },
  { yol: '/panel/qr', ad: 'QR kod' },
  { yol: '/panel/ayarlar', ad: 'Ayarlar' },
];

export default function PanelLayout() {
  const { ayarlar, yenile: ayarlariYenile } = useAyarlar();
  const { bildirim, bildir } = useBildirim();

  async function cikisYap() {
    await supabase.auth.signOut();
  }

  return (
    <>
      <header className="p-tepe">
        <div className="p-tepe-ic">
          <NavLink className="p-marka" to="/panel">
            {ayarlar.restaurant_name}
            <span>panel</span>
          </NavLink>

          <div className="p-tepe-sag">
            <a className="p-dis" href="/" target="_blank" rel="noopener noreferrer">
              Menüyü aç ↗
            </a>
            <button type="button" className="p-cikis" onClick={cikisYap}>
              Çıkış
            </button>
          </div>
        </div>

        <nav className="p-menu" aria-label="Panel menüsü">
          <div className="p-menu-ic">
            {MENU.map((m) => (
              <NavLink
                key={m.yol}
                to={m.yol}
                end={m.tam}
                className={({ isActive }) => (isActive ? 'etkin' : '')}
              >
                {m.ad}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="p-govde">
        <Outlet context={{ ayarlar, ayarlariYenile, bildirim, bildir }} />
      </main>

      <footer className="p-dip">
        <p>La Joie dijital menü · Değişiklikler anında menüye yansır</p>
      </footer>
    </>
  );
}

/** Alt sayfaların ortak bağlama erişmesi için küçük yardımcı. */
export function usePanel() {
  return useOutletContext();
}

/** Sayfa başlığı ve bildirim şeridi — her alt sayfa bunu kullanır. */
export function PanelBaslik({ baslik, bildirim }) {
  return (
    <>
      <h1 className="p-baslik">{baslik}</h1>
      {bildirim ? (
        <p className={`p-bildirim${bildirim.tur === 'hata' ? ' p-bildirim-hata' : ''}`}>
          {bildirim.mesaj}
        </p>
      ) : null}
    </>
  );
}
