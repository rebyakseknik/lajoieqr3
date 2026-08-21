import { useOturum } from '../lib/kancalar';
import { supabase } from '../lib/supabase';
import Login from './Login';
import '../styles/panel.css';

/**
 * Panelin kapisi. Uc durum var:
 *  - oturum yok                  -> giris ekrani
 *  - oturum var, yonetici degil  -> nazik ret
 *  - oturum var ve yonetici      -> panel acilir
 *
 * Bu kontrol sadece gorunum icindir; asil koruma veritabanindaki
 * RLS kurallaridir. Birisi bu ekrani atlasa bile hicbir veriyi degistiremez.
 */
export default function RequireAuth({ children }) {
  const { oturum, yonetici, yukleniyor } = useOturum();

  if (yukleniyor) {
    return (
      <div className="giris-sayfa">
        <main className="giris-kutu">
          <p className="giris-etiket">Yönetim Paneli</p>
          <p className="not">Kontrol ediliyor…</p>
        </main>
      </div>
    );
  }

  if (!oturum) return <Login />;

  if (!yonetici) {
    return (
      <div className="giris-sayfa">
        <main className="giris-kutu">
          <p className="giris-etiket">Yönetim Paneli</p>
          <h1 className="giris-marka">Erişim yok</h1>
          <p className="not not-hata">
            Bu hesap panele yetkili değil. Yetki vermek için Supabase panelindeki
            admins tablosuna eklenmesi gerekir.
          </p>
          <button
            type="button"
            className="p-dugme"
            style={{ marginTop: 18 }}
            onClick={() => supabase.auth.signOut()}
          >
            Çıkış yap
          </button>
        </main>
      </div>
    );
  }

  return children;
}
