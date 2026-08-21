import { para } from '../lib/bicim';
import { gorselAdresi } from '../lib/supabase';

export default function ProductRow({ urun, simge, onAc }) {
  const tukendi = Boolean(urun.sold_out);
  const gorsel = gorselAdresi(urun.image_path);
  const fiyat = para(urun.price, simge);

  const sinif = ['satir', tukendi ? 'bitti' : '', urun.featured ? 'one-cikan' : '']
    .filter(Boolean)
    .join(' ');

  function tusaBasildi(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAc(urun);
    }
  }

  return (
    <li
      className={sinif}
      tabIndex={0}
      role="button"
      aria-label={`${urun.name}, ${fiyat}`}
      onClick={() => onAc(urun)}
      onKeyDown={tusaBasildi}
    >
      {gorsel ? (
        <img className="satir-foto" src={gorsel} alt="" loading="lazy" width="72" height="72" />
      ) : (
        <span className="satir-foto bos-foto" aria-hidden="true" />
      )}

      <div className="satir-metin">
        <p className="satir-ust">
          <span className="satir-ad">{urun.name}</span>
          <span className="cizgi" aria-hidden="true" />
          <span className="satir-fiyat">{fiyat}</span>
        </p>

        {urun.description ? <p className="satir-aciklama">{urun.description}</p> : null}

        {tukendi ? (
          <p className="rozet">Bugün yok</p>
        ) : urun.featured ? (
          <p className="rozet rozet-oneri">Şefin önerisi</p>
        ) : null}
      </div>
    </li>
  );
}
