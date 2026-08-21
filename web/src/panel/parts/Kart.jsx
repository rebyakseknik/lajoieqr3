export default function Kart({ baslik, alt, children }) {
  return (
    <section className="p-kart">
      {baslik ? <h2 className="p-kart-baslik">{baslik}</h2> : null}
      {alt ? <p className="p-kart-alt">{alt}</p> : null}
      {children}
    </section>
  );
}
