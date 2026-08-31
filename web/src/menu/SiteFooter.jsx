import { useAyarlar } from '../lib/kancalar';

/**
 * Menunun altindaki kunye: konum, saatler, iletisim.
 *
 * Ayri bir "hakkimizda" sayfasi acmak yerine buraya koyuyoruz —
 * QR ile gelen musteriyi fazladan tiklatmadan, arayan kisiye de
 * aradigini veriyor.
 */
export default function SiteFooter() {
  const { ayarlar } = useAyarlar();

  const adres = ayarlar.address || '';
  const telefon = ayarlar.phone || '';
  const saatler = ayarlar.hours || '';
  const instagram = ayarlar.instagram || '';
  const harita = ayarlar.maps_url || '';

  const telTemiz = telefon.replace(/[^0-9+]/g, '');

  return (
    <footer className="kunye">
      <div className="kunye-ic">
        <img className="kunye-logo" src="/marka/logo-koyu.svg" alt="La Joie" />

        <div className="kunye-satirlar">
          {adres ? (
            <div className="kunye-blok">
              <p className="kunye-etiket">Adres</p>
              {harita ? (
                <a href={harita} target="_blank" rel="noopener noreferrer">
                  {adres}
                </a>
              ) : (
                <p>{adres}</p>
              )}
            </div>
          ) : null}

          {saatler ? (
            <div className="kunye-blok">
              <p className="kunye-etiket">Çalışma saatleri</p>
              <p>{saatler}</p>
            </div>
          ) : null}

          {telefon ? (
            <div className="kunye-blok">
              <p className="kunye-etiket">Telefon</p>
              <a href={`tel:${telTemiz}`}>{telefon}</a>
            </div>
          ) : null}

          {instagram ? (
            <div className="kunye-blok">
              <p className="kunye-etiket">Instagram</p>
              <a
                href={`https://instagram.com/${instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                @{instagram.replace('@', '')}
              </a>
            </div>
          ) : null}
        </div>

        {ayarlar.farewell ? <p className="kunye-veda">{ayarlar.farewell}</p> : null}
      </div>
    </footer>
  );
}
