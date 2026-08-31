import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { usePanel, PanelBaslik } from './PanelLayout';

const ALANLAR = [
  { anahtar: 'restaurant_name', etiket: 'Restoran adı', sinir: 120, zorunlu: true },
  { anahtar: 'tagline', etiket: 'Alt başlık', sinir: 120, ipucu: 'Mersin · Dershaneler Sokağı' },
  { anahtar: 'farewell', etiket: 'Menü sonundaki karşılama sözü', sinir: 80, ipucu: 'Afiyet olsun' },
  { anahtar: 'phone', etiket: 'Telefon', sinir: 40, ipucu: '0324 000 00 00', ikili: true },
  { anahtar: 'instagram', etiket: 'Instagram kullanıcı adı', sinir: 60, ipucu: 'lajoiemersin', ikili: true },
  { anahtar: 'address', etiket: 'Adres', sinir: 200, ipucu: 'Dershaneler Sokağı, Mersin' },
  { anahtar: 'currency', etiket: 'Para simgesi', sinir: 5, dar: true },
  { anahtar: 'address', etiket: 'Adres', sinir: 120 },
  { anahtar: 'hours', etiket: 'Çalışma saatleri', sinir: 60 },
  { anahtar: 'phone', etiket: 'Telefon', sinir: 24, dar: true },
  { anahtar: 'instagram', etiket: 'Instagram kullanıcı adı', sinir: 40, dar: true },
  { anahtar: 'maps_url', etiket: 'Google Haritalar bağlantısı', sinir: 200 },
  { anahtar: 'hero_note', etiket: 'Ana sayfa sloganı', sinir: 60 },
  { anahtar: 'about_text', etiket: 'Ana sayfa tanıtım metni', sinir: 300 },
];

/** Ön sipariş ayarları ayrı bir kartta durur; kaydetmesi de ayrıdır. */
const SIPARIS_ALANLARI = [
  { anahtar: 'preorder_start' },
  { anahtar: 'preorder_end' },
  { anahtar: 'preorder_step' },
  { anahtar: 'preorder_lead' },
  { anahtar: 'preorder_capacity' },
  { anahtar: 'preorder_start_no' },
  { anahtar: 'preorder_note' },
];

