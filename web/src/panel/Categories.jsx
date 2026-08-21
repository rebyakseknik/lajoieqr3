import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useMenuVerisi } from '../lib/kancalar';
import { usePanel, PanelBaslik } from './PanelLayout';

export default function Categories() {
  const { bildirim, bildir } = usePanel();
  const { kategoriler, urunler, yukleniyor, yenile } = useMenuVerisi(true);

  const [yeniAd, setYeniAd] = useState('');
  const [adlar, setAdlar] = useState({});
  const [formAcik, setFormAcik] = useState(false);

  // Düzenlenebilir ad kutularını gelen veriyle eşitle.
  useEffect(() => {
    setAdlar(Object.fromEntries(kategoriler.map((k) => [k.id, k.name])));
  }, [kategoriler]);

  const sayimlar = useMemo(() => {
    const s = {};
    urunler.forEach((u) => {
      s[u.category_id] = (s[u.category_id] || 0) + 1;
    });
    return s;
  }, [urunler]);

  async function ekle(e) {
    e.preventDefault();
    const ad = yeniAd.trim();
    if (!ad) return bildir('Kategori adı boş bırakılamaz.', 'hata');

    const sonSira = kategoriler.reduce((m, k) => Math.max(m, k.position), 0);
    const { error } = await supabase.from('categories').insert({ name: ad, position: sonSira + 10 });
    if (error) return bildir('Eklenemedi: ' + error.message, 'hata');

    bildir(`${ad} kategorisi eklendi.`);
    setYeniAd('');
    setFormAcik(false);
    yenile();
  }

  async function adiKaydet(kategori) {
    const ad = (adlar[kategori.id] || '').trim();
    if (!ad) return bildir('Kategori adı boş bırakılamaz.', 'hata');
    if (ad === kategori.name) return;

    const { error } = await supabase.from('categories').update({ name: ad }).eq('id', kategori.id);
    if (error) return bildir('Kaydedilemedi: ' + error.message, 'hata');
    bildir('Kategori adı güncellendi.');
    yenile();
  }

  async function gizleGoster(kategori) {
    const { error } = await supabase
      .from('categories')
      .update({ active: !kategori.active })
      .eq('id', kategori.id);
    if (error) return bildir('İşlem yapılamadı: ' + error.message, 'hata');
    yenile();
  }

  async function tasi(kategori, yon) {
    const sirali = [...kategoriler].sort((a, b) => a.position - b.position || a.id - b.id);
    const yer = sirali.findIndex((k) => k.id === kategori.id);
    const komsu = yon === 'yukari' ? sirali[yer - 1] : sirali[yer + 1];
    if (!komsu) return;

    const { error } = await supabase.rpc('swap_position', {
      tablo: 'categories',
      id_a: kategori.id,
      id_b: komsu.id,
    });
    if (error) return bildir('Sıra değiştirilemedi: ' + error.message, 'hata');
    yenile();
  }

  async function sil(kategori) {
    if ((sayimlar[kategori.id] || 0) > 0) {
      return bildir(
        'Bu kategoride ürünler var. Önce ürünleri silin veya başka kategoriye taşıyın.',
        'hata'
      );
    }
    if (!window.confirm(`${kategori.name} kategorisi silinsin mi?`)) return;

    const { error } = await supabase.from('categories').delete().eq('id', kategori.id);
    if (error) return bildir('Silinemedi: ' + error.message, 'hata');
    bildir('Kategori silindi.');
    yenile();
  }

  const sirali = [...kategoriler].sort((a, b) => a.position - b.position || a.id - b.id);

  return (
    <>
      <PanelBaslik baslik="Kategoriler" bildirim={bildirim} />

      <details className="p-acilir" open={formAcik} onToggle={(e) => setFormAcik(e.target.open)}>
        <summary>+ Yeni kategori ekle</summary>
        <form className="p-form" onSubmit={ekle}>
          <label htmlFor="yeni-kategori">Kategori adı</label>
          <input
            id="yeni-kategori"
            value={yeniAd}
            onChange={(e) => setYeniAd(e.target.value)}
            maxLength={80}
            placeholder="TATLILAR"
            required
          />
          <p className="p-ipucu">
            Menüde göründüğü gibi yazın. Büyük harf kullanmak menüde daha net durur.
          </p>
          <div className="p-form-dip">
            <button type="submit" className="p-dugme">
              Kategoriyi ekle
            </button>
          </div>
        </form>
      </details>

      {yukleniyor ? (
        <p className="p-yok">Kategoriler yükleniyor…</p>
      ) : !sirali.length ? (
        <div className="p-kart p-bos">
          <p className="p-bos-baslik">Henüz kategori yok</p>
          <p className="p-bos-alt">Menünüzü bölümlere ayırmak için ilk kategoriyi ekleyin.</p>
        </div>
      ) : (
        <ul className="p-kategoriler">
          {sirali.map((k, i) => (
            <li key={k.id} className={`p-kategori${k.active ? '' : ' pasif'}`}>
              <div className="p-kategori-ad">
                <input
                  value={adlar[k.id] ?? ''}
                  onChange={(e) => setAdlar((o) => ({ ...o, [k.id]: e.target.value }))}
                  maxLength={80}
                  aria-label="Kategori adı"
                />
                <button type="button" className="p-kucuk-dugme" onClick={() => adiKaydet(k)}>
                  Kaydet
                </button>
              </div>

              <p className="p-kategori-sayi">
                {sayimlar[k.id] || 0} ürün
                {!k.active ? <span className="p-etiket">gizli</span> : null}
              </p>

              <div className="p-urun-islem">
                <button
                  type="button"
                  className="p-ok"
                  title="Yukarı taşı"
                  disabled={i === 0}
                  onClick={() => tasi(k, 'yukari')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="p-ok"
                  title="Aşağı taşı"
                  disabled={i === sirali.length - 1}
                  onClick={() => tasi(k, 'asagi')}
                >
                  ↓
                </button>
                <button type="button" className="p-kucuk-dugme" onClick={() => gizleGoster(k)}>
                  {k.active ? 'Gizle' : 'Göster'}
                </button>
                <Link className="p-kucuk-dugme" to="/panel/urunler">
                  Ürünler
                </Link>
                <button
                  type="button"
                  className="p-kucuk-dugme p-tehlike"
                  onClick={() => sil(k)}
                >
                  Sil
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
