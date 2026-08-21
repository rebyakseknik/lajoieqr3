import { useEffect, useRef } from 'react';
import ProductRow from './ProductRow';

export default function CategorySection({ kategori, urunler, simge, onAc, onGorunur }) {
  const bolumRef = useRef(null);

  // Bölüm ekrana girdiğinde ne kadarının göründüğünü üst bileşene bildirir;
  // o da en baskın bölümü etkin kategori olarak işaretler.
  useEffect(() => {
    const el = bolumRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;

    const gozlemci = new IntersectionObserver(
      (girdiler) => {
        girdiler.forEach((g) => {
          onGorunur(kategori.id, g.isIntersecting ? g.intersectionRatio : 0);
        });
      },
      {
        rootMargin: '-70px 0px -55% 0px',
        threshold: [0, 0.15, 0.35, 0.6, 1],
      }
    );

    gozlemci.observe(el);
    return () => gozlemci.disconnect();
  }, [kategori.id, onGorunur]);

  return (
    <section className="bolum" id={`k${kategori.id}`} ref={bolumRef}>
      <h2 className="bolum-baslik">
        <span>{kategori.name}</span>
      </h2>

      <ul className="liste">
        {urunler.map((u) => (
          <ProductRow key={u.id} urun={u} simge={simge} onAc={onAc} />
        ))}
      </ul>
    </section>
  );
}
