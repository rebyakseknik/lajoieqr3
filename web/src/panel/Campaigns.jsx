import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { para, fiyatiOku } from '../lib/bicim';
import { usePanel, PanelBaslik } from './PanelLayout';
import Kart from './parts/Kart';

/** Seçili kampanyanın QR kodunu çizer ve indirilebilir yapar. */
function KampanyaQr({ adres, ad }) {
  const tuval = useRef(null);
  const [indirme, setIndirme] = useState('');

  useEffect(() => {
    async function ciz() {
      if (!tuval.current) return;
      try {
        await QRCode.toCanvas(tuval.current, adres, {
          margin: 1,
          errorCorrectionLevel: 'M',
          width: 240,
          color: { dark: '#1C4433', light: '#FFFFFF' },
        });
        setIndirme(tuval.current.toDataURL('image/png'));
      } catch {
        /* tuval cizilemedi */
      }
    }
    ciz();
  }, [adres]);

  const dosya = `${(ad || 'kampanya').replace(/[^A-Za-z0-9]+/g, '-')}-qr.png`;

  return (
    <div className="kmp-qr">
      <canvas ref={tuval} />
      {indirme ? (
        <a className="p-dugme-sade" href={indirme} download={dosya}>
          QR kodu indir
        </a>
      ) : null}
    </div>
  );
}

