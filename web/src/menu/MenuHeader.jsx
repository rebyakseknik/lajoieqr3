export default function MenuHeader({ ad, altBaslik, hesapAlani }) {
  return (
    <header className="tepe">
      {hesapAlani ? <div className="tepe-hesap">{hesapAlani}</div> : null}
      <div className="tepe-ic">
        <p className="tepe-etiket">Dijital Menü</p>
        <h1 className="marka">{ad}</h1>
        {altBaslik ? <p className="tepe-alt">{altBaslik}</p> : null}
      </div>
    </header>
  );
}
