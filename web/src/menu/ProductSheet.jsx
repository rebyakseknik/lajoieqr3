import { useEffect, useMemo, useRef, useState } from 'react';
import { para } from '../lib/bicim';
import { gorselAdresi } from '../lib/supabase';
import { sepeteEkle } from '../lib/sepet';

export default function ProductSheet({ urun, simge, siparisAcik, gruplar = [], onKapat }) {
  const [acik, setAcik] = useState(false);
  const [kaydirma, setKaydirma] = useState(0);
  const [adet, setAdet] = useState(1);
  const [eklendi, setEklendi] = useState(false);
  const [secimler, setSecimler] = useState({}); // grupId -> [secenekId]
  const [uyari, setUyari] = useState('');

  const kapatRef = useRef(null);
  const govdeRef = useRef(null);
  const basY = useRef(null);

  /* Zorunlu tek secimli gruplarda ilk secenek hazir gelsin;
     musteri hicbir sey yapmadan da ekleyebilsin. */
  useEffect(() => {
    const ilk = {};
    gruplar.forEach((g) => {
      if (g.min_select >= 1 && g.max_select === 1) {
        const uygun = (g.options || []).find((o) => !o.sold_out);
        if (uygun) ilk[g.id] = [uygun.id];
      }
    });
    setSecimler(ilk);
  }, [gruplar]);

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
      if (e.key === 'Escape') kapat();
    }
    document.addEventListener('keydown', tus);
    return () => document.removeEventListener('keydown', tus);
  });

  function kapat() {
    setAcik(false);
    setTimeout(onKapat, 260);
  }

  function dokunusBasladi(e) {
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

  /* ---------- Secim ---------- */

  function sec(grup, secenek) {
    setUyari('');
    const mevcut = secimler[grup.id] || [];
    const secili = mevcut.includes(secenek.id);

    if (grup.max_select === 1) {
      // Tek secimli: zorunluysa secimi kaldiramaz, degistirir.
      if (secili && grup.min_select >= 1) return;
      setSecimler({ ...secimler, [grup.id]: secili ? [] : [secenek.id] });
      return;
    }

    if (secili) {
      setSecimler({ ...secimler, [grup.id]: mevcut.filter((x) => x !== secenek.id) });
      return;
    }
    if (mevcut.length >= grup.max_select) {
      setUyari(`${grup.name} için en fazla ${grup.max_select} seçim yapabilirsiniz`);
      return;
    }
    setSecimler({ ...secimler, [grup.id]: [...mevcut, secenek.id] });
  }

  /* ---------- Fiyat (gosterim) ----------
     Gercek fiyat siparis aninda veritabaninda yeniden hesaplanir;
     buradaki yalnizca musteriye anlik geri bildirim icin. */
  const { birim, secilenler } = useMemo(() => {
    let temel = Number(urun.price) || 0;
    let ekleme = 0;
    const adlar = [];

    gruplar.forEach((g) => {
      (secimler[g.id] || []).forEach((sid) => {
        const o = (g.options || []).find((x) => x.id === sid);
        if (!o) return;
        adlar.push(o.name);
        if (g.price_mode === 'absolute') temel = Number(o.price) || 0;
        else ekleme += Number(o.price) || 0;
      });
    });

    return { birim: temel + ekleme, secilenler: adlar };
  }, [urun.price, gruplar, secimler]);

  const eksikGrup = gruplar.find(
    (g) => g.min_select >= 1 && (secimler[g.id] || []).length < g.min_select
  );

  function ekle() {
    if (eksikGrup) {
      setUyari(`${eksikGrup.name} için seçim yapmalısınız`);
      return;
    }
    const tumSecimler = gruplar.flatMap((g) => secimler[g.id] || []);
    sepeteEkle({ ...urun, secimAdlari: secilenler }, adet, tumSecimler, birim);
    setEklendi(true);
    setTimeout(kapat, 420);
  }

  const gorsel = gorselAdresi(urun.image_path);

  return (
    <>
      <div className={`perde${acik ? ' acik' : ''}`} onClick={kapat} />

      <div
        className={`sayfa${acik ? ' acik' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="urun-baslik"
        style={kaydirma ? { transform: `translateY(${kaydirma}px)` } : undefined}
        onTouchStart={dokunusBasladi}
        onTouchMove={dokunusSuruyor}
        onTouchEnd={dokunusBitti}
      >
        <span className="sayfa-tutamak" aria-hidden="true" />
        <button className="sayfa-kapat" aria-label="Kapat" onClick={kapat} ref={kapatRef}>
          &times;
        </button>

        <div className="sayfa-govde" ref={govdeRef}>
          {gorsel ? <img className="sayfa-gorsel" src={gorsel} alt="" /> : null}

          <h3 className="sayfa-ad" id="urun-baslik">
            {urun.name}
          </h3>
          {urun.description ? <p className="sayfa-aciklama">{urun.description}</p> : null}

          <p className="sayfa-fiyat">{para(birim, simge)}</p>
          {urun.sold_out ? <p className="sayfa-rozet">Bugün yok</p> : null}

          {/* ---------- Seçenek grupları ---------- */}
          {siparisAcik && !urun.sold_out
            ? gruplar.map((g) => {
                const mevcut = secimler[g.id] || [];
                return (
                  <section key={g.id} className="grup">
                    <p className="grup-baslik">
                      {g.name}
                      <span className="grup-kural">
                        {g.min_select >= 1
                          ? g.max_select === 1
                            ? 'zorunlu'
                            : `en az ${g.min_select}`
                          : g.max_select > 1
                            ? `en fazla ${g.max_select}`
                            : 'isteğe bağlı'}
                      </span>
                    </p>

                    <ul className="secenek-liste">
                      {(g.options || []).map((o) => {
                        const secili = mevcut.includes(o.id);
                        return (
                          <li key={o.id}>
                            <button
                              type="button"
                              className={`secenek${secili ? ' etkin' : ''}${
                                o.sold_out ? ' pasif' : ''
                              }`}
                              disabled={o.sold_out}
                              onClick={() => sec(g, o)}
                            >
                              <span
                                className={`secenek-kutu${g.max_select === 1 ? ' yuvarlak' : ''}`}
                                aria-hidden="true"
                              >
                                {secili ? '✓' : ''}
                              </span>
                              <span className="secenek-ad">
                                {o.name}
                                {o.sold_out ? <small> · bugün yok</small> : null}
                              </span>
                              <span className="secenek-fiyat">
                                {g.price_mode === 'absolute'
                                  ? para(o.price, simge)
                                  : Number(o.price) > 0
                                    ? `+${para(o.price, simge)}`
                                    : ''}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            : null}

          {uyari ? <p className="alan-not alan-uyari">{uyari}</p> : null}

          {siparisAcik && !urun.sold_out && urun.orderable !== false ? (
            <div className="ekle-kutu">
              <div className="adet-kutu adet-buyuk">
                <button
                  type="button"
                  aria-label="Adedi azalt"
                  onClick={() => setAdet(Math.max(1, adet - 1))}
                >
                  −
                </button>
                <span aria-live="polite">{adet}</span>
                <button
                  type="button"
                  aria-label="Adedi artır"
                  onClick={() => setAdet(Math.min(20, adet + 1))}
                >
                  +
                </button>
              </div>

              <button type="button" className="ana-dugme" onClick={ekle}>
                {eklendi ? 'Sepete eklendi ✓' : `Sepete ekle · ${para(birim * adet, simge)}`}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
