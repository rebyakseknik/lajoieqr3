import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, gorselAdresi } from '../lib/supabase';

/**
 * Ana sayfa vitrini: panelden girilen duyurular telefonda parmakla
 * kaydirilan kartlar halinde doner. Duyuru yoksa hic yer kaplamaz.
 */
export default function Announcements() {
  const [liste, setListe] = useState([]);
  const [etkin, setEtkin] = useState(0);
  const serit = useRef(null);

  useEffect(() => {
    let iptal = false;
    supabase
      .from('announcements')
      .select('id, title, body, image_path, link_url')
      .order('sort', { ascending: true })
      .order('id', { ascending: false })
      .limit(6)
      .then(({ data }) => !iptal && setListe(data || []));
    return () => {
      iptal = true;
    };
  }, []);

  /* Hangi kart gorunuyorsa alttaki nokta ona isik yakar. */
  function kaydirildi() {
    const el = serit.current;
    if (!el) return;
    const kart = el.firstElementChild;
    if (!kart) return;
    const gen = kart.offsetWidth + 12; // kart + bosluk
    setEtkin(Math.min(liste.length - 1, Math.round(el.scrollLeft / gen)));
  }

  if (!liste.length) return null;

  const tek = liste.length === 1;

  function Kart({ d }) {
    const gorsel = gorselAdresi(d.image_path);
    const ic = (
      <>
        {gorsel ? (
          <img className="duyuru-gorsel" src={gorsel} alt="" loading="lazy" />
        ) : (
          <span className="duyuru-gorsel duyuru-gorsel-bos" aria-hidden="true" />
        )}
        <span className="duyuru-metin">
          <b>{d.title}</b>
          {d.body ? <small>{d.body}</small> : null}
          {d.link_url ? <em>İncele →</em> : null}
        </span>
      </>
    );

    if (!d.link_url) {
      return <article className="duyuru-kart">{ic}</article>;
    }
    if (d.link_url.startsWith('/')) {
      return (
        <Link className="duyuru-kart tiklanir" to={d.link_url}>
          {ic}
        </Link>
      );
    }
    return (
      <a
        className="duyuru-kart tiklanir"
        href={d.link_url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {ic}
      </a>
    );
  }

  return (
    <section className="duyurular" aria-label="Duyurular">
      <div
        className={`duyuru-serit${tek ? ' tek' : ''}`}
        ref={serit}
        onScroll={tek ? undefined : kaydirildi}
      >
        {liste.map((d) => (
          <Kart key={d.id} d={d} />
        ))}
      </div>

      {tek ? null : (
        <div className="duyuru-noktalar" aria-hidden="true">
          {liste.map((d, i) => (
            <span key={d.id} className={i === etkin ? 'etkin' : ''} />
          ))}
        </div>
      )}
    </section>
  );
}
