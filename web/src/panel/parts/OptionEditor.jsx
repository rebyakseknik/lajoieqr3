import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { para, fiyatiOku } from '../../lib/bicim';

/**
 * Bir urunun secenek gruplarini duzenler.
 *
 * Iki grup turu var ve farki fiyatta:
 *   Boyut (tam fiyat) — secilen secenegin fiyati urunun fiyati OLUR.
 *   Ekstra (ekleme)   — secenegin fiyati toplama EKLENIR.
 */
export default function OptionEditor({ urunId, simge, bildir }) {
  const [gruplar, setGruplar] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  const [yeniAd, setYeniAd] = useState('');
  const [yeniTur, setYeniTur] = useState('add');
  const [ekliyor, setEkliyor] = useState(false);

  const getir = useCallback(async () => {
    if (!urunId) return;
    const { data, error } = await supabase
      .from('option_groups')
      .select('*, options(*)')
      .eq('product_id', urunId)
      .order('position')
      .order('id');

    if (error) bildir(error.message, 'hata');
    setGruplar(
      (data || []).map((g) => ({
        ...g,
        options: (g.options || []).sort((a, b) => a.position - b.position || a.id - b.id),
      }))
    );
    setYukleniyor(false);
  }, [urunId, bildir]);

  useEffect(() => {
    getir();
  }, [getir]);

  async function grupEkle(e) {
    e.preventDefault();
    if (yeniAd.trim().length < 1) return;

    setEkliyor(true);
    const mutlak = yeniTur === 'absolute';
    const { error } = await supabase.from('option_groups').insert({
      product_id: urunId,
      name: yeniAd.trim(),
      price_mode: yeniTur,
      // Boyut zorunlu ve tekli; ekstra isteğe bağlı ve çoklu.
      min_select: mutlak ? 1 : 0,
      max_select: mutlak ? 1 : 5,
      position: gruplar.length,
    });
    setEkliyor(false);

    if (error) {
      bildir(
        error.message.includes('option_groups_tek_absolute')
          ? 'Bir üründe yalnızca bir boyut grubu olabilir.'
          : error.message,
        'hata'
      );
      return;
    }
    setYeniAd('');
    getir();
  }

  async function grupSil(g) {
    if (!window.confirm(`"${g.name}" grubu ve içindeki seçenekler silinsin mi?`)) return;
    const { error } = await supabase.from('option_groups').delete().eq('id', g.id);
    if (error) return bildir(error.message, 'hata');
    getir();
  }

  async function grupGuncelle(g, alanlar) {
    const { error } = await supabase.from('option_groups').update(alanlar).eq('id', g.id);
    if (error) return bildir(error.message, 'hata');
    getir();
  }

  async function secenekEkle(g, ad, fiyat) {
    const sayi = fiyatiOku(fiyat) ?? 0;
    if (!ad.trim()) return;

    const { error } = await supabase.from('options').insert({
      group_id: g.id,
      name: ad.trim(),
      price: sayi,
      position: (g.options || []).length,
    });
    if (error) return bildir(error.message, 'hata');
    getir();
  }

  async function secenekSil(o) {
    const { error } = await supabase.from('options').delete().eq('id', o.id);
    if (error) return bildir(error.message, 'hata');
    getir();
  }

  async function secenekTukendi(o) {
    const { error } = await supabase
      .from('options')
      .update({ sold_out: !o.sold_out })
      .eq('id', o.id);
    if (error) return bildir(error.message, 'hata');
    getir();
  }

  if (!urunId) {
    return (
      <p className="p-ipucu" style={{ marginTop: 8 }}>
        Seçenek eklemek için önce ürünü kaydedin.
      </p>
    );
  }

  return (
    <div className="sg-kutu">
      <h3 className="sg-baslik">Seçenekler</h3>
      <p className="p-ipucu" style={{ marginTop: 0 }}>
        <b>Boyut</b> grubunda seçilen fiyat ürünün fiyatı olur (S 120₺, L 180₺).{' '}
        <b>Ekstra</b> grubunda fiyat üstüne eklenir (çedar +10₺).
      </p>

      {yukleniyor ? (
        <p className="p-yok">Yükleniyor…</p>
      ) : (
        gruplar.map((g) => (
          <GrupKarti
            key={g.id}
            grup={g}
            simge={simge}
            onSil={() => grupSil(g)}
            onGuncelle={(a) => grupGuncelle(g, a)}
            onSecenekEkle={(ad, f) => secenekEkle(g, ad, f)}
            onSecenekSil={secenekSil}
            onSecenekTukendi={secenekTukendi}
          />
        ))
      )}

      {/* ---------- Yeni grup ---------- */}
      <div className="sg-yeni">
        <input
          value={yeniAd}
          onChange={(e) => setYeniAd(e.target.value)}
          maxLength={40}
          placeholder="Grup adı (Boyut, Ekstralar…)"
        />
        <select value={yeniTur} onChange={(e) => setYeniTur(e.target.value)}>
          <option value="add">Ekstra (fiyata eklenir)</option>
          <option value="absolute">Boyut (fiyatı belirler)</option>
        </select>
        <button type="button" className="p-dugme-sade" disabled={ekliyor} onClick={grupEkle}>
          Grup ekle
        </button>
      </div>
    </div>
  );
}

