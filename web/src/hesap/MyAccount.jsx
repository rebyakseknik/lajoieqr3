import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { para } from '../lib/bicim';
import { useAyarlar } from '../lib/kancalar';
import { DURUM, saat } from '../lib/siparis';
import { supabase } from '../lib/supabase';
import { sepeteEkle } from '../lib/sepet';
import {
  cikisYap,
  hesapHatasi,
  hesapOzetGetir,
  kartEkle,
  kartlarimGetir,
  kuponlarimGetir,
  profilKaydet,
  siparislerimGetir,
  telefonYaz,
  useKullanici,
} from '../lib/hesap';
import AuthSheet from '../menu/AuthSheet';
import '../styles/menu.css';

function tarihYaz(t) {
  if (!t) return '';
  return new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function MyAccount() {
  const { ayarlar } = useAyarlar();
  const { kullanici, profil, yukleniyor, girisli } = useKullanici();
  const git = useNavigate();

  const [siparisler, setSiparisler] = useState([]);
  const [kartlar, setKartlar] = useState([]);
  const [kuponlar, setKuponlar] = useState([]);
  const [ozet, setOzet] = useState(null);

  const [ad, setAd] = useState('');
  const [telefon, setTelefon] = useState('');
  const [kartKodu, setKartKodu] = useState('');
  const [bilgi, setBilgi] = useState('');
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [acikSekme, setAcikSekme] = useState('siparisler'); // siparisler | cuzdan | bilgiler
  const [tekrarlanan, setTekrarlanan] = useState(null);

  const simge = ayarlar.currency || '₺';

  useEffect(() => {
    if (profil) {
      setAd(profil.name || '');
      setTelefon(profil.phone || '');
    }
  }, [profil]);

  const getir = useCallback(async () => {
    if (!girisli) return;
    try {
      const [s, k, o, kp] = await Promise.all([
        siparislerimGetir(20),
        kartlarimGetir(),
        hesapOzetGetir(),
        kuponlarimGetir(0),
      ]);
      setSiparisler(s);
      setKartlar(k);
      setOzet(o);
      setKuponlar(kp);
    } catch {
      /* liste bos kalir, ekran yine calisir */
    }
  }, [girisli]);

  useEffect(() => {
    getir();
  }, [getir]);

  /* ---------- Tekrarla ----------
     Eski siparisin urunlerini GUNCEL fiyat ve stokla sepete koyar.
     Fiyat degistiyse yenisi gecerlidir; kalkan urunler atlanir. */
  async function tekrarla(siparis) {
    setTekrarlanan(siparis.code);
    setHata('');

    const istenen = (siparis.items || []).filter((u) => u.product_id);
    const idler = istenen.map((u) => u.product_id);

    const { data: urunler, error } = await supabase
      .from('products')
      .select('id, name, price, active, orderable, sold_out')
      .in('id', idler);

    if (error) {
      setHata('Ürünler getirilemedi, tekrar deneyin.');
      setTekrarlanan(null);
      return;
    }

    let eklenen = 0;
    const atlanan = [];

    istenen.forEach((u) => {
      const p = (urunler || []).find((x) => x.id === u.product_id);
      if (p && p.active && p.orderable !== false && !p.sold_out) {
        sepeteEkle(p, u.qty);
        eklenen += 1;
      } else {
        atlanan.push(u.name);
      }
    });

    setTekrarlanan(null);

    if (!eklenen) {
      setHata('Bu siparişteki ürünler artık menüde yok.');
      return;
    }

    // Sepet dolu halde menuye don; atlanan varsa orada soyleyecek bir sey yok,
    // burada soyleyip gidiyoruz.
    if (atlanan.length) {
      window.alert(`Şunlar bugün eklenemedi: ${atlanan.join(', ')}`);
    }
    git('/', { state: { sepetiAc: true } });
  }

  async function profilGuncelle(e) {
    e.preventDefault();
    setBekliyor(true);
    setBilgi('');
    setHata('');
    try {
      await profilKaydet({ ad, telefon });
      setBilgi('Bilgileriniz kaydedildi.');
    } catch (e2) {
      setHata(hesapHatasi(e2));
    }
    setBekliyor(false);
  }

  async function kartiEkle(e) {
    e.preventDefault();
    setBilgi('');
    setHata('');
    try {
      const sonuc = await kartEkle(kartKodu);
      setBilgi(`Kart eklendi. Bakiye: ${para(sonuc.bakiye, simge)}`);
      setKartKodu('');
      getir();
    } catch (e2) {
      setHata(e2?.message || 'Kart eklenemedi.');
    }
  }

  if (yukleniyor) {
    return (
      <main className="bos">
        <p className="bos-alt">Yükleniyor…</p>
      </main>
    );
  }

  if (!girisli) {
    return (
      <>
        <main className="bos">
          <p className="bos-baslik">Hesabınıza girin</p>
          <p className="bos-alt">Geçmiş siparişleriniz ve hediye kartlarınız burada durur.</p>
        </main>
        <AuthSheet ayarlar={ayarlar} onKapat={() => git('/')} />
      </>
    );
  }

  const gorunenAd = profil?.name || '';
  const iletisim = kullanici.email || telefonYaz(kullanici.phone) || '';
  const basHarf = (gorunenAd || iletisim || '?').trim().charAt(0).toUpperCase();
  const aktifKartlar = kartlar.filter((k) => k.active && Number(k.balance) > 0);
  const toplamBakiye = aktifKartlar.reduce((t, k) => t + Number(k.balance), 0);

  const SEKMELER = [
    { id: 'siparisler', ad: 'Siparişlerim' },
    { id: 'cuzdan', ad: 'Cüzdanım' },
    { id: 'bilgiler', ad: 'Bilgilerim' },
  ];

  return (
    <main className="takip hesap">
      {/* ---------- Kapak ---------- */}
      <section className="hesap-kapak">
        <div className="hesap-kapak-ust">
          <span className="hesap-avatar" aria-hidden="true">
            {basHarf}
          </span>
          <div className="hesap-kapak-metin">
            <h1 className="hesap-kapak-ad">{gorunenAd || 'Hoş geldiniz'}</h1>
            <p className="hesap-kapak-alt">{iletisim}</p>
          </div>
          <button
            type="button"
            className="hesap-cikis-acik"
            onClick={async () => {
              await cikisYap();
              git('/');
            }}
          >
            Çıkış
          </button>
        </div>

        <dl className="hesap-sayilar">
          <div>
            <dt>Sipariş</dt>
            <dd>{ozet ? Number(ozet.siparis) : '–'}</dd>
          </div>
          <div>
            <dt>Toplam</dt>
            <dd>{ozet ? para(ozet.harcama, simge) : '–'}</dd>
          </div>
          <div>
            <dt>Kart bakiyesi</dt>
            <dd>{para(toplamBakiye, simge)}</dd>
          </div>
        </dl>

        {ozet?.uyelik ? (
          <p className="hesap-uyelik">{tarihYaz(ozet.uyelik)} tarihinden beri üye</p>
        ) : null}
      </section>

      {bilgi ? <p className="alan-not alan-bilgi">{bilgi}</p> : null}
      {hata ? <p className="alan-not alan-uyari">{hata}</p> : null}

      {/* ---------- Sekmeler ---------- */}
      <nav className="hesap-sekmeler" aria-label="Hesap bölümleri">
        {SEKMELER.map((s) => (
          <button
            key={s.id}
            type="button"
            className={acikSekme === s.id ? 'etkin' : ''}
            onClick={() => setAcikSekme(s.id)}
          >
            {s.ad}
          </button>
        ))}
      </nav>

      {/* ---------- Siparislerim ---------- */}
      {acikSekme === 'siparisler' ? (
        <section className="takip-bolum">
          {!siparisler.length ? (
            <div className="hesap-bos">
              <p>Henüz siparişiniz yok.</p>
              <Link className="ana-dugme dugme-ince" to="/">
                Menüye göz atın
              </Link>
            </div>
          ) : (
            <ul className="gecmis-liste">
              {siparisler.map((s) => {
                const d = DURUM[s.status] || DURUM.new;
                const icerik = (s.items || [])
                  .map((u) => `${u.qty}× ${u.name}`)
                  .join(', ');
                return (
                  <li key={s.code}>
                    <Link to={`/siparis/${s.code}`} className="gecmis-satir">
                      <span className="gecmis-no">{s.table_no}</span>
                      <span className="gecmis-orta">
                        <b>
                          {new Date(s.created_at).toLocaleDateString('tr-TR', {
                            day: 'numeric',
                            month: 'long',
                          })}
                          {' · '}
                          {saat(s.pickup_at)}
                        </b>
                        {icerik ? <span className="gecmis-icerik">{icerik}</span> : null}
                        <small className={`durum-rozet durum-${d.renk}`}>{d.ad}</small>
                      </span>
                      <span className="gecmis-tutar">{para(s.total, simge)}</span>
                    </Link>

                    {s.status !== 'cancelled' ? (
                      <button
                        type="button"
                        className="tekrarla"
                        disabled={tekrarlanan === s.code}
                        onClick={() => tekrarla(s)}
                      >
                        {tekrarlanan === s.code ? 'Ekleniyor…' : 'Aynısını sepete ekle ↻'}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {/* ---------- Cuzdanim ---------- */}
      {acikSekme === 'cuzdan' ? (
        <section className="takip-bolum">
          {/* ---------- Kuponlarım ---------- */}
          <p className="alan-baslik" style={{ marginTop: 0 }}>
            Kuponlarım
          </p>
          {kuponlar.length ? (
            <ul className="kupon-secim durgun">
              {kuponlar.map((k) => (
                <li key={k.code}>
                  <div className="kupon-kart">
                    <span className="kupon-deger">
                      {k.kind === 'percent' ? `%${Number(k.value)}` : para(k.value, simge)}
                    </span>
                    <span className="kupon-metin">
                      <b>{k.note || 'İndirim kuponu'}</b>
                      <small>
                        {Number(k.min_total) > 0
                          ? `En az ${para(k.min_total, simge)} sipariş`
                          : 'Alt limit yok'}
                        {k.ends_at ? ` · ${tarihYaz(k.ends_at)} son gün` : ''}
                      </small>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="alan-not" style={{ marginTop: 0 }}>
              Şu an kuponunuz yok. Kampanyalarımızı kaçırmayın.
            </p>
          )}

          <p className="alan-baslik">Hediye kartlarım</p>
          {aktifKartlar.length ? (
            <div className="cuzdan-kartlar">
              {aktifKartlar.map((k) => (
                <article key={k.code} className="hediye-kart">
                  <p className="hediye-kart-marka">{ayarlar.restaurant_name}</p>
                  <p className="hediye-kart-bakiye">{para(k.balance, simge)}</p>
                  <p className="hediye-kart-kod">{k.code}</p>
                  {k.expires_at ? (
                    <p className="hediye-kart-tarih">Son gün {tarihYaz(k.expires_at)}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <p className="alan-not" style={{ marginTop: 0 }}>
              Henüz kartınız yok. Elinizde bir hediye kartı kodu varsa aşağıdan ekleyin —
              sepette otomatik kullanılabilir hale gelir.
            </p>
          )}

          {kartlar.some((k) => !k.active || Number(k.balance) <= 0) ? (
            <details className="cuzdan-eski">
              <summary>Biten kartlar</summary>
              <ul className="kart-liste">
                {kartlar
                  .filter((k) => !k.active || Number(k.balance) <= 0)
                  .map((k) => (
                    <li key={k.code} className="sonuk">
                      <span className="kart-kod">{k.code}</span>
                      <span className="cizgi" aria-hidden="true" />
                      <span className="kart-bakiye">{para(k.balance, simge)}</span>
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}

          <form onSubmit={kartiEkle} className="kart-ekle-form">
            <input
              className="alan kod-alan"
              type="text"
              placeholder="Hediye kartı kodu"
              aria-label="Hediye kartı kodu"
              value={kartKodu}
              onChange={(e) => setKartKodu(e.target.value.toUpperCase())}
              maxLength={24}
            />
            <button type="submit" className="ana-dugme dugme-ince" disabled={!kartKodu.trim()}>
              Ekle
            </button>
          </form>
        </section>
      ) : null}

      {/* ---------- Bilgilerim ---------- */}
      {acikSekme === 'bilgiler' ? (
        <section className="takip-bolum">
          <form onSubmit={profilGuncelle}>
            <p className="alan-baslik" style={{ marginTop: 0 }}>
              Adınız
            </p>
            <input
              className="alan"
              type="text"
              placeholder="Adınız"
              aria-label="Ad"
              maxLength={60}
              value={ad}
              onChange={(e) => setAd(e.target.value)}
            />
            <p className="alan-baslik">Telefon</p>
            <input
              className="alan"
              type="tel"
              inputMode="tel"
              placeholder="05xx xxx xx xx"
              aria-label="Telefon"
              maxLength={24}
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
            />
            <button type="submit" className="ana-dugme dugme-ince" disabled={bekliyor}>
              {bekliyor ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </form>
          <p className="alan-not alan-kucuk">
            Ad ve telefon yalnızca siparişinizi kolaylaştırmak için kullanılır;
            sepette kendiliğinden dolar.
          </p>
        </section>
      ) : null}

      <Link className="ana-dugme dugme-ince" to="/">
        Menüye dön
      </Link>
    </main>
  );
}
