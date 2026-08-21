/**
 * Dikey cubuk grafik. PHP surumundeki gorunumu birebir korur.
 * veri: [{ etiket, altEtiket, deger, ipucu }]
 */
export default function BarChart({ veri, ince = false, degerGoster = false }) {
  const zirve = Math.max(1, ...veri.map((d) => d.deger));

  return (
    <div className={`grafik${ince ? ' grafik-ince' : ''}`}>
      {veri.map((d, i) => {
        const yuzde = Math.round((d.deger / zirve) * 100);
        const yukseklik = Math.max(yuzde, d.deger > 0 ? 4 : 1);

        return (
          <div className="cubuk-sar" key={i} title={d.ipucu}>
            {degerGoster ? (
              <span className="cubuk-deger">{d.deger || ''}</span>
            ) : null}
            <div className="cubuk" style={{ height: `${yukseklik}%` }} />
            <span className="cubuk-etiket">
              {d.etiket}
              {d.altEtiket ? (
                <>
                  <br />
                  <small>{d.altEtiket}</small>
                </>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