export default function Campaigns() {
  const { ayarlar, bildirim, bildir } = usePanel();
  const simge = ayarlar.currency || '₺';

  const [liste, setListe] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [acikQr, setAcikQr] = useState(null);

  const [slug, setSlug] = useState('');
  const [ad, setAd] = useState('');
  const [tur, setTur] = useState('percent');
  const [deger, setDeger] = useState('10');
  const [minTutar, setMinTutar] = useState('');
  const [tavan, setTavan] = useState('');
  const [gun, setGun] = useState('30');
  const [oto, setOto] = useState(false);
  const [limit, setLimit] = useState('');
  const [not, setNot] = useState('');
  const [bekliyor, setBekliyor] = useState(false);

  const getir = useCallback(async () => {
    const { data, error } = await supabase.rpc('kampanya_ozet');
    if (error) bildir(error.message, 'hata');
    setListe(data || []);
    setYukleniyor(false);
  }, [bildir]);

  useEffect(() => {
    getir();
  }, [getir]);

  async function olustur(e) {
    e.preventDefault();
    const sayi = fiyatiOku(deger);
    if (sayi === null || sayi <= 0) return bildir('Geçerli bir değer yazın.', 'hata');

    setBekliyor(true);
    const { data, error } = await supabase.rpc('kampanya_olustur', {
      p_slug: slug,
      p_ad: ad,
      p_tur: tur,
      p_deger: sayi,
      p_min: fiyatiOku(minTutar) ?? 0,
      p_tavan: fiyatiOku(tavan) ?? 0,
      p_gun: Number(gun) || 0,
      p_oto: oto,
      p_limit: Number(limit) || 0,
      p_not: not,
    });
    setBekliyor(false);

    if (error) return bildir(error.message, 'hata');
    bildir(`"${data.slug}" kampanyası oluşturuldu.`);
    setSlug('');
    setAd('');
    setNot('');
    getir();
  }

  async function durdur(k) {
    const { error } = await supabase.rpc('kampanya_durdur', { p_id: k.id, p_aktif: !k.active });
    if (error) return bildir(error.message, 'hata');
    getir();
  }

  async function kopyala(metin) {
    try {
      await navigator.clipboard.writeText(metin);
      bildir('Kopyalandı.');
    } catch {
      bildir('Kopyalanamadı, elle seçin.', 'hata');
    }
  }

  const adres = (s) => `${window.location.origin}/kayit/${s}`;

  return (
    <>
      <PanelBaslik baslik="Kampanyalar" bildirim={bildirim} />

      <Kart>
        <p className="p-kart-alt" style={{ marginTop: 0 }}>
          Kampanya bir kupon şablonudur. Kişi hesap açtığında ona <b>özel, tek
          kullanımlık</b> bir kupon üretilir ve hesabında görünür — sipariş verirken
          kod yazmasına gerek kalmaz. Kampanya bağlantısını QR olarak bastırıp
          masalara koyabilir ya da adresi Instagram'da paylaşabilirsiniz.
        </p>
      </Kart>

      {/* ---------- Yeni kampanya ---------- */}
      <form className="p-form p-kart" onSubmit={olustur}>
        <h2 className="p-kart-baslik">Yeni kampanya</h2>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="slug">Bağlantı adı</label>
            <input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              maxLength={32}
              placeholder="masa-qr"
              required
            />
            <p className="p-ipucu" style={{ marginTop: 6 }}>
              Adres: {window.location.origin}/kayit/<b>{slug || '…'}</b>
            </p>
          </div>
          <div>
            <label htmlFor="kad">Görünen ad</label>
            <input
              id="kad"
              value={ad}
              onChange={(e) => setAd(e.target.value)}
              maxLength={60}
              placeholder="Masa kampanyası"
              required
            />
          </div>
        </div>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="ktur">Kupon türü</label>
            <select id="ktur" value={tur} onChange={(e) => setTur(e.target.value)}>
              <option value="percent">Yüzde indirim</option>
              <option value="amount">Tutar indirimi</option>
            </select>
          </div>
          <div>
            <label htmlFor="kdeger">{tur === 'percent' ? 'Yüzde (%)' : `Tutar (${simge})`}</label>
            <input
              id="kdeger"
              inputMode="decimal"
              value={deger}
              onChange={(e) => setDeger(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="kmin">En az sipariş tutarı</label>
            <input
              id="kmin"
              inputMode="decimal"
              value={minTutar}
              onChange={(e) => setMinTutar(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label htmlFor="ktavan">En fazla indirim ({simge})</label>
            <input
              id="ktavan"
              inputMode="decimal"
              value={tavan}
              onChange={(e) => setTavan(e.target.value)}
              placeholder="Boş = sınırsız"
            />
          </div>
        </div>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="kgun">Kaç gün geçerli</label>
            <input
              id="kgun"
              inputMode="numeric"
              value={gun}
              onChange={(e) => setGun(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="30"
            />
          </div>
          <div>
            <label htmlFor="klimit">En fazla kaç kişiye</label>
            <input
              id="klimit"
              inputMode="numeric"
              value={limit}
              onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Boş = sınırsız"
            />
          </div>
        </div>

        <label className="p-onay">
          <input type="checkbox" checked={oto} onChange={(e) => setOto(e.target.checked)} />
          Bağlantı olmadan da, hesap açan herkese verilsin
        </label>
        <p className="p-ipucu">
          Bu seçenek aynı anda tek kampanyada açık olabilir. Yeni bir tanesini
          işaretlerseniz öncekinin otomatik verilmesi durur.
        </p>

        <label htmlFor="knot">Not (panelde görünür)</label>
        <input
          id="knot"
          value={not}
          onChange={(e) => setNot(e.target.value)}
          maxLength={160}
          placeholder="Masalardaki QR için"
        />

        <div className="p-form-dip">
          <button type="submit" className="p-dugme" disabled={bekliyor}>
            {bekliyor ? 'Oluşturuluyor…' : 'Kampanyayı oluştur'}
          </button>
        </div>
      </form>

      {/* ---------- Kampanya listesi ---------- */}
      <Kart>
        <h2 className="p-kart-baslik">Kampanyalar</h2>

        {yukleniyor ? (
          <p className="p-yok">Yükleniyor…</p>
        ) : !liste.length ? (
          <p className="p-yok">Henüz kampanya yok.</p>
        ) : (
          <ul className="kmp-liste">
            {liste.map((k) => (
              <li key={k.id} className={k.active ? '' : 'sonuk'}>
                <div className="kmp-ust">
                  <div className="kmp-bilgi">
                    <b>{k.name}</b>
                    <small>
                      {k.issued} kupon verildi · {k.used} kullanıldı
                      {Number(k.ciro) > 0 ? ` · ${para(k.ciro, simge)} ciro` : ''}
                    </small>
                  </div>
                  <button type="button" className="k-durdur" onClick={() => durdur(k)}>
                    {k.active ? 'Durdur' : 'Aç'}
                  </button>
                </div>

                <div className="kmp-adres">
                  <code>{adres(k.slug)}</code>
                  <button type="button" onClick={() => kopyala(adres(k.slug))}>
                    Kopyala
                  </button>
                  <button
                    type="button"
                    onClick={() => setAcikQr(acikQr === k.id ? null : k.id)}
                  >
                    {acikQr === k.id ? 'QR gizle' : 'QR göster'}
                  </button>
                </div>

                {acikQr === k.id ? <KampanyaQr adres={adres(k.slug)} ad={k.slug} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </>
  );
}