function GrupKarti({ grup, simge, onSil, onGuncelle, onSecenekEkle, onSecenekSil, onSecenekTukendi }) {
  const [ad, setAd] = useState('');
  const [fiyat, setFiyat] = useState('');
  const mutlak = grup.price_mode === 'absolute';

  return (
    <section className="sg-grup">
      <header className="sg-grup-ust">
        <div>
          <b>{grup.name}</b>
          <small>
            {mutlak ? 'Boyut · fiyatı belirler' : 'Ekstra · fiyata eklenir'}
            {' · '}
            {grup.min_select >= 1 ? 'zorunlu' : 'isteğe bağlı'}
            {grup.max_select > 1 ? ` · en fazla ${grup.max_select}` : ''}
          </small>
        </div>
        <button type="button" className="sg-sil" onClick={onSil}>
          Sil
        </button>
      </header>

      {!mutlak ? (
        <div className="sg-kural">
          <label>
            <input
              type="checkbox"
              checked={grup.min_select >= 1}
              onChange={(e) => onGuncelle({ min_select: e.target.checked ? 1 : 0 })}
            />
            Zorunlu
          </label>
          <label>
            En fazla
            <input
              type="number"
              min={1}
              max={10}
              value={grup.max_select}
              onChange={(e) =>
                onGuncelle({ max_select: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })
              }
            />
          </label>
        </div>
      ) : null}

      <ul className="sg-liste">
        {(grup.options || []).map((o) => (
          <li key={o.id} className={o.sold_out ? 'sonuk' : ''}>
            <span className="sg-ad">{o.name}</span>
            <span className="sg-fiyat">
              {mutlak ? para(o.price, simge) : Number(o.price) > 0 ? `+${para(o.price, simge)}` : '—'}
            </span>
            <button type="button" onClick={() => onSecenekTukendi(o)}>
              {o.sold_out ? 'Geri aç' : 'Bugün yok'}
            </button>
            <button type="button" className="sg-sil" onClick={() => onSecenekSil(o)}>
              ×
            </button>
          </li>
        ))}
        {!(grup.options || []).length ? <li className="p-yok">Seçenek yok.</li> : null}
      </ul>

      <div className="sg-yeni-secenek">
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          maxLength={40}
          placeholder={mutlak ? 'Orta boy' : 'Çedar peyniri'}
        />
        <input
          value={fiyat}
          onChange={(e) => setFiyat(e.target.value)}
          inputMode="decimal"
          placeholder={mutlak ? 'Fiyat' : 'Ek ücret'}
        />
        <button
          type="button"
          className="p-dugme-sade"
          onClick={() => {
            onSecenekEkle(ad, fiyat);
            setAd('');
            setFiyat('');
          }}
        >
          Ekle
        </button>
      </div>
    </section>
  );
}
