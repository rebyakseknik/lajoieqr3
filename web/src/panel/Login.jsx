import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAyarlar } from '../lib/kancalar';
import '../styles/panel.css';

export default function Login() {
  const { ayarlar } = useAyarlar();
  const [eposta, setEposta] = useState('');
  const [sifre, setSifre] = useState('');
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);

  async function girisYap(e) {
    e.preventDefault();
    setHata('');
    setBekliyor(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: eposta.trim(),
      password: sifre,
    });

    if (error) {
      // Hangi bilginin yanlış olduğunu söylemeyiz; e-posta taramasını zorlaştırır.
      setHata('E-posta veya şifre hatalı. Tekrar deneyin.');
      setBekliyor(false);
      return;
    }
    // Oturum açılınca useOturum kancası devreye girer ve panel açılır.
  }

  return (
    <div className="giris-sayfa">
      <main className="giris-kutu">
        <p className="giris-etiket">Yönetim Paneli</p>
        <h1 className="giris-marka">{ayarlar.restaurant_name}</h1>

        {hata ? <p className="not not-hata">{hata}</p> : null}

        <form className="giris-form" onSubmit={girisYap}>
          <label htmlFor="eposta">E-posta</label>
          <input
            id="eposta"
            type="email"
            value={eposta}
            onChange={(e) => setEposta(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />

          <label htmlFor="sifre">Şifre</label>
          <input
            id="sifre"
            type="password"
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            autoComplete="current-password"
            required
          />

          <button type="submit" disabled={bekliyor}>
            {bekliyor ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>

        <a className="giris-geri" href="/">
          ← Menüyü görüntüle
        </a>
      </main>
    </div>
  );
}
