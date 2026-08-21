import { useEffect, useRef, useState } from 'react';
import {
  girisYap,
  hesapHatasi,
  kayitOl,
  sifreSifirla,
  smsKoduDogrula,
  smsKoduGonder,
  telefonYaz,
} from '../lib/hesap';

/**
 * Musteri giris/kayit penceresi.
 *
 * Iki yontem var; hangisinin one cikacagini panel ayari (auth_method) soyler:
 *  - phone: numara -> SMS kodu -> giris. Kayit ve giris ayni akistir.
 *  - email: klasik e-posta + sifre.
 * Iki yontem de her zaman erisilebilir; ayar yalnizca varsayilani secer.
 */
export default function AuthSheet({ onKapat, ayarlar }) {
  const smsVarsayilan = ayarlar?.auth_method === 'phone';

  const [acik, setAcik] = useState(false);
  const [yontem, setYontem] = useState(smsVarsayilan ? 'sms' : 'eposta');

  /* SMS akisi */
  const [adim, setAdim] = useState('telefon'); // telefon | kod
  const [telefon, setTelefon] = useState('');
  const [gonderilenNo, setGonderilenNo] = useState('');
  const [kod, setKod] = useState('');
  const [sayac, setSayac] = useState(0);

  /* E-posta akisi */
  const [mod, setMod] = useState('giris'); // giris | kayit | sifirla
  const [eposta, setEposta] = useState('');
  const [sifre, setSifre] = useState('');

  /* Ortak */
  const [ad, setAd] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState('');
  const [bilgi, setBilgi] = useState('');

  const kapatRef = useRef(null);
  const kodRef = useRef(null);

  useEffect(() => {
    const kare = requestAnimationFrame(() => setAcik(true));
    kapatRef.current?.focus();
    document.body.classList.add('kilitli');
    return () => {
      cancelAnimationFrame(kare);
      document.body.classList.remove('kilitli');
    };
  }, []);

  useEffect(() => {
    function tus(e) {
      if (e.key === 'Escape' && !bekliyor) kapat();
    }
    document.addEventListener('keydown', tus);
    return () => document.removeEventListener('keydown', tus);
  });

  /* Yeniden gonderme sayaci */
  useEffect(() => {
    if (sayac <= 0) return undefined;
    const z = setTimeout(() => setSayac((s) => s - 1), 1000);
    return () => clearTimeout(z);
  }, [sayac]);

  function kapat() {
    if (bekliyor) return;
    setAcik(false);
    setTimeout(onKapat, 260);
  }

  function temizle() {
    setHata('');
    setBilgi('');
  }

  /* ---------- SMS ---------- */

  async function kodGonder(e) {
    e?.preventDefault();
    temizle();
    setBekliyor(true);
    try {
      const tam = await smsKoduGonder({ telefon, ad });
      setGonderilenNo(tam);
      setAdim('kod');
      setKod('');
      setSayac(60);
      setTimeout(() => kodRef.current?.focus(), 320);
    } catch (e2) {
      setHata(hesapHatasi(e2));
    }
    setBekliyor(false);
  }

  async function kodOnayla(e) {
    e?.preventDefault();
    temizle();
    setBekliyor(true);
    try {
      await smsKoduDogrula({ telefon: gonderilenNo, kod });
      kapat();
      return;
    } catch (e2) {
      setHata(hesapHatasi(e2));
      setBekliyor(false);
    }
  }

  /* Kod alani: 6 hane dolunca kendiliginden dogrula */
  function kodDegisti(deger) {
    const temiz = deger.replace(/[^0-9]/g, '').slice(0, 6);
    setKod(temiz);
    if (temiz.length === 6 && !bekliyor) {
      // Kucuk gecikme: state otursun.
      setTimeout(() => document.getElementById('kod-onay')?.click(), 60);
    }
  }

  /* ---------- E-posta ---------- */

  async function epostaGonder(e) {
    e.preventDefault();
    temizle();
    setBekliyor(true);
    try {
      if (mod === 'giris') {
        await girisYap({ eposta, sifre });
        kapat();
        return;
      }
      if (mod === 'kayit') {
        if (sifre.length < 8) throw new Error('password should be at least 8');
        const { dogrulamaGerekli } = await kayitOl({ eposta, sifre, ad, telefon: '' });
        if (dogrulamaGerekli) {
          setBilgi('Hesabınız oluşturuldu. E-postanıza gelen bağlantıya tıklayıp doğrulayın.');
          setBekliyor(false);
          return;
        }
        kapat();
        return;
      }
      await sifreSifirla(eposta);
      setBilgi('Şifre sıfırlama bağlantısı e-postanıza gönderildi.');
      setBekliyor(false);
    } catch (e2) {
      setHata(hesapHatasi(e2));
      setBekliyor(false);
    }
  }

  const baslik =
    yontem === 'sms'
      ? adim === 'kod'
        ? 'Kodu girin'
        : 'Telefonla devam edin'
      : mod === 'kayit'
        ? 'Hesap oluşturun'
        : mod === 'sifirla'
          ? 'Şifremi unuttum'
          : 'Giriş yapın';

  return (
    <>
      <div className={`perde${acik ? ' acik' : ''}`} onClick={kapat} />

      <div
        className={`sayfa hesap-sayfa${acik ? ' acik' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hesap-baslik"
      >
        <span className="sayfa-tutamak" aria-hidden="true" />
        <button className="sayfa-kapat" aria-label="Kapat" onClick={kapat} ref={kapatRef}>
          &times;
        </button>

        <div className="sayfa-govde">
          <h3 className="sayfa-ad" id="hesap-baslik">
            {baslik}
          </h3>

          {hata ? (
            <p className="alan-not alan-uyari" role="alert">
              {hata}
            </p>
          ) : null}
          {bilgi ? <p className="alan-not alan-bilgi">{bilgi}</p> : null}

          {/* ================= SMS ================= */}
          {yontem === 'sms' ? (
            adim === 'telefon' ? (
              <>
                <p className="sayfa-aciklama">
                  Numaranıza 6 haneli bir kod göndereceğiz. Şifre yok, ezber yok —
                  hesabınız yoksa kendiliğinden açılır.
                </p>

                <form onSubmit={kodGonder}>
                  <input
                    className="alan"
                    type="text"
                    placeholder="Adınız (isteğe bağlı)"
                    aria-label="Ad"
                    maxLength={60}
                    value={ad}
                    onChange={(e) => setAd(e.target.value)}
                    autoComplete="name"
                  />
                  <input
                    className="alan tel-alan"
                    type="tel"
                    inputMode="tel"
                    placeholder="05xx xxx xx xx"
                    aria-label="Cep telefonu"
                    value={telefon}
                    onChange={(e) => setTelefon(e.target.value)}
                    required
                    autoComplete="tel"
                  />
                  <button type="submit" className="ana-dugme" disabled={bekliyor}>
                    {bekliyor ? 'Gönderiliyor…' : 'Kodu gönder'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="sayfa-aciklama">
                  <b>{telefonYaz(gonderilenNo)}</b> numarasına gelen 6 haneli kodu yazın.
                </p>

                <form onSubmit={kodOnayla}>
                  <input
                    className="alan kod-hane"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="••••••"
                    aria-label="Doğrulama kodu"
                    value={kod}
                    onChange={(e) => kodDegisti(e.target.value)}
                    ref={kodRef}
                    required
                  />
                  <button
                    id="kod-onay"
                    type="submit"
                    className="ana-dugme"
                    disabled={bekliyor || kod.length !== 6}
                  >
                    {bekliyor ? 'Kontrol ediliyor…' : 'Doğrula ve giriş yap'}
                  </button>
                </form>

                <div className="hesap-baglantilar">
                  {sayac > 0 ? (
                    <span className="sayac-metin">
                      Kod gelmediyse {sayac} saniye içinde yeniden isteyebilirsiniz
                    </span>
                  ) : (
                    <button type="button" onClick={kodGonder} disabled={bekliyor}>
                      Kodu yeniden gönder
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAdim('telefon');
                      temizle();
                    }}
                  >
                    Numarayı değiştir
                  </button>
                </div>
              </>
            )
          ) : (
            /* ================= E-POSTA ================= */
            <>
              <p className="sayfa-aciklama">
                {mod === 'kayit'
                  ? 'Hesap açmak zorunlu değil — misafir olarak da sipariş verebilirsiniz.'
                  : mod === 'sifirla'
                    ? 'Kayıtlı e-posta adresinizi yazın, sıfırlama bağlantısı gönderelim.'
                    : 'Siparişleriniz ve hediye kartlarınız hesabınızda saklanır.'}
              </p>

              <form onSubmit={epostaGonder}>
                {mod === 'kayit' ? (
                  <input
                    className="alan"
                    type="text"
                    placeholder="Adınız"
                    aria-label="Ad"
                    maxLength={60}
                    value={ad}
                    onChange={(e) => setAd(e.target.value)}
                    autoComplete="name"
                  />
                ) : null}

                <input
                  className="alan"
                  type="email"
                  placeholder="E-posta"
                  aria-label="E-posta"
                  value={eposta}
                  onChange={(e) => setEposta(e.target.value)}
                  required
                  autoComplete="email"
                />

                {mod !== 'sifirla' ? (
                  <input
                    className="alan"
                    type="password"
                    placeholder={mod === 'kayit' ? 'Şifre (en az 8 karakter)' : 'Şifre'}
                    aria-label="Şifre"
                    value={sifre}
                    onChange={(e) => setSifre(e.target.value)}
                    required
                    minLength={8}
                    autoComplete={mod === 'kayit' ? 'new-password' : 'current-password'}
                  />
                ) : null}

                <button type="submit" className="ana-dugme" disabled={bekliyor}>
                  {bekliyor
                    ? 'Lütfen bekleyin…'
                    : mod === 'giris'
                      ? 'Giriş yap'
                      : mod === 'kayit'
                        ? 'Hesap oluştur'
                        : 'Bağlantı gönder'}
                </button>
              </form>

              <div className="hesap-baglantilar">
                {mod === 'giris' ? (
                  <>
                    <button type="button" onClick={() => { setMod('kayit'); temizle(); }}>
                      Hesabım yok, oluşturayım
                    </button>
                    <button type="button" onClick={() => { setMod('sifirla'); temizle(); }}>
                      Şifremi unuttum
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setMod('giris'); temizle(); }}>
                    Zaten hesabım var
                  </button>
                )}
              </div>
            </>
          )}

          {/* ---------- Yontem degistirme ---------- */}
          <button
            type="button"
            className="yontem-degistir"
            onClick={() => {
              setYontem(yontem === 'sms' ? 'eposta' : 'sms');
              setAdim('telefon');
              temizle();
            }}
          >
            {yontem === 'sms' ? 'E-posta ile devam et' : 'SMS ile devam et'}
          </button>

          <p className="alan-not alan-kucuk" style={{ textAlign: 'center' }}>
            Üye olmadan da sipariş verebilirsiniz.
          </p>
        </div>
      </div>
    </>
  );
}
