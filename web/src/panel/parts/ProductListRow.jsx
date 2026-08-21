import { para } from '../../lib/bicim';
import { gorselAdresi } from '../../lib/supabase';

export default function ProductListRow({
  urun,
  simge,
  onTasi,
  onTukendi,
  onDuzenle,
  onSil,
  ilkMi,
  sonMu,
}) {
  const foto = gorselAdresi(urun.image_path);

  return (
    <li className={`p-urun${urun.active ? '' : ' pasif'}`}>
      {foto ? (
        <img className="p-urun-foto" src={foto} alt="" loading="lazy" />
      ) : (
        <span className="p-urun-foto p-foto-yok" aria-hidden="true" />
      )}

      <div className="p-urun-metin">
        <p className="p-urun-ad">
          {urun.name}
          {urun.sold_out ? <span className="p-etiket p-etiket-kirmizi">bugün yok</span> : null}
          {urun.featured ? <span className="p-etiket p-etiket-altin">öneri</span> : null}
          {!urun.active ? <span className="p-etiket">gizli</span> : null}
        </p>
        {urun.description ? <p className="p-urun-aciklama">{urun.description}</p> : null}
      </div>

      <p className="p-urun-fiyat">{para(urun.price, simge)}</p>

      <div className="p-urun-islem">
        <button
          type="button"
          className="p-ok"
          title="Yukarı taşı"
          disabled={ilkMi}
          onClick={() => onTasi(urun, 'yukari')}
        >
          ↑
        </button>
        <button
          type="button"
          className="p-ok"
          title="Aşağı taşı"
          disabled={sonMu}
          onClick={() => onTasi(urun, 'asagi')}
        >
          ↓
        </button>

        <button type="button" className="p-kucuk-dugme" onClick={() => onTukendi(urun)}>
          {urun.sold_out ? 'Geri koy' : 'Bugün yok'}
        </button>

        <button type="button" className="p-kucuk-dugme" onClick={() => onDuzenle(urun)}>
          Düzenle
        </button>

        <button
          type="button"
          className="p-kucuk-dugme p-tehlike"
          onClick={() => onSil(urun)}
        >
          Sil
        </button>
      </div>
    </li>
  );
}
