import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { para, fiyatiOku } from '../lib/bicim';
import { usePanel, PanelBaslik } from './PanelLayout';
import Kart from './parts/Kart';

function tarihYaz(t) {
  if (!t) return 'süresiz';
  return new Date(t).toLocaleDateString('tr-TR');
}

export default function Coupons() {
  const { ayarlar, bildirim, bildir } = usePanel();
  const simge = ayarlar.currency || '₺';

  const [kuponlar, setKuponlar] = useState([]);
  const [kartlar, setKartlar] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  /* Yeni kupon formu */
  const [kod, setKod] = useState('');
  const [tur, setTur] = useState('percent');
  const [deger, setDeger] = useState('10');
  const [minTutar, setMinTutar] = useState('');
  const [tavan, setTavan] = useState('');
  const [bitis, setBitis] = useState('');
  const [limit, setLimit] = useState('');
  const [kisiBasi, setKisiBasi] = useState('1');
  const [uyeler, setUyeler] = useState(false);
  const [kuponNot, setKuponNot] = useState('');
  const [kuponBekliyor, setKuponBekliyor] = useState(false);

  /* Yeni hediye kartı formu */
  const [kartTutar, setKartTutar] = useState('');
  const [kartAdet, setKartAdet] = useState('1');
  const [kartBitis, setKartBitis] = useState('');
  const [kartNot, setKartNot] = useState('');
  const [kartBekliyor, setKartBekliyor] = useState(false);
  const [uretilen, setUretilen] = useState([]);

  const getir = useCallback(async () => {
    const [k, h] = await Promise.all([
      // Kampanyalardan üretilen kişiye özel kuponlar buraya karışmasın;
      // onlar Kampanyalar ekranından toplu olarak izlenir.
      supabase
        .from('coupons')
        .select('*')
        .is('owner_id', null)
        .order('created_at', { ascending: false }),
      supabase.from('gift_cards').select('*').order('created_at', { ascending: false }).limit(100),
    ]);

    if (k.error || h.error) bildir((k.error || h.error).message, 'hata');
    setKuponlar(k.data || []);
    setKartlar(h.data || []);
    setYukleniyor(false);
  }, [bildir]);

  useEffect(() => {
    getir();
  }, [getir]);

  async function kuponEkle(e) {
    e.preventDefault();
    const sayi = fiyatiOku(deger);
    if (sayi === null || sayi <= 0) return bildir('Geçerli bir değer yazın.', 'hata');

    setKuponBekliyor(true);
    const { data, error } = await supabase.rpc('kupon_olustur', {
      p_kod: kod,
      p_tur: tur,
      p_deger: sayi,
      p_min: fiyatiOku(minTutar) ?? 0,
      p_tavan: fiyatiOku(tavan) ?? 0,
      p_bitis: bitis ? new Date(`${bitis}T23:59:59`).toISOString() : null,
      p_limit: Number(limit) || 0,
      p_kisi: Number(kisiBasi) || 0,
      p_uye: uyeler,
      p_not: kuponNot,
    });
    setKuponBekliyor(false);

    if (error) return bildir(error.message, 'hata');
    bildir(`${data.kod} kuponu oluşturuldu.`);
    setKod('');
    setKuponNot('');
    getir();
  }

  async function kartUret(e) {
    e.preventDefault();
    const tutar = fiyatiOku(kartTutar);
    if (tutar === null || tutar <= 0) return bildir('Geçerli bir tutar yazın.', 'hata');

    setKartBekliyor(true);
    const { data, error } = await supabase.rpc('hediye_olustur', {
      p_tutar: tutar,
      p_bitis: kartBitis ? new Date(`${kartBitis}T23:59:59`).toISOString() : null,
      p_not: kartNot,
      p_adet: Number(kartAdet) || 1,
    });
    setKartBekliyor(false);

    if (error) return bildir(error.message, 'hata');
    setUretilen(data || []);
    bildir(`${(data || []).length} hediye kartı üretildi.`);
    getir();
  }

  async function kuponSil(k) {
    if (!window.confirm(`"${k.code}" kuponu silinsin mi? Bu geri alınamaz.`)) return;
    const { error } = await supabase.rpc('kupon_sil', { p_id: k.id });
    if (error) return bildir(error.message, 'hata');
    bildir('Kupon silindi.');
    getir();
  }

  async function kartSil(h) {
    if (!window.confirm(`"${h.code}" hediye kartı silinsin mi? Bu geri alınamaz.`)) return;
    const { error } = await supabase.rpc('hediye_sil', { p_id: h.id });
    if (error) return bildir(error.message, 'hata');
    bildir('Kart silindi.');
    getir();
  }

  async function kuponDurdur(k) {
    const { error } = await supabase.rpc('kupon_durdur', { p_id: k.id, p_aktif: !k.active });
    if (error) return bildir(error.message, 'hata');
    getir();
  }

  async function kartDurdur(h) {
    const { error } = await supabase.rpc('hediye_durdur', { p_id: h.id, p_aktif: !h.active });
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

  return (
    <>
      <PanelBaslik baslik="Kuponlar ve hediye kartları" bildirim={bildirim} />

      {/* ---------- Yeni kupon ---------- */}
      <form className="p-form p-kart" onSubmit={kuponEkle}>
        <h2 className="p-kart-baslik">Yeni indirim kuponu</h2>
        <p className="p-kart-alt">
          Kupon indirim yapar. Müşteri sepette kodu yazar, indirimi veritabanı hesaplar.
        </p>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="kod">Kod</label>
            <input
              id="kod"
              value={kod}
              onChange={(e) => setKod(e.target.value.toUpperCase())}
              maxLength={24}
              placeholder="Boş bırakırsanız üretilir"
            />
          </div>
          <div>
            <label htmlFor="tur">Türü</label>
            <select id="tur" value={tur} onChange={(e) => setTur(e.target.value)}>
              <option value="percent">Yüzde indirim</option>
              <option value="amount">Tutar indirimi</option>
            </select>
          </div>
        </div>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="deger">{tur === 'percent' ? 'Yüzde (%)' : `Tutar (${simge})`}</label>
            <input
              id="deger"
              inputMode="decimal"
              value={deger}
              onChange={(e) => setDeger(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="min">En az sipariş tutarı</label>
            <input
              id="min"
              inputMode="decimal"
              value={minTutar}
              onChange={(e) => setMinTutar(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {tur === 'percent' ? (
          <>
            <label htmlFor="tavan">En fazla indirim ({simge})</label>
            <input
              id="tavan"
              inputMode="decimal"
              value={tavan}
              onChange={(e) => setTavan(e.target.value)}
              placeholder="Boş = sınırsız"
              style={{ maxWidth: 200 }}
            />
            <p className="p-ipucu">
              %50 gibi büyük indirimlerde tavan koymazsanız pahalı bir siparişte
              beklediğinizden fazlasını verebilirsiniz.
            </p>
          </>
        ) : null}

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="limit">Toplam kullanım hakkı</label>
            <input
              id="limit"
              inputMode="numeric"
              value={limit}
              onChange={(e) => setLimit(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Boş = sınırsız"
            />
          </div>
          <div>
            <label htmlFor="kisi">Kişi başı kullanım</label>
            <input
              id="kisi"
              inputMode="numeric"
              value={kisiBasi}
              onChange={(e) => setKisiBasi(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="1"
            />
          </div>
        </div>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="bitis">Son geçerlilik günü</label>
            <input id="bitis" type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} />
          </div>
          <div>
            <label htmlFor="knot">Not (yalnızca panelde görünür)</label>
            <input
              id="knot"
              value={kuponNot}
              onChange={(e) => setKuponNot(e.target.value)}
              maxLength={120}
              placeholder="Instagram kampanyası"
            />
          </div>
        </div>

        <label className="p-onay">
          <input type="checkbox" checked={uyeler} onChange={(e) => setUyeler(e.target.checked)} />
          Yalnızca üye girişi yapanlar kullanabilsin
        </label>

        <div className="p-form-dip">
          <button type="submit" className="p-dugme" disabled={kuponBekliyor}>
            {kuponBekliyor ? 'Oluşturuluyor…' : 'Kuponu oluştur'}
          </button>
        </div>
      </form>

      {/* ---------- Kupon listesi ---------- */}
      <Kart>
        <h2 className="p-kart-baslik">Herkese açık kuponlar</h2>
        <p className="p-kart-alt">
          Kişiye özel kampanya kuponları burada listelenmez — onların özeti
          Kampanyalar ekranındadır.
        </p>
        {yukleniyor ? (
          <p className="p-yok">Yükleniyor…</p>
        ) : !kuponlar.length ? (
          <p className="p-yok">Henüz kupon yok.</p>
        ) : (
          <ul className="k-liste">
            {kuponlar.map((k) => (
              <li key={k.id} className={k.active ? '' : 'sonuk'}>
                <button type="button" className="k-kod" onClick={() => kopyala(k.code)}>
                  {k.code}
                </button>

                <span className="k-bilgi">
                  <b>
                    {k.kind === 'percent'
                      ? `%${Number(k.value)}`
                      : para(k.value, simge)}{' '}
                    indirim
                  </b>
                  <small>
                    {Number(k.min_total) > 0 ? `min ${para(k.min_total, simge)} · ` : ''}
                    {k.usage_limit > 0
                      ? `${k.used_count}/${k.usage_limit} kullanıldı`
                      : `${k.used_count} kullanıldı`}
                    {' · '}
                    {tarihYaz(k.ends_at)}
                    {k.members_only ? ' · üyelere özel' : ''}
                    {k.note ? ` · ${k.note}` : ''}
                  </small>
                </span>

                <button type="button" className="k-durdur" onClick={() => kuponDurdur(k)}>
                  {k.active ? 'Durdur' : 'Aç'}
                </button>
                {k.used_count === 0 ? (
                  <button type="button" className="k-sil" onClick={() => kuponSil(k)}>
                    Sil
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Kart>

      {/* ---------- Yeni hediye kartı ---------- */}
      <form className="p-form p-kart" onSubmit={kartUret}>
        <h2 className="p-kart-baslik">Hediye kartı üret</h2>
        <p className="p-kart-alt">
          Hediye kartı bakiye taşır ve kısmen harcanabilir; kalan tutar kartta kalır.
          Kodu yazdırıp verebilir ya da kasada satabilirsiniz.
        </p>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="ktutar">Kart tutarı ({simge})</label>
            <input
              id="ktutar"
              inputMode="decimal"
              value={kartTutar}
              onChange={(e) => setKartTutar(e.target.value)}
              placeholder="250"
              required
            />
          </div>
          <div>
            <label htmlFor="kadet">Kaç adet</label>
            <input
              id="kadet"
              inputMode="numeric"
              value={kartAdet}
              onChange={(e) => setKartAdet(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="1"
            />
          </div>
        </div>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="kbitis">Son kullanma günü</label>
            <input
              id="kbitis"
              type="date"
              value={kartBitis}
              onChange={(e) => setKartBitis(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="knot2">Not</label>
            <input
              id="knot2"
              value={kartNot}
              onChange={(e) => setKartNot(e.target.value)}
              maxLength={120}
              placeholder="Yılbaşı hediyesi"
            />
          </div>
        </div>

        <div className="p-form-dip">
          <button type="submit" className="p-dugme" disabled={kartBekliyor}>
            {kartBekliyor ? 'Üretiliyor…' : 'Hediye kartı üret'}
          </button>
        </div>

        {uretilen.length ? (
          <div className="k-uretilen">
            <p className="p-kart-alt">
              Üretilen kodlar — bu liste sayfayı yenileyince kaybolur, şimdi kopyalayın:
            </p>
            <ul>
              {uretilen.map((u) => (
                <li key={u.code}>
                  <code>{u.code}</code>
                  <span>{para(u.balance, simge)}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="p-dugme-sade"
              onClick={() => kopyala(uretilen.map((u) => u.code).join('\n'))}
            >
              Hepsini kopyala
            </button>
          </div>
        ) : null}
      </form>

      {/* ---------- Kart listesi ---------- */}
      <Kart>
        <h2 className="p-kart-baslik">Hediye kartları</h2>
        {yukleniyor ? (
          <p className="p-yok">Yükleniyor…</p>
        ) : !kartlar.length ? (
          <p className="p-yok">Henüz kart yok.</p>
        ) : (
          <ul className="k-liste">
            {kartlar.map((h) => (
              <li key={h.id} className={h.active && Number(h.balance) > 0 ? '' : 'sonuk'}>
                <button type="button" className="k-kod" onClick={() => kopyala(h.code)}>
                  {h.code}
                </button>

                <span className="k-bilgi">
                  <b>{para(h.balance, simge)}</b>
                  <small>
                    {Number(h.balance) < Number(h.initial)
                      ? `${para(h.initial, simge)} yüklendi · `
                      : ''}
                    {tarihYaz(h.expires_at)}
                    {h.buyer_note ? ` · ${h.buyer_note}` : ''}
                  </small>
                </span>

                <button type="button" className="k-durdur" onClick={() => kartDurdur(h)}>
                  {h.active ? 'Durdur' : 'Aç'}
                </button>
                {Number(h.balance) === Number(h.initial) ? (
                  <button type="button" className="k-sil" onClick={() => kartSil(h)}>
                    Sil
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </>
  );
}
