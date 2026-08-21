import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, gorselAdresi } from '../lib/supabase';
import { gorselYukle, gorselSil } from '../lib/gorsel';
import { usePanel, PanelBaslik } from './PanelLayout';
import Kart from './parts/Kart';

export default function Announcements() {
  const { bildirim, bildir } = usePanel();

  const [liste, setListe] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  /* Form */
  const [baslik, setBaslik] = useState('');
  const [metin, setMetin] = useState('');
  const [baglanti, setBaglanti] = useState('');
  const [gorselYolu, setGorselYolu] = useState('');
  const [gorselBekliyor, setGorselBekliyor] = useState(false);
  const [kaydediyor, setKaydediyor] = useState(false);
  const dosyaRef = useRef(null);

  const getir = useCallback(async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('sort', { ascending: true })
      .order('id', { ascending: false });

    if (error) bildir(error.message, 'hata');
    setListe(data || []);
    setYukleniyor(false);
  }, [bildir]);

  useEffect(() => {
    getir();
  }, [getir]);

  async function fotografSec(e) {
    const dosya = e.target.files?.[0];
    e.target.value = '';
    if (!dosya) return;

    setGorselBekliyor(true);
    try {
      // Duyuru fotoğrafları ürünlerle aynı kovada, "duyuru/" klasöründe durur.
      setGorselYolu(await gorselYukle(dosya, 'duyuru'));
    } catch (hata) {
      bildir(hata.message, 'hata');
    }
    setGorselBekliyor(false);
  }

  async function ekle(e) {
    e.preventDefault();
    if (baslik.trim().length < 2) return bildir('Başlık yazın.', 'hata');

    const link = baglanti.trim();
    if (link && !/^(\/|https?:\/\/)/.test(link)) {
      return bildir('Bağlantı / ile başlamalı (iç sayfa) ya da https:// ile (dış adres).', 'hata');
    }

    setKaydediyor(true);
    const enBuyukSira = liste.reduce((t, d) => Math.max(t, d.sort), 0);

    const { error } = await supabase.from('announcements').insert({
      title: baslik.trim(),
      body: metin.trim(),
      image_path: gorselYolu,
      link_url: link,
      sort: enBuyukSira + 1,
    });
    setKaydediyor(false);

    if (error) return bildir(error.message, 'hata');
    bildir('Duyuru yayında.');
    setBaslik('');
    setMetin('');
    setBaglanti('');
    setGorselYolu('');
    getir();
  }

  async function durumDegistir(d) {
    const { error } = await supabase
      .from('announcements')
      .update({ active: !d.active })
      .eq('id', d.id);
    if (error) return bildir(error.message, 'hata');
    getir();
  }

  async function sil(d) {
    if (!window.confirm(`"${d.title}" duyurusu silinsin mi?`)) return;
    const { error } = await supabase.from('announcements').delete().eq('id', d.id);
    if (error) return bildir(error.message, 'hata');
    if (d.image_path) gorselSil(d.image_path);
    bildir('Duyuru silindi.');
    getir();
  }

  /* Sırayı komşusuyla değiştirir. */
  async function tasi(d, yon) {
    const sirali = [...liste].sort((a, b) => a.sort - b.sort || b.id - a.id);
    const i = sirali.findIndex((x) => x.id === d.id);
    const j = i + yon;
    if (j < 0 || j >= sirali.length) return;

    const digeri = sirali[j];
    await Promise.all([
      supabase.from('announcements').update({ sort: digeri.sort }).eq('id', d.id),
      supabase.from('announcements').update({ sort: d.sort }).eq('id', digeri.id),
    ]);
    getir();
  }

  return (
    <>
      <PanelBaslik baslik="Duyurular" bildirim={bildirim} />

      <Kart>
        <p className="p-kart-alt" style={{ marginTop: 0 }}>
          Duyurular menünün en üstünde, kaydırılabilir kartlar halinde döner.
          Kampanya tanıtın, yeni ürünü haber verin, bayram saatlerinizi yazın.
          Bağlantı alanına <code>/kayit/hosgeldin</code> gibi bir kampanya adresi
          yazarsanız kart doğrudan kayıt akışına götürür.
        </p>
      </Kart>

      {/* ---------- Yeni duyuru ---------- */}
      <form className="p-form p-kart" onSubmit={ekle}>
        <h2 className="p-kart-baslik">Yeni duyuru</h2>

        <label htmlFor="dbaslik">Başlık</label>
        <input
          id="dbaslik"
          value={baslik}
          onChange={(e) => setBaslik(e.target.value)}
          maxLength={60}
          placeholder="Öğle araları %10 hoş geldin indirimi"
          required
        />

        <label htmlFor="dmetin">Kısa metin</label>
        <input
          id="dmetin"
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          maxLength={160}
          placeholder="Hesap açan herkese ilk siparişte geçerli"
        />

        <label htmlFor="dlink">Bağlantı (isteğe bağlı)</label>
        <input
          id="dlink"
          value={baglanti}
          onChange={(e) => setBaglanti(e.target.value)}
          maxLength={200}
          placeholder="/kayit/hosgeldin ya da https://instagram.com/…"
        />

        <label>Fotoğraf (isteğe bağlı)</label>
        <div className="d-foto-satir">
          {gorselYolu ? (
            <img className="d-foto-onizle" src={gorselAdresi(gorselYolu)} alt="" />
          ) : null}
          <button
            type="button"
            className="p-dugme-sade"
            disabled={gorselBekliyor}
            onClick={() => dosyaRef.current?.click()}
          >
            {gorselBekliyor ? 'Yükleniyor…' : gorselYolu ? 'Fotoğrafı değiştir' : 'Fotoğraf seç'}
          </button>
          {gorselYolu ? (
            <button
              type="button"
              className="p-dugme-sade"
              onClick={() => {
                gorselSil(gorselYolu);
                setGorselYolu('');
              }}
            >
              Kaldır
            </button>
          ) : null}
          <input
            ref={dosyaRef}
            type="file"
            accept="image/*"
            hidden
            onChange={fotografSec}
          />
        </div>
        <p className="p-ipucu">
          Yatay fotoğraflar en iyi görünür; kart 5:3 oranında kırpar. Fotoğraf
          seçmezseniz kart düz renkli açılır, o da şık durur.
        </p>

        <div className="p-form-dip">
          <button type="submit" className="p-dugme" disabled={kaydediyor || gorselBekliyor}>
            {kaydediyor ? 'Kaydediliyor…' : 'Duyuruyu yayınla'}
          </button>
        </div>
      </form>

      {/* ---------- Liste ---------- */}
      <Kart>
        <h2 className="p-kart-baslik">Yayındakiler</h2>

        {yukleniyor ? (
          <p className="p-yok">Yükleniyor…</p>
        ) : !liste.length ? (
          <p className="p-yok">Henüz duyuru yok.</p>
        ) : (
          <ul className="d-liste">
            {liste.map((d, i) => (
              <li key={d.id} className={d.active ? '' : 'sonuk'}>
                {d.image_path ? (
                  <img className="d-kucuk" src={gorselAdresi(d.image_path)} alt="" />
                ) : (
                  <span className="d-kucuk d-kucuk-bos" aria-hidden="true" />
                )}

                <div className="d-bilgi">
                  <b>{d.title}</b>
                  <small>
                    {d.body || '—'}
                    {d.link_url ? ` · ${d.link_url}` : ''}
                  </small>
                </div>

                <div className="d-eylem">
                  <button type="button" aria-label="Yukarı taşı" disabled={i === 0} onClick={() => tasi(d, -1)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Aşağı taşı"
                    disabled={i === liste.length - 1}
                    onClick={() => tasi(d, 1)}
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => durumDegistir(d)}>
                    {d.active ? 'Gizle' : 'Yayınla'}
                  </button>
                  <button type="button" className="d-sil" onClick={() => sil(d)}>
                    Sil
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </>
  );
}
