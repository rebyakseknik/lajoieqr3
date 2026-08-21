export default function MenuFooter({ ayarlar }) {
  const { farewell, address, phone, instagram, restaurant_name: ad } = ayarlar;
  const instagramAdi = (instagram || '').replace(/^@/, '');

  return (
    <footer className="dip">
      {farewell ? <p className="dip-karsilama">{farewell}</p> : null}
      {address ? <p className="dip-satir">{address}</p> : null}

      <p className="dip-baglanti">
        {phone ? <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`}>{phone}</a> : null}
        {instagramAdi ? (
          <a
            href={`https://instagram.com/${instagramAdi}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            @{instagramAdi}
          </a>
        ) : null}
      </p>

      <p className="dip-not">{ad} · Fiyatlarımıza KDV dahildir</p>
    </footer>
  );
}
