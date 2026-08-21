import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { para } from '../lib/bicim';
import {
  adetDegistir,
  sepettenCikar,
  sepetiBosalt,
  sonSiparisiKaydet,
  useSepet,
} from '../lib/sepet';
import { hataMetni, saat, siparisVer, slotlariGetir } from '../lib/siparis';
import { indirimOnizle, kuponlarimGetir, useKullanici } from '../lib/hesap';
import AuthSheet from './AuthSheet';

export default function CartSheet({ simge, ayarlar, onKapat, onGirisIste }) {
  const { satirlar, tutar, adet, bos } = useSepet();
  const git = useNavigate();

  const [acik, setAcik] = useState(false);
  const [kaydirma, setKaydirma] = useState(0);
  const [slotlar, setSlotlar] = useState(null);
  const [teslim, setTeslim] = useState('');
  const [mod, setMod] = useState('dinein');
  const [ad, setAd] = useState('');
  const [telefon, setTelefon] = useState('');
  const [not, setNot] = useState('');
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState(null);

  // Kupon ve hediye kartı TEK listede durur; hangisi olduğunu veritabanı söyler.
  const [kodlar, setKodlar] = useState([]);
  const [kodGirdi, setKodGirdi] = useState('');
  const [indirim, setIndirim] = useState(null);
  const [kodAcik, setKodAcik] = useState(false);
  const [kodBekliyor, setKodBekliyor] = useState(false);
  const [kodHatasi, setKodHatasi] = useState('');
  const [kuponlarim, setKuponlarim] = useState([]);

  const { girisli, profil } = useKullanici();
  const [girisAcik, setGirisAcik] = useState(false);

  const girisZorunlu = ayarlar?.preorder_require_login === '1';
  const onlineAcik = ayarlar?.payment_online_enabled === '1';
  const nakitAcik = ayarlar?.payment_cash_enabled !== '0';

  // Tek seçenek varsa onu kullan; ikisi de açıksa müşteri seçsin.
  const [odeme, setOdeme] = useState(onlineAcik && !nakitAcik ? 'online' : 'cash');

  const sayfaRef = useRef(null);
  const govdeRef = useRef(null);
  const kapatRef = useRef(null);
  const profilYuklendi = useRef(false);
  const basY = useRef(null);

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
      if (e.key === 'Escape' && !gonderiliyor) kapat();
    }
    document.addEventListener('keydown', tus);
    return () => document.removeEventListener('keydown', tus);
  });

  /* Musait saatleri getir; ilk bos olani secili yap. */
  useEffect(() => {
    let iptal = false;
    slotlariGetir()
      .then((veri) => {
        if (iptal) return;
        setSlotlar(veri);
        const ilk = veri.find((s) => s.musait);
        if (ilk) setTeslim(ilk.slot);
      })
      .catch(() => !iptal && setSlotlar([]));
    return () => {
      iptal = true;
    };
  }, []);

  /* Uye girisliyse ad ve telefonu bir kez kendiliginden doldur. */
  useEffect(() => {
    if (profilYuklendi.current || !profil) return;
    profilYuklendi.current = true;
    if (profil.name && !ad) setAd(profil.name);
    if (profil.phone && !telefon) setTelefon(profil.phone);
  }, [profil, ad, telefon]);

  /* Kod listesi ya da tutar degisince indirimi veritabanina hesaplat. */
  useEffect(() => {
    if (!kodlar.length) {
      setIndirim(null);
      return undefined;
    }
    if (bos) return undefined;

    setKodBekliyor(true);
    let iptal = false;

    indirimOnizle({ tutar, kodlar })
      .then((veri) => {
        if (iptal) return;
        setIndirim(veri);
        // Gecersiz kodlari listeden dusur, sebebini soyle.
        const kotu = (veri.kodlar || []).filter((k) => !k.ok);
        if (kotu.length) {
          setKodHatasi(kotu[0].mesaj || 'Kod kullanilamadi');
          setKodlar((onceki) =>
            onceki.filter((k) => !kotu.some((x) => x.kod.toUpperCase() === k.toUpperCase()))
          );
        }
      })
      .catch(() => !iptal && setIndirim(null))
      .finally(() => !iptal && setKodBekliyor(false));

    return () => {
      iptal = true;
    };
  }, [kodlar, tutar, bos]);

  /* Hesaptaki kuponlar: sepet tutarina gore kullanilabilirligi degisir. */
  useEffect(() => {
    if (!girisli || bos) return undefined;
    let iptal = false;
    kuponlarimGetir(tutar)
      .then((v) => !iptal && setKuponlarim(v))
      .catch(() => {});
    return () => {
      iptal = true;
    };
  }, [girisli, tutar, bos]);

  function kapat() {
    if (gonderiliyor) return;
    setAcik(false);
    setTimeout(onKapat, 260);
  }

  /* --- Telefonda asagi surukleyerek kapatma (urun sayfasiyla ayni his) --- */

  function dokunusBasladi(e) {
    // Kaydirma ic govdede olur; sadece o tepedeyken surukleme kapatir.
    basY.current = (govdeRef.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null;
  }

  function dokunusSuruyor(e) {
    if (basY.current === null) return;
    const fark = e.touches[0].clientY - basY.current;
    if (fark > 0) setKaydirma(fark);
  }

  function dokunusBitti(e) {
    if (basY.current === null) return;
    const fark = (e.changedTouches[0]?.clientY ?? basY.current) - basY.current;
    setKaydirma(0);
    basY.current = null;
    if (fark > 90) kapat();
  }

  async function gonder() {
    if (bos || !teslim || gonderiliyor) return;
    setGonderiliyor(true);
    setHata(null);

    try {
      const siparis = await siparisVer({
        satirlar, teslim, mod, ad, telefon, not,
        kodlar,
        odeme,
      });
      sepetiBosalt();
      sonSiparisiKaydet(siparis.code);
      // Online odeme: once kart ekrani; odeme dusunce takip ekranina gecer.
      if (siparis.status === 'awaiting_payment') {
        git(`/odeme/${siparis.code}`, { replace: true });
      } else {
        git(`/siparis/${siparis.code}`, { replace: true });
      }
    } catch (e) {
      setHata(hataMetni(e));
      setGonderiliyor(false);
      // Saat dolmus olabilir; listeyi tazele.
      slotlariGetir().then(setSlotlar).catch(() => {});
    }
  }

  const musait = (slotlar || []).filter((s) => s.musait);
  const kapali = slotlar !== null && slotlar.length === 0;
  const hazir = !bos && teslim && musait.length > 0 && !gonderiliyor;

  const inen  = Number(indirim?.indirim || 0);
  const kart  = Number(indirim?.hediye || 0);
  const odenecek = indirim ? Number(indirim.odenecek) : tutar;

  // Uygulanan kodlarin dokumu (tur bilgisi veritabanindan gelir)
  const uygulanan = (indirim?.kodlar || []).filter((k) => k.ok);

  function kodEkle(deger) {
    const temiz = (deger || '').trim().toUpperCase();
    setKodHatasi('');
    if (!temiz) return;
    if (kodlar.some((k) => k.toUpperCase() === temiz)) {
      setKodHatasi('Bu kod zaten ekli');
      return;
    }
    setKodlar([...kodlar, temiz]);
    setKodGirdi('');
  }

  function kodCikar(kod) {
    setKodHatasi('');
    setKodlar(kodlar.filter((k) => k.toUpperCase() !== kod.toUpperCase()));
  }

  return (
    <>
      <div className={`perde${acik ? ' acik' : ''}`} onClick={kapat} />

      <div
        className={`sayfa sepet-sayfa${acik ? ' acik' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sepet-baslik"
        ref={sayfaRef}
        style={kaydirma ? { transform: `translateY(${kaydirma}px)` } : undefined}
        onTouchStart={dokunusBasladi}
        onTouchMove={dokunusSuruyor}
        onTouchEnd={dokunusBitti}
      >
        <span className="sayfa-tutamak" aria-hidden="true" />
        <button className="sayfa-kapat" aria-label="Kapat" onClick={kapat} ref={kapatRef}>
          &times;
        </button>

        <div className="sayfa-govde sepet-govde" ref={govdeRef}>
          <h3 className="sayfa-ad" id="sepet-baslik">
            Ön siparişiniz
          </h3>

          {bos ? (
            <>
              <p className="sayfa-aciklama">
                Sepetiniz boş. Menüden bir ürüne dokunup “Sepete ekle” demeniz yeterli.
              </p>
              <button type="button" className="ana-dugme dugme-ince" onClick={kapat}>
                Menüye dön
              </button>
            </>
          ) : (
            <>
              {/* ---------- 1 · Urunler ---------- */}
              <p className="alan-baslik">
                <span className="adim-no">1</span> Sepetiniz
              </p>
              <ul className="sepet-liste">
                {satirlar.map((s) => (
                  <li key={s.id} className="sepet-satir">
                    <div className="sepet-satir-ad">
                      <span>{s.ad}</span>
                      <small>{para(s.fiyat, simge)}</small>
                    </div>

                    <div className="adet-kutu">
                      <button
                        type="button"
                        aria-label={`${s.ad} adedini azalt`}
                        onClick={() => adetDegistir(s.id, s.adet - 1)}
                      >
                        −
                      </button>
                      <span aria-live="polite">{s.adet}</span>
                      <button
                        type="button"
                        aria-label={`${s.ad} adedini artır`}
                        onClick={() => adetDegistir(s.id, s.adet + 1)}
                      >
                        +
                      </button>
                    </div>

                    <span className="sepet-satir-tutar">{para(s.fiyat * s.adet, simge)}</span>

                    <button
                      type="button"
                      className="sepet-sil"
                      aria-label={`${s.ad} ürününü çıkar`}
                      onClick={() => sepettenCikar(s.id)}
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>

              {/* ---------- 2 · Nasil? ---------- */}
              <p className="alan-baslik">
                <span className="adim-no">2</span> Siparişinizi nasıl alacaksınız?
              </p>
              <div className="secim-ikili">
                <button
                  type="button"
                  className={mod === 'dinein' ? 'etkin' : ''}
                  onClick={() => setMod('dinein')}
                >
                  <b>Oturup yiyeceğim</b>
                  <small>Masada servis edilir</small>
                </button>
                <button
                  type="button"
                  className={mod === 'pickup' ? 'etkin' : ''}
                  onClick={() => setMod('pickup')}
                >
                  <b>Paket alacağım</b>
                  <small>Kasadan teslim</small>
                </button>
              </div>

              {/* ---------- 3 · Kacta? ---------- */}
              <p className="alan-baslik">
                <span className="adim-no">3</span> Kaçta hazır olsun?
              </p>

              {slotlar === null ? (
                <div className="slot-izgara" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="slot slot-iskelet" />
                  ))}
                </div>
              ) : kapali ? (
                <p className="alan-not alan-uyari">
                  Bugün ön sipariş saatleri doldu ya da kapandı. Menüden bakıp yerinde
                  sipariş verebilirsiniz.
                </p>
              ) : !musait.length ? (
                <p className="alan-not alan-uyari">
                  Kalan saatlerin hepsi dolu. Biraz sonra tekrar deneyin.
                </p>
              ) : (
                <div className="slot-izgara">
                  {slotlar.map((s) => (
                    <button
                      key={s.slot}
                      type="button"
                      disabled={!s.musait}
                      className={`slot${teslim === s.slot ? ' etkin' : ''}${
                        s.musait ? '' : ' dolu'
                      }`}
                      onClick={() => setTeslim(s.slot)}
                    >
                      {saat(s.slot)}
                      {s.musait ? null : <small>dolu</small>}
                    </button>
                  ))}
                </div>
              )}

              {/* ---------- 4 · Kim? ---------- */}
              <p className="alan-baslik">
                <span className="adim-no">4</span> Sizi tanıyalım{' '}
                <em className="istege">isteğe bağlı</em>
              </p>

              <input
                className="alan"
                type="text"
                maxLength={60}
                placeholder="İsminiz — sipariş adınıza anons edilsin"
                aria-label="İsim"
                value={ad}
                onChange={(e) => setAd(e.target.value)}
              />
              <input
                className="alan"
                type="tel"
                inputMode="tel"
                maxLength={24}
                placeholder="Telefonunuz — sorun olursa ulaşalım"
                aria-label="Telefon"
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
              />
              <textarea
                className="alan"
                rows={2}
                maxLength={300}
                placeholder="Notunuz — acısız olsun, soğan olmasın…"
                aria-label="Sipariş notu"
                value={not}
                onChange={(e) => setNot(e.target.value)}
              />

              {/* ---------- 5 · Kupon ve hediye kartı (tek yer) ---------- */}
              <p className="alan-baslik">
                <span className="adim-no">5</span> İndirim{' '}
                <em className="istege">isteğe bağlı</em>
              </p>

              {/* Hesaba tanımlı kuponlar */}
              {kuponlarim.length ? (
                <ul className="kupon-secim">
                  {kuponlarim.map((k) => {
                    const secili = kodlar.some((x) => x.toUpperCase() === k.code.toUpperCase());
                    return (
                      <li key={k.code}>
                        <button
                          type="button"
                          className={`kupon-kart${secili ? ' etkin' : ''}${
                            k.kullanilabilir ? '' : ' pasif'
                          }`}
                          disabled={!k.kullanilabilir && !secili}
                          onClick={() => (secili ? kodCikar(k.code) : kodEkle(k.code))}
                        >
                          <span className="kupon-deger">
                            {k.kind === 'percent'
                              ? `%${Number(k.value)}`
                              : para(k.value, simge)}
                          </span>
                          <span className="kupon-metin">
                            <b>{k.note || 'İndirim kuponu'}</b>
                            <small>
                              {k.kullanilabilir
                                ? `−${para(k.indirim, simge)}`
                                : `En az ${para(k.min_total, simge)} sipariş gerekli`}
                              {k.ends_at
                                ? ` · ${new Date(k.ends_at).toLocaleDateString('tr-TR', {
                                    day: 'numeric',
                                    month: 'short',
                                  })} son gün`
                                : ''}
                            </small>
                          </span>
                          <span className="kupon-tik" aria-hidden="true">
                            {secili ? '✓' : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {/* Uygulanan kodlar */}
              {uygulanan.length ? (
                <ul className="kod-rozetler">
                  {uygulanan.map((k) => (
                    <li key={k.kod} className="kod-rozet">
                      <span className="kod-rozet-ad">
                        {k.tur === 'hediye' ? 'Hediye kartı' : 'Kupon'} · {k.kod}
                      </span>
                      <b>−{para(k.tutar, simge)}</b>
                      <button
                        type="button"
                        aria-label={`${k.kod} kodunu çıkar`}
                        onClick={() => kodCikar(k.kod)}
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Tek giriş alanı */}
              {kodAcik || uygulanan.length ? (
                <>
                  <div className="kod-giris">
                    <input
                      className="alan kod-alan"
                      type="text"
                      placeholder="Kupon ya da hediye kartı kodu"
                      aria-label="Kupon ya da hediye kartı kodu"
                      maxLength={24}
                      value={kodGirdi}
                      onChange={(e) => setKodGirdi(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          kodEkle(kodGirdi);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="kod-uygula"
                      disabled={!kodGirdi.trim() || kodBekliyor}
                      onClick={() => kodEkle(kodGirdi)}
                    >
                      Uygula
                    </button>
                  </div>
                  {kodBekliyor ? (
                    <p className="alan-not alan-kucuk">Kontrol ediliyor…</p>
                  ) : null}
                  {kodHatasi ? <p className="kod-sonuc yok">{kodHatasi}</p> : null}
                </>
              ) : (
                <button type="button" className="kod-ac" onClick={() => setKodAcik(true)}>
                  Kupon ya da hediye kartı kodum var
                </button>
              )}

              {/* ---------- 6 · Ödeme ---------- */}
              {onlineAcik && nakitAcik ? (
                <>
                  <p className="alan-baslik">
                    <span className="adim-no">6</span> Nasıl ödeyeceksiniz?
                  </p>
                  <div className="secim-ikili">
                    <button
                      type="button"
                      className={odeme === 'cash' ? 'etkin' : ''}
                      onClick={() => setOdeme('cash')}
                    >
                      <b>Kasada</b>
                      <small>Gelince nakit ya da kart</small>
                    </button>
                    <button
                      type="button"
                      className={odeme === 'online' ? 'etkin' : ''}
                      onClick={() => setOdeme('online')}
                    >
                      <b>Şimdi online</b>
                      <small>Kartla, beklemeden al</small>
                    </button>
                  </div>

                  {odeme === 'online' ? (
                    <p className="alan-not">
                      {odenecek <= 0
                        ? 'Ödenecek tutar kalmadı; ödeme adımı atlanacak.'
                        : 'Siparişi bıraktıktan sonra kart ekranı açılacak. Ödeme tamamlanana kadar sipariş mutfağa düşmez.'}
                    </p>
                  ) : null}
                </>
              ) : null}

              {/* ---------- Üyelik daveti ---------- */}
              {!girisli && !girisZorunlu ? (
                <p className="uye-davet">
                  <span>Siparişleriniz hesabınızda saklansın mı?</span>
                  <button type="button" onClick={() => onGirisIste?.()}>
                    Giriş yap / üye ol
                  </button>
                </p>
              ) : null}

              {!girisli && girisZorunlu ? (
                <p className="alan-not">
                  Güvenlik için ön sipariş yalnızca üye girişiyle verilir. Telefonunuza
                  gelen tek kodla saniyeler içinde girersiniz; şifre yok.
                </p>
              ) : null}

              {hata ? (
                <p className="alan-not alan-uyari" role="alert">
                  {hata}
                </p>
              ) : null}

              {ayarlar?.preorder_note ? (
                <p className="alan-not">{ayarlar.preorder_note}</p>
              ) : null}
            </>
          )}
        </div>

        {/* ---------- Yapiskan alt: toplam + gonder ---------- */}
        {/* (giris penceresi asagida, sepetin ustune acilir) */}
        {bos ? null : (
          <div className="sepet-alt">
            {inen > 0 || kart > 0 ? (
              <div className="sepet-alt-dokum">
                <span>
                  Ara toplam <b>{para(tutar, simge)}</b>
                </span>
                {inen > 0 ? (
                  <span className="dusen">
                    Kupon <b>−{para(inen, simge)}</b>
                  </span>
                ) : null}
                {kart > 0 ? (
                  <span className="dusen">
                    Hediye kartı <b>−{para(kart, simge)}</b>
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="sepet-alt-ozet">
              <span>
                {adet} ürün{teslim && musait.length ? ` · ${saat(teslim)}` : ''}
              </span>
              <strong>{para(odenecek, simge)}</strong>
            </div>
            {girisZorunlu && !girisli ? (
              <button
                type="button"
                className="ana-dugme"
                disabled={bos}
                onClick={() => setGirisAcik(true)}
              >
                Giriş yap ve siparişi tamamla
              </button>
            ) : (
              <button type="button" className="ana-dugme" disabled={!hazir} onClick={gonder}>
                {gonderiliyor
                  ? 'Gönderiliyor…'
                  : odeme === 'online' && odenecek > 0
                    ? 'Devam et ve öde'
                    : 'Siparişi bırak'}
              </button>
            )}
          </div>
        )}
      </div>

      {girisAcik ? (
        <AuthSheet ayarlar={ayarlar} onKapat={() => setGirisAcik(false)} />
      ) : null}
    </>
  );
}
