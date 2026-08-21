import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useMenuVerisi } from '../lib/kancalar';
import { fiyatiOku } from '../lib/bicim';
import { gorselYukle, gorselSil } from '../lib/gorsel';
import { usePanel, PanelBaslik } from './PanelLayout';
import ProductForm from './parts/ProductForm';
import ProductListRow from './parts/ProductListRow';

export default function Products() {
  const { ayarlar, bildirim, bildir } = usePanel();
  const { kategoriler, urunler, yukleniyor, yenile } = useMenuVerisi(true);

  const [suzgec, setSuzgec] = useState(0);
  const [duzenlenen, setDuzenlenen] = useState(null);
  const [formAcik, setFormAcik] = useState(false);

  const simge = ayarlar.currency || '₺';
  const kategoriAdlari = useMemo(
    () => Object.fromEntries(kategoriler.map((k) => [k.id, k.name])),
    [kategoriler]
  );

  const gosterilen = useMemo(
    () => (suzgec ? urunler.filter((u) => u.category_id === suzgec) : urunler),
    [urunler, suzgec]
  );

  /* ---------- Kaydetme ---------- */

  async function kaydet({ form, dosya, fotoSil }) {
    const fiyat = fiyatiOku(form.fiyatMetni);
    if (fiyat === null) {
      bildir('Fiyatı sayı olarak yazın, örneğin 200 veya 95,50.', 'hata');
      return;
    }
    if (!form.category_id) {
      bildir('Bir kategori seçin.', 'hata');
      return;
    }

    let gorselYolu = duzenlenen?.image_path || null;

    try {
      if (dosya) {
        const yeni = await gorselYukle(dosya);
        if (gorselYolu) await gorselSil(gorselYolu);
        gorselYolu = yeni;
      } else if (fotoSil && gorselYolu) {
        await gorselSil(gorselYolu);
        gorselYolu = null;
      }
    } catch (e) {
      bildir(e.message, 'hata');
      return;
    }

    const kayit = {
      category_id: Number(form.category_id),
      name: form.name.trim(),
      description: form.description.trim(),
      price: fiyat,
      image_path: gorselYolu,
      active: form.active,
      sold_out: form.sold_out,
      featured: form.featured,
      orderable: form.orderable !== false,
    };

    if (duzenlenen) {
      const { error } = await supabase.from('products').update(kayit).eq('id', duzenlenen.id);
      if (error) return bildir('Kaydedilemedi: ' + error.message, 'hata');
      bildir(`${kayit.name} güncellendi.`);
    } else {
      // Yeni ürün kategorinin sonuna eklensin.
      const ayniKategori = urunler.filter((u) => u.category_id === kayit.category_id);
      const sonSira = ayniKategori.reduce((m, u) => Math.max(m, u.position), 0);

      const { error } = await supabase.from('products').insert({ ...kayit, position: sonSira + 10 });
      if (error) return bildir('Eklenemedi: ' + error.message, 'hata');
      bildir(`${kayit.name} menüye eklendi.`);
      setSuzgec(kayit.category_id);
    }

    setDuzenlenen(null);
    setFormAcik(false);
    yenile();
  }

  /* ---------- Diğer işlemler ---------- */

  async function tukendiDegistir(urun) {
    const { error } = await supabase
      .from('products')
      .update({ sold_out: !urun.sold_out })
      .eq('id', urun.id);
    if (error) return bildir('İşlem yapılamadı: ' + error.message, 'hata');
    bildir(urun.sold_out ? `${urun.name} tekrar menüde.` : `${urun.name} bugün yok olarak işaretlendi.`);
    yenile();
  }

  async function sil(urun) {
    const onay = window.confirm(`${urun.name} menüden tamamen silinsin mi?`);
    if (!onay) return;

    const { error } = await supabase.from('products').delete().eq('id', urun.id);
    if (error) return bildir('Silinemedi: ' + error.message, 'hata');

    if (urun.image_path) await gorselSil(urun.image_path);
    bildir(`${urun.name} silindi.`);
    if (duzenlenen?.id === urun.id) {
      setDuzenlenen(null);
      setFormAcik(false);
    }
    yenile();
  }

  async function tasi(urun, yon) {
    const kardesler = urunler
      .filter((u) => u.category_id === urun.category_id)
      .sort((a, b) => a.position - b.position || a.id - b.id);

    const sira = kardesler.findIndex((u) => u.id === urun.id);
    const komsu = yon === 'yukari' ? kardesler[sira - 1] : kardesler[sira + 1];
    if (!komsu) return;

    const { error } = await supabase.rpc('swap_position', {
      tablo: 'products',
      id_a: urun.id,
      id_b: komsu.id,
    });
    if (error) return bildir('Sıra değiştirilemedi: ' + error.message, 'hata');
    yenile();
  }

  function duzenlemeyeAl(urun) {
    setDuzenlenen(urun);
    setFormAcik(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Görünüm ---------- */

  if (!yukleniyor && !kategoriler.length) {
    return (
      <>
        <PanelBaslik baslik="Ürünler" bildirim={bildirim} />
        <div className="p-kart p-bos">
          <p className="p-bos-baslik">Önce bir kategori gerekiyor</p>
          <p className="p-bos-alt">Ürün ekleyebilmek için en az bir kategori oluşturun.</p>
          <Link className="p-dugme" to="/panel/kategoriler">
            Kategorilere git
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PanelBaslik baslik="Ürünler" bildirim={bildirim} />

      <details
        className="p-acilir"
        open={formAcik}
        onToggle={(e) => {
          setFormAcik(e.target.open);
          if (!e.target.open) setDuzenlenen(null);
        }}
      >
        <summary>{duzenlenen ? `Ürünü düzenle: ${duzenlenen.name}` : '+ Yeni ürün ekle'}</summary>
        {formAcik ? (
          <ProductForm
            urun={duzenlenen}
            kategoriler={kategoriler}
            varsayilanKategori={suzgec}
            onKaydet={kaydet}
            onVazgec={() => {
              setDuzenlenen(null);
              setFormAcik(false);
            }}
          />
        ) : null}
      </details>

      <div className="p-suzgec">
        <button
          type="button"
          className={suzgec === 0 ? 'etkin' : ''}
          onClick={() => setSuzgec(0)}
        >
          Tümü
        </button>
        {kategoriler.map((k) => (
          <button
            key={k.id}
            type="button"
            className={suzgec === k.id ? 'etkin' : ''}
            onClick={() => setSuzgec(k.id)}
          >
            {k.name}
          </button>
        ))}
      </div>

      {yukleniyor ? (
        <p className="p-yok">Ürünler yükleniyor…</p>
      ) : !gosterilen.length ? (
        <div className="p-kart p-bos">
          <p className="p-bos-baslik">Bu kategoride ürün yok</p>
          <p className="p-bos-alt">
            Yukarıdaki “Yeni ürün ekle” bölümünden başlayın, ya da toplu ekleme ile bir seferde
            birçok ürün girin.
          </p>
          <Link className="p-dugme" to="/panel/toplu">
            Toplu ekle
          </Link>
        </div>
      ) : (
        <ul className="p-urunler">
          {gosterilen.map((u, i) => {
            const oncekiFarkli = i === 0 || gosterilen[i - 1].category_id !== u.category_id;
            const kardesler = urunler.filter((x) => x.category_id === u.category_id);
            const yer = kardesler.findIndex((x) => x.id === u.id);

            return (
              <div key={u.id} style={{ display: 'contents' }}>
                {suzgec === 0 && oncekiFarkli ? (
                  <li className="p-urun-baslik">{kategoriAdlari[u.category_id] || '—'}</li>
                ) : null}

                <ProductListRow
                  urun={u}
                  simge={simge}
                  ilkMi={yer === 0}
                  sonMu={yer === kardesler.length - 1}
                  onTasi={tasi}
                  onTukendi={tukendiDegistir}
                  onDuzenle={duzenlemeyeAl}
                  onSil={sil}
                />
              </div>
            );
          })}
        </ul>
      )}
    </>
  );
}
