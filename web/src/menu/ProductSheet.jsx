import { useEffect, useRef, useState } from 'react';
import { para } from '../lib/bicim';
import { gorselAdresi } from '../lib/supabase';
import { sepeteEkle } from '../lib/sepet';

export default function ProductSheet({ urun, simge, siparisAcik, onKapat }) {
  const [acik, setAcik] = useState(false);
  const [kaydirma, setKaydirma] = useState(0);
  const [adet, setAdet] = useState(1);
  const [eklendi, setEklendi] = useState(false);
  const sayfaRef = useRef(null);
  const kapatRef = useRef(null);
  const basY = useRef(null);

  // Açılış animasyonu bir kare sonra başlasın ki geçiş görünsün.
  useEffect(() => {
    const kare = requestAnimationFrame(() => setAcik(true));
    kapatRef.current?.focus();
    document.body.classList.add('kilitli');

    return () => {
      cancelAnimationFrame(kare);
      document.body.classList.remove('kilitli');
    };
  }, []);

  // Escape ile kapansın.
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

  /* --- Telefonda aşağı sürükleyerek kapatma --- */

  function dokunusBasladi(e) {
    basY.current = sayfaRef.current?.scrollTop <= 0 ? e.touches[0].clientY : null;
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

  const gorsel = gorselAdresi(urun.image_path);

  return (
    <>
      <div className={`perde${acik ? ' acik' : ''}`} onClick={kapat} />

      <div
        className={`sayfa${acik ? ' acik' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sayfa-ad"
        ref={sayfaRef}
        style={kaydirma ? { transform: `translateY(${kaydirma}px)` } : undefined}
        onTouchStart={dokunusBasladi}
        onTouchMove={dokunusSuruyor}
        onTouchEnd={dokunusBitti}
      >
        <button className="sayfa-kapat" aria-label="Kapat" onClick={kapat} ref={kapatRef}>
          &times;
        </button>

        {gorsel ? <img className="sayfa-foto" src={gorsel} alt={urun.name} /> : null}

        <div className="sayfa-govde">
          <h3 className="sayfa-ad" id="sayfa-ad">
            {urun.name}
          </h3>
          {urun.description ? <p className="sayfa-aciklama">{urun.description}</p> : null}
          <p className="sayfa-fiyat">{para(urun.price, simge)}</p>
          {urun.sold_out ? <p className="sayfa-rozet">Bugün yok</p> : null}

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

              <button
                type="button"
                className="ana-dugme"
                onClick={() => {
                  sepeteEkle(urun, adet);
                  setEklendi(true);
                  setTimeout(kapat, 420);
                }}
              >
                {eklendi ? 'Sepete eklendi ✓' : `Sepete ekle · ${para(urun.price * adet, simge)}`}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
