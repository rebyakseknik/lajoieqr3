import { para } from '../lib/bicim';
import { useSepet } from '../lib/sepet';

/** Sepette bir sey varken ekranin altinda duran serit. */
export default function CartBar({ simge, onAc }) {
  const { adet, tutar, bos } = useSepet();

  return (
    <div className={`sepet-serit${bos ? '' : ' acik'}`} aria-hidden={bos}>
      <button type="button" className="sepet-dugme" onClick={onAc} tabIndex={bos ? -1 : 0}>
        <span className="sepet-sayi" aria-hidden="true">
          {adet}
        </span>
        <span className="sepet-metin">Ön siparişi tamamla</span>
        <span className="sepet-tutar">{para(tutar, simge)}</span>
      </button>
    </div>
  );
}
