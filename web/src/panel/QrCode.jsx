import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { usePanel, PanelBaslik } from './PanelLayout';
import Kart from './parts/Kart';

export default function QrCode() {
  const { ayarlar, bildirim } = usePanel();
  const buyukRef = useRef(null);
  const kartRef = useRef(null);

  const [indirmeAdresi, setIndirmeAdresi] = useState('');
  const [kopyaDurumu, setKopyaDurumu] = useState('Kopyala');
  const [hata, setHata] = useState(false);

  const menuAdresi = `${window.location.origin}/`;
  const restoranAd = ayarlar.restaurant_name || 'La Joie';

  useEffect(() => {
    const secenekler = {
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1C4433', light: '#FFFFFF' },
    };

    async function ciz() {
      try {
        if (buyukRef.current) {
          await QRCode.toCanvas(buyukRef.current, menuAdresi, { ...secenekler, width: 320 });
          setIndirmeAdresi(buyukRef.current.toDataURL('image/png'));
        }
        if (kartRef.current) {
          await QRCode.toCanvas(kartRef.current, menuAdresi, { ...secenekler, width: 260 });
        }
      } catch {
        setHata(true);
      }
    }
    ciz();
  }, [menuAdresi]);

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(menuAdresi);
      setKopyaDurumu('Kopyalandı');
    } catch {
      setKopyaDurumu('Kopyalanamadı');
    }
    setTimeout(() => setKopyaDurumu('Kopyala'), 1800);
  }

  const dosyaAdi = restoranAd.replace(/[^A-Za-z0-9]+/g, '-') + '-qr.png';

  return (
    <>
      <PanelBaslik baslik="QR kod" bildirim={bildirim} />

      <Kart
        baslik="Menü adresiniz"
        alt="QR kod bu adresi açar. Adresi doğrudan paylaşabilir, Instagram biyografinize de koyabilirsiniz."
      >
        <div className="p-adres">
          <input value={menuAdresi} readOnly onClick={(e) => e.target.select()} />
          <button type="button" className="p-kucuk-dugme" onClick={kopyala}>
            {kopyaDurumu}
          </button>
        </div>
      </Kart>

      <div className="p-ikili">
        <Kart baslik="QR kod" alt="Afişe, kapıya veya adisyona koymak için indirin.">
          <div className="qr-alan">
            <canvas ref={buyukRef} width="320" height="320" />
            {hata ? (
              <p className="p-yok">QR kod oluşturulamadı. Sayfayı yenileyip tekrar deneyin.</p>
            ) : null}
          </div>
          <div className="p-form-dip">
            <a className="p-dugme" href={indirmeAdresi} download={dosyaAdi}>
              PNG indir
            </a>
          </div>
        </Kart>

        <Kart baslik="Masa kartı" alt="Yazdırıp keserek masalara koyabileceğiniz hazır kart.">
          <div className="kart-onizleme">
            <div className="masa-kart">
              <p className="mk-etiket">Dijital Menü</p>
              <p className="mk-ad">{restoranAd}</p>
              <canvas ref={kartRef} width="260" height="260" />
              <p className="mk-yonerge">Kamerayı kodun üzerine tutun</p>
              {ayarlar.tagline ? <p className="mk-alt">{ayarlar.tagline}</p> : null}
            </div>
          </div>
          <div className="p-form-dip">
            <button type="button" className="p-dugme" onClick={() => window.print()}>
              Kartı yazdır
            </button>
          </div>
        </Kart>
      </div>

      <Kart baslik="Küçük hatırlatma">
        <p className="p-kart-alt" style={{ margin: 0 }}>
          QR kod menü adresine bağlıdır. Alan adınızı ileride değiştirirseniz kodu buradan yeniden
          indirip masa kartlarını yenilemeniz gerekir. Menüdeki ürünleri değiştirmek için QR kodu
          değiştirmenize gerek yoktur.
        </p>
      </Kart>
    </>
  );
}