export default function Settings() {
  const { ayarlar, ayarlariYenile, bildirim, bildir } = usePanel();

  const [form, setForm] = useState({});
  const [kaydediyor, setKaydediyor] = useState(false);

  const [yeniSifre, setYeniSifre] = useState('');
  const [yeniSifre2, setYeniSifre2] = useState('');
  const [sifreBekliyor, setSifreBekliyor] = useState(false);

  const [gun, setGun] = useState('365');
  const [siparisKaydediyor, setSiparisKaydediyor] = useState(false);

  useEffect(() => {
    setForm(ayarlar);
  }, [ayarlar]);

  function degistir(anahtar, deger) {
    setForm((o) => ({ ...o, [anahtar]: deger }));
  }

  async function bilgileriKaydet(e) {
    e.preventDefault();
    setKaydediyor(true);

    const kayitlar = ALANLAR.map((a) => ({
      key: a.anahtar,
      value: String(form[a.anahtar] ?? '').trim().slice(0, a.sinir),
    }));

    // Boş bırakılmaması gereken iki alan
    const ad = kayitlar.find((k) => k.key === 'restaurant_name');
    if (!ad.value) ad.value = 'La Joie';
    const simge = kayitlar.find((k) => k.key === 'currency');
    if (!simge.value) simge.value = '₺';

    const { error } = await supabase.from('settings').upsert(kayitlar, { onConflict: 'key' });
    setKaydediyor(false);

    if (error) return bildir('Kaydedilemedi: ' + error.message, 'hata');
    bildir('Bilgiler kaydedildi.');
    ayarlariYenile();
  }

  async function siparisKaydet(e) {
    e.preventDefault();
    setSiparisKaydediyor(true);

    const kayitlar = SIPARIS_ALANLARI.map((a) => ({
      key: a.anahtar,
      value: String(form[a.anahtar] ?? '').trim(),
    }));
    kayitlar.push({ key: 'preorder_enabled', value: form.preorder_enabled === '1' ? '1' : '0' });
    kayitlar.push({ key: 'auth_method', value: form.auth_method === 'phone' ? 'phone' : 'email' });
    kayitlar.push({
      key: 'preorder_require_login',
      value: form.preorder_require_login === '1' ? '1' : '0',
    });

    // İkisi birden kapanırsa sipariş alınamaz; kasadayı geri açıyoruz.
    const online = form.payment_online_enabled === '1';
    const nakit = form.payment_cash_enabled !== '0';
    kayitlar.push({ key: 'payment_online_enabled', value: online ? '1' : '0' });
    kayitlar.push({ key: 'payment_cash_enabled', value: !nakit && !online ? '1' : (nakit ? '1' : '0') });

    const { error } = await supabase.from('settings').upsert(kayitlar, { onConflict: 'key' });
    setSiparisKaydediyor(false);

    if (error) return bildir('Kaydedilemedi: ' + error.message, 'hata');
    bildir('Ön sipariş ayarları kaydedildi.');
    ayarlariYenile();
  }

  async function sifreDegistir(e) {
    e.preventDefault();

    if (yeniSifre.length < 8) return bildir('Yeni şifre en az 8 karakter olmalı.', 'hata');
    if (yeniSifre !== yeniSifre2) return bildir('Yeni şifreler birbirini tutmuyor.', 'hata');

    setSifreBekliyor(true);
    const { error } = await supabase.auth.updateUser({ password: yeniSifre });
    setSifreBekliyor(false);

    if (error) return bildir('Şifre değiştirilemedi: ' + error.message, 'hata');
    bildir('Şifreniz değiştirildi.');
    setYeniSifre('');
    setYeniSifre2('');
  }

  async function istatistikTemizle(e) {
    e.preventDefault();
    if (!window.confirm('Seçilen tarihten eski istatistik kayıtları kalıcı olarak silinecek. Devam edilsin mi?'))
      return;

    const { data, error } = await supabase.rpc('stats_prune', { gun: Number(gun) });
    if (error) return bildir('Silinemedi: ' + error.message, 'hata');
    bildir(`${data ?? 0} eski istatistik kaydı silindi.`);
  }

  const ikililer = ALANLAR.filter((a) => a.ikili);
  const tekliler = ALANLAR.filter((a) => !a.ikili);

  function alanCiz(a) {
    return (
      <div key={a.anahtar}>
        <label htmlFor={a.anahtar}>{a.etiket}</label>
        <input
          id={a.anahtar}
          value={form[a.anahtar] ?? ''}
          onChange={(e) => degistir(a.anahtar, e.target.value)}
          maxLength={a.sinir}
          placeholder={a.ipucu}
          required={a.zorunlu}
          style={a.dar ? { maxWidth: 120 } : undefined}
        />
      </div>
    );
  }

  return (
    <>
      <PanelBaslik baslik="Ayarlar" bildirim={bildirim} />

      <form className="p-form p-kart" onSubmit={bilgileriKaydet}>
        <h2 className="p-kart-baslik">Restoran bilgileri</h2>
        <p className="p-kart-alt">Bu bilgiler menünün başında ve altında görünür.</p>

        {tekliler.slice(0, 3).map(alanCiz)}

        <div className="p-ikili-alan">{ikililer.map(alanCiz)}</div>

        {tekliler.slice(3).map(alanCiz)}

        <div className="p-form-dip">
          <button type="submit" className="p-dugme" disabled={kaydediyor}>
            {kaydediyor ? 'Kaydediliyor…' : 'Bilgileri kaydet'}
          </button>
        </div>
      </form>

      <form className="p-form p-kart" onSubmit={siparisKaydet}>
        <h2 className="p-kart-baslik">Ön sipariş</h2>
        <p className="p-kart-alt">
          Öğle arası kısıtlı olan müşteriler menüden seçip önden sipariş bırakabilir.
          Kendilerine bir sanal masa numarası verilir; aynı numara Siparişler ekranına düşer.
        </p>

        <label className="p-onay">
          <input
            type="checkbox"
            checked={form.preorder_enabled === '1'}
            onChange={(e) => degistir('preorder_enabled', e.target.checked ? '1' : '0')}
          />
          Ön sipariş alımı açık
        </label>

        <div className="p-ikili-alan" style={{ marginTop: 18 }}>
          <div>
            <label htmlFor="preorder_start">İlk teslim saati</label>
            <input
              id="preorder_start"
              type="time"
              value={form.preorder_start ?? '11:30'}
              onChange={(e) => degistir('preorder_start', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="preorder_end">Son teslim saati</label>
            <input
              id="preorder_end"
              type="time"
              value={form.preorder_end ?? '14:30'}
              onChange={(e) => degistir('preorder_end', e.target.value)}
            />
          </div>
        </div>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="preorder_step">Saat aralığı (dakika)</label>
            <input
              id="preorder_step"
              inputMode="numeric"
              value={form.preorder_step ?? '15'}
              onChange={(e) => degistir('preorder_step', e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <div>
            <label htmlFor="preorder_lead">Hazırlık payı (dakika)</label>
            <input
              id="preorder_lead"
              inputMode="numeric"
              value={form.preorder_lead ?? '20'}
              onChange={(e) => degistir('preorder_lead', e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
        </div>
        <p className="p-ipucu">
          Hazırlık payı, müşterinin en erken kaç dakika sonrası için sipariş verebileceğidir.
          Mutfak yetişemiyorsa bu sayıyı büyütün.
        </p>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="preorder_capacity">Bir saatte alınacak sipariş</label>
            <input
              id="preorder_capacity"
              inputMode="numeric"
              value={form.preorder_capacity ?? '6'}
              onChange={(e) => degistir('preorder_capacity', e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <div>
            <label htmlFor="preorder_start_no">Sanal masa numaraları başlangıcı</label>
            <input
              id="preorder_start_no"
              inputMode="numeric"
              value={form.preorder_start_no ?? '101'}
              onChange={(e) => degistir('preorder_start_no', e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
        </div>
        <p className="p-ipucu">
          Numaralar her gün baştan başlar. Salondaki gerçek masalarla karışmasın diye
          101 gibi yüksek bir sayıdan başlatmak işinizi kolaylaştırır.
        </p>

        <label className="p-onay">
          <input
            type="checkbox"
            checked={form.preorder_require_login === '1'}
            onChange={(e) => degistir('preorder_require_login', e.target.checked ? '1' : '0')}
          />
          Sipariş için üye girişi zorunlu olsun
        </label>
        <p className="p-ipucu">
          Açıkken her sipariş doğrulanmış bir hesaba bağlanır; sahte siparişi
          zorlaştırır. Menüye bakmak her zaman herkese açıktır. Sipariş sayınız
          belirgin düşerse buradan kapatıp misafir siparişine dönebilirsiniz.
        </p>

        <label htmlFor="auth_method">Üye girişi yöntemi</label>
        <select
          id="auth_method"
          value={form.auth_method ?? 'email'}
          onChange={(e) => degistir('auth_method', e.target.value)}
          style={{ maxWidth: 280 }}
        >
          <option value="email">E-posta + şifre</option>
          <option value="phone">Telefon + SMS kodu</option>
        </select>
        <p className="p-ipucu">
          SMS seçeneği için Supabase panelinde bir SMS sağlayıcısı tanımlı olmalı
          (Authentication → Providers → Phone). Sağlayıcı yoksa kod gönderilemez;
          müşteri e-posta ile devam edebilir.
        </p>

        <p className="p-kart-alt" style={{ marginTop: 22, marginBottom: 10 }}>
          <strong>Ödeme seçenekleri</strong>
        </p>

        <label className="p-onay">
          <input
            type="checkbox"
            checked={form.payment_cash_enabled !== '0'}
            onChange={(e) => degistir('payment_cash_enabled', e.target.checked ? '1' : '0')}
          />
          Kasada ödeme
        </label>
        <label className="p-onay">
          <input
            type="checkbox"
            checked={form.payment_online_enabled === '1'}
            onChange={(e) => degistir('payment_online_enabled', e.target.checked ? '1' : '0')}
          />
          Online ödeme (kartla)
        </label>
        <p className="p-ipucu">
          Online ödemeyi yalnızca ödeme sağlayıcısı kurulup test edildikten sonra açın.
          Açıkken müşteri sepette iki seçenek görür. İkisini birden kapatamazsınız —
          en az biri açık kalmalı.
        </p>

        <label htmlFor="preorder_note">Ödeme ekranında görünecek not</label>
        <input
          id="preorder_note"
          value={form.preorder_note ?? ''}
          onChange={(e) => degistir('preorder_note', e.target.value)}
          maxLength={160}
          placeholder="Ödeme kasada · Siparişiniz onaylanınca hazırlanmaya başlar"
        />

        <div className="p-form-dip">
          <button type="submit" className="p-dugme" disabled={siparisKaydediyor}>
            {siparisKaydediyor ? 'Kaydediliyor…' : 'Ön sipariş ayarlarını kaydet'}
          </button>
        </div>
      </form>

      <form className="p-form p-kart" onSubmit={sifreDegistir} autoComplete="off">
        <h2 className="p-kart-baslik">Panel şifresi</h2>
        <p className="p-kart-alt">
          Şifreyi paylaştığınız herkes menüyü değiştirebilir. Yeni bir yönetici eklemek için
          Supabase panelini kullanın.
        </p>

        <div className="p-ikili-alan">
          <div>
            <label htmlFor="yeni">Yeni şifre</label>
            <input
              id="yeni"
              type="password"
              value={yeniSifre}
              onChange={(e) => setYeniSifre(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label htmlFor="yeni2">Yeni şifre tekrar</label>
            <input
              id="yeni2"
              type="password"
              value={yeniSifre2}
              onChange={(e) => setYeniSifre2(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="p-form-dip">
          <button type="submit" className="p-dugme" disabled={sifreBekliyor}>
            {sifreBekliyor ? 'Değiştiriliyor…' : 'Şifreyi değiştir'}
          </button>
        </div>
      </form>

      <form className="p-form p-kart" onSubmit={istatistikTemizle}>
        <h2 className="p-kart-baslik">Eski istatistikleri temizle</h2>
        <p className="p-kart-alt">
          Veritabanı zamanla büyür. Yılda bir kez eski kayıtları silmeniz yeterlidir.
        </p>

        <label htmlFor="gun">Şu kadar günden eski kayıtları sil</label>
        <select id="gun" value={gun} onChange={(e) => setGun(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="365">365 günden eski</option>
          <option value="180">180 günden eski</option>
          <option value="90">90 günden eski</option>
        </select>

        <div className="p-form-dip">
          <button type="submit" className="p-dugme p-tehlike-dugme">
            Eski kayıtları sil
          </button>
        </div>
      </form>
    </>
  );
}
