/**
 * Oranli liste (en cok bakilan urunler, kategori ilgisi, cihaz dagilimi).
 * veri: [{ ad, altAd, deger, gosterilen }]
 */
export default function RatioList({ veri, bosMesaj = 'Henüz veri yok.' }) {
  if (!veri.length) return <p className="p-yok">{bosMesaj}</p>;

  const zirve = Math.max(1, ...veri.map((d) => d.deger));

  return (
    <ul className="p-liste">
      {veri.map((d, i) => (
        <li key={i}>
          <div className="p-liste-ust">
            <span>
              {d.ad}
              {d.altAd ? <small className="p-kucuk">{d.altAd}</small> : null}
            </span>
            <span className="p-liste-sayi">{d.gosterilen ?? d.deger}</span>
          </div>
          <div className="p-oran">
            <div style={{ width: `${Math.round((d.deger / zirve) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
