import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useMenuVerisi } from '../lib/kancalar';
import { para } from '../lib/bicim';
import { usePanel, PanelBaslik } from './PanelLayout';
import Kart from './parts/Kart';

/**
 * Bir satırı ürüne çevirir.
 * Kabul edilen biçimler:  AD | açıklama | fiyat  ·  AD | fiyat  ·  AD 200
 */
export function satiriCoz(satir) {
  const metin = satir.trim();
  if (!metin) return null;

  const parcalar = metin
    .split(/\s*[|;\t]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!parcalar.length) return null;

  // Ayraç yoksa sondaki sayıyı fiyat kabul et.
  if (parcalar.length === 1) {
    const eslesme = parcalar[0].match(
      /^(.*?)[\s.\-–]*(?:₺|TL)?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:₺|TL)?$/i
    );
    if (eslesme && eslesme[1].trim()) {
      return {
        ad: eslesme[1].trim().slice(0, 120),
        aciklama: '',
        fiyat: Number(eslesme[2].replace(',', '.')),
      };
    }
    return { ad: parcalar[0].slice(0, 120), aciklama: '', fiyat: 0, uyari: true };
  }

  const kalan = [...parcalar];
  const sonuncu = kalan.pop();
  const temiz = sonuncu.replace(/[\s₺]|TL/gi, '').replace(',', '.');

  let fiyat = 0;
  if (temiz !== '' && !Number.isNaN(Number(temiz))) {
    fiyat = Number(temiz);
  } else {
    kalan.push(sonuncu);
  }

  const ad = kalan.shift() || '';
  if (!ad) return null;

  return {
    ad: ad.slice(0, 120),
    aciklama: kalan.join(', ').slice(0, 400),
    fiyat,
    uyari: fiyat <= 0,
  };
}

export default function BulkAdd() {
  const { ayarlar, bildirim, bildir } = usePanel();
  const { kategoriler, urunler, yenile } = useMenuVerisi(true);

  const [kategoriId, setKategoriId] = useState('');
  const [metin, setMetin] = useState('');
  const [onizleme, setOnizleme] = useState(null);
  const [bekliyor, setBekliyor] = useState(false);

  const simge = ayarlar.currency || '₺';

  function kontrolEt(e) {
    e.preventDefault();

    if (!kategoriId) {
      setOnizleme(null);
      return bildir('Ürünlerin ekleneceği kategoriyi seçin.', 'hata');
    }

    const liste = metin.split(/\r\n|\n|\r/).map(satiriCoz).filter(Boolean);

    if (!liste.length) {
      setOnizleme(null);
      return bildir('Okunabilecek satır bulunamadı. Örnek biçime bakın.', 'hata');
    }
    setOnizleme(liste);
  }

  async function uygula() {
    setBekliyor(true);

    const kid = Number(kategoriId);
    const ayniKategori = urunler.filter((u) => u.category_id === kid);
    let sira = ayniKategori.reduce((m, u) => Math.max(m, u.position), 0);

    const kayitlar = onizleme.map((u) => {
      sira += 10;
      return {
        category_id: kid,
        name: u.ad,
        description: u.aciklama,
        price: u.fiyat,
        position: sira,
      };
    });

    const { error } = await supabase.from('products').insert(kayitlar);
    setBekliyor(false);

    if (error) return bildir('Eklenemedi: ' + error.message, 'hata');

    bildir(`${kayitlar.length} ürün eklendi.`);
    setMetin('');
    setOnizleme(null);
    yenile();
  }

  return (
    <>
      <PanelBaslik baslik="Toplu ürün ekle" bildirim={bildirim} />

      <Kart
        baslik="Nasıl kullanılır"
        alt="Her satıra bir ürün yazın, bölümleri dik çizgi ( | ) ile ayırın."
      >
        <pre className="p-ornek">
{`OMLET | Yumurta, domates, salata mix | 200
KAŞARLI TOST | 200
SUCUKLU TOST | Kaşar, sucuk | 230`}
        </pre>
        <p className="p-ipucu">
          Açıklamayı boş bırakabilirsiniz. Fotoğrafları sonradan “Ürünler” ekranından
          ekleyebilirsiniz.
        </p>
      </Kart>

      <form className="p-form p-kart" onSubmit={kontrolEt}>
        <label htmlFor="hedef-kategori">Hangi kategoriye eklensin?</label>
        <select
          id="hedef-kategori"
          value={kategoriId}
          onChange={(e) => setKategoriId(e.target.value)}
          required
        >
          <option value="">— kategori seçin —</option>
          {kategoriler.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>

        <label htmlFor="liste">Ürün listesi</label>
        <textarea
          id="liste"
          rows={12}
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          placeholder="SEZAR SALATA | Marul, tavuk, parmesan, kruton | 320"
        />

        <div className="p-form-dip">
          <button type="submit" className="p-dugme">
            Önce kontrol et
          </button>
        </div>
      </form>

      {onizleme ? (
        <Kart
          baslik={`${onizleme.length} ürün eklenecek`}
          alt="Listeyi kontrol edin. Doğruysa aşağıdaki düğmeye basın."
        >
          <table className="p-tablo">
            <thead>
              <tr>
                <th>Ürün</th>
                <th>İçindekiler</th>
                <th className="sag">Fiyat</th>
              </tr>
            </thead>
            <tbody>
              {onizleme.map((u, i) => (
                <tr key={i} className={u.uyari ? 'uyarili' : ''}>
                  <td>{u.ad}</td>
                  <td className="soluk">{u.aciklama || '—'}</td>
                  <td className="sag">
                    {u.uyari ? (
                      <span className="p-etiket p-etiket-kirmizi">fiyat yok</span>
                    ) : (
                      para(u.fiyat, simge)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="p-form-dip">
            <button type="button" className="p-dugme" onClick={uygula} disabled={bekliyor}>
              {bekliyor ? 'Ekleniyor…' : `Evet, ${onizleme.length} ürünü ekle`}
            </button>
          </div>
        </Kart>
      ) : null}
    </>
  );
}
