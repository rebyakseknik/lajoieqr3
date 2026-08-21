import { useEffect, useRef } from 'react';

export default function CategoryRail({ kategoriler, etkinId, onSec }) {
  const rayRef = useRef(null);
  const hapRefs = useRef({});

  // Etkin sekme görünür alanın dışında kalırsa ortala.
  useEffect(() => {
    const ray = rayRef.current;
    const hap = hapRefs.current[etkinId];
    if (!ray || !hap) return;

    const sol = hap.offsetLeft - (ray.clientWidth - hap.offsetWidth) / 2;
    ray.scrollTo({ left: Math.max(0, sol), behavior: 'smooth' });
  }, [etkinId]);

  if (!kategoriler.length) return null;

  return (
    <nav className="ray" aria-label="Menü kategorileri">
      <div className="ray-ic" ref={rayRef}>
        {kategoriler.map((k) => (
          <a
            key={k.id}
            ref={(el) => {
              hapRefs.current[k.id] = el;
            }}
            className={`ray-hap${k.id === etkinId ? ' etkin' : ''}`}
            href={`#k${k.id}`}
            onClick={(e) => {
              e.preventDefault();
              onSec(k.id);
            }}
          >
            {k.name}
          </a>
        ))}
      </div>
    </nav>
  );
}
