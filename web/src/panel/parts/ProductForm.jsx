import { useEffect, useState } from 'react';
import { fiyatiOku, fiyatiYaz } from '../../lib/bicim';
import { gorselAdresi } from '../../lib/supabase';

const BOS = {
  name: '',
  description: '',
  fiyatMetni: '',
  category_id: '',
  active: true,
  sold_out: false,
  featured: false,
  orderable: true,
};

export default function ProductForm({ urun, kategoriler, varsayilanKategori, onKaydet, onVazgec }) {
  const [form, setForm] = useState(BOS);
  const [dosya, setDosya] = useState(null);
  const [fotoSil, setFotoSil] = useState(false);
  const [bekliyor, setBekliyor] = useState(false);

  useEffect(() => {
    if (urun) {
      setForm({
        name: urun.name,
        description: urun.description || '',
        fiyatMetni: fiyatiYaz(urun.price),
        category_id: String(urun.category_id),
        active: urun.active,
        sold_out: urun.sold_out,
        featured: urun.featured,
        orderable: urun.orderable !== false,
      });
    } else {
      setForm({ ...BOS, category_id: String(varsayilanKategori || kategoriler[0]?.id || '') });
    }
    setDosya(null);
    setFotoSil(false);
  }, [urun, varsayilanKategori, kategoriler]);

  function degistir(alan, deger) {
    setForm((o) => ({ ...o, [alan]: deger }));
  }

  async function gonder(e) {
    e.preventDefault();
    setBekliyor(true);
    await onKaydet({ form, dosya, fotoSil });
    setBekliyor(false);
  }

  const mevcutFoto = urun?.image_path ? gorselAdresi(urun.image_path) : null;

  return (
    <form className="p-form" onSubmit={gonder}>
      <div className="p-ikili-alan">
        <div>
          <label htmlFor="ad">Ürün adı</label>
          <input
            id="ad"
            value={form.name}
            onChange={(e) => degistir('name', e.target.value)}
            maxLength={120}
            required
          />
        </div>
        <div>
          <label htmlFor="fiyat">Fiyat</label>
          <input
            id="fiyat"
            inputMode="decimal"
            value={form.fiyatMetni}
            onChange={(e) => degistir('fiyatMetni', e.target.value)}
            placeholder="200"
            required
          />
        </div>
      </div>

      <label htmlFor="kategori">Kategori</label>
      <select
        id="kategori"
        value={form.category_id}
        onChange={(e) => degistir('category_id', e.target.value)}
        required
      >
        {kategoriler.map((k) => (
          <option key={k.id} value={k.id}>
            {k.name}
          </option>
        ))}
      </select>

      <label htmlFor="aciklama">
        İçindekiler <span className="p-istege">isteğe bağlı</span>
      </label>
      <input
        id="aciklama"
        value={form.description}
        onChange={(e) => degistir('description', e.target.value)}
        maxLength={400}
        placeholder="Yumurta, domates, salata mix"
      />

      <label htmlFor="foto">
        Fotoğraf <span className="p-istege">isteğe bağlı</span>
      </label>
      <input
        id="foto"
        type="file"
        accept="image/*"
        onChange={(e) => setDosya(e.target.files?.[0] || null)}
      />
      <p className="p-ipucu">
        Telefonla çektiğiniz fotoğrafı doğrudan yükleyebilirsiniz, sistem otomatik küçültür.
      </p>

      {mevcutFoto ? (
        <div className="p-mevcut-foto">
          <img src={mevcutFoto} alt="" />
          <label className="p-onay">
            <input type="checkbox" checked={fotoSil} onChange={(e) => setFotoSil(e.target.checked)} />
            Fotoğrafı kaldır
          </label>
        </div>
      ) : null}

      <div className="p-onaylar">
        <label className="p-onay">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => degistir('active', e.target.checked)}
          />
          Menüde göster
        </label>
        <label className="p-onay">
          <input
            type="checkbox"
            checked={form.sold_out}
            onChange={(e) => degistir('sold_out', e.target.checked)}
          />
          Bugün yok
        </label>
        <label className="p-onay">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) => degistir('featured', e.target.checked)}
          />
          Şefin önerisi
        </label>
        <label className="p-onay">
          <input
            type="checkbox"
            checked={form.orderable}
            onChange={(e) => degistir('orderable', e.target.checked)}
          />
          Ön siparişe açık
        </label>
      </div>

      <div className="p-form-dip">
        <button type="submit" className="p-dugme" disabled={bekliyor}>
          {bekliyor ? 'Kaydediliyor…' : urun ? 'Değişiklikleri kaydet' : 'Ürünü ekle'}
        </button>
        {urun ? (
          <button type="button" className="p-dugme-sade" onClick={onVazgec}>
            Vazgeç
          </button>
        ) : null}
      </div>
    </form>
  );
}

export { fiyatiOku };
