import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { gunKisaltmasi, para, sayi, yuzdeFark } from '../lib/bicim';
import { usePanel, PanelBaslik } from './PanelLayout';
import StatCard from './parts/StatCard';
import BarChart from './parts/BarChart';
import RatioList from './parts/RatioList';
import Kart from './parts/Kart';

export default function Dashboard() {
  const { ayarlar, bildirim } = usePanel();
  const simge = ayarlar.currency || '₺';
  const [veri, setVeri] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    let iptal = false;

    async function getir() {
      const [ozet, gunluk, saatlik, urun, kategori, cihaz, siparisBugun, siparisGunluk, satilan, uyelik] =
        await Promise.all([
          supabase.rpc('stats_summary'),
          supabase.rpc('stats_daily', { gun: 14 }),
          supabase.rpc('stats_hourly', { gun: 30 }),
          supabase.rpc('stats_top_products', { gun: 30, sinir: 10 }),
          supabase.rpc('stats_top_categories', { gun: 30, sinir: 8 }),
          supabase.rpc('stats_devices', { gun: 30 }),
          supabase.rpc('siparis_ozet'),
          supabase.rpc('stats_orders_daily', { gun: 14 }),
          supabase.rpc('stats_sold_products', { gun: 30, sinir: 10 }),
          supabase.rpc('stats_uyelik_kupon'),
        ]);

      if (iptal) return;

      setVeri({
        ozet: ozet.data || {},
        gunluk: gunluk.data || [],
        saatlik: saatlik.data || [],
        urun: urun.data || [],
        kategori: kategori.data || [],
        cihaz: cihaz.data || [],
        siparis: siparisBugun.data || {},
        siparisGunluk: siparisGunluk.data || [],
        satilan: satilan.data || [],
        uyelik: uyelik.data || {},
      });
      setYukleniyor(false);
    }

    getir();
    return () => {
      iptal = true;
    };
  }, []);

  if (yukleniyor || !veri) {
    return (
      <>
        <PanelBaslik baslik="Özet" bildirim={bildirim} />
        <Kart>
          <p className="p-yok">İstatistikler hesaplanıyor…</p>
        </Kart>
      </>
    );
  }

  const { ozet, gunluk, saatlik, urun, kategori, cihaz, siparis, siparisGunluk, satilan, uyelik } = veri;
  const haftaFark = yuzdeFark(ozet.week, ozet.prev_week);

  /* --- Grafik verileri --- */

  const gunlukVeri = gunluk.map((g) => {
    const { ad, gun } = gunKisaltmasi(g.gun_tarih);
    return {
      etiket: ad,
      altEtiket: gun,
      deger: Number(g.adet),
      ipucu: `${new Date(g.gun_tarih).toLocaleDateString('tr-TR')}: ${g.adet} açılış`,
    };
  });

  const saatlikVeri = saatlik.map((s) => ({
    etiket: s.saat % 3 === 0 ? String(s.saat) : '',
    deger: Number(s.adet),
    ipucu: `${String(s.saat).padStart(2, '0')}:00 · ${s.adet} açılış`,
  }));

  const saatToplam = saatlikVeri.reduce((t, s) => t + s.deger, 0);
  const yogunSaat = saatToplam
    ? saatlik.reduce((a, b) => (Number(b.adet) > Number(a.adet) ? b : a)).saat
    : null;

  const cihazToplam = cihaz.reduce((t, c) => t + Number(c.adet), 0);
  const cihazVeri = cihaz.map((c) => {
    const yuzde = cihazToplam ? Math.round((Number(c.adet) / cihazToplam) * 100) : 0;
    return {
      ad: c.cihaz.charAt(0).toUpperCase() + c.cihaz.slice(1),
      deger: yuzde,
      gosterilen: `%${yuzde}`,
    };
  });

  const hicVeriYok = Number(ozet.total || 0) === 0;

  /* --- Siparis grafigi --- */
  const siparisVeri = siparisGunluk.map((g) => {
    const { ad, gun } = gunKisaltmasi(g.gun_tarih);
    return {
      etiket: ad,
      altEtiket: gun,
      deger: Number(g.adet),
      ipucu: `${new Date(g.gun_tarih).toLocaleDateString('tr-TR')}: ${g.adet} sipariş · ${para(g.ciro, simge)}`,
    };
  });
  const siparisToplam14 = siparisGunluk.reduce((t, g) => t + Number(g.adet), 0);

  // Donusum: bugun menuyu acanlarin kaci siparis verdi
  const donusum =
    Number(ozet.today) > 0
      ? Math.round((Number(siparis.toplam || 0) / Number(ozet.today)) * 100)
      : null;

  return (
    <>
      <PanelBaslik baslik="Özet" bildirim={bildirim} />

      {hicVeriYok ? (
        <div className="p-kart p-bos">
          <p className="p-bos-baslik">Henüz ziyaret kaydı yok</p>
          <p className="p-bos-alt">
            QR kodunuzu masalara koyduktan sonra, menüyü kaç kişinin açtığı ve hangi ürünlere
            baktıkları burada görünmeye başlayacak.
          </p>
          <Link className="p-dugme" to="/panel/qr">
            QR kodu hazırla
          </Link>
        </div>
      ) : null}

      <section className="p-sayilar">
        <StatCard
          etiket="Bugünkü sipariş"
          deger={sayi(siparis.toplam || 0)}
          alt={
            Number(siparis.bekleyen || 0) > 0 ? (
              <Link to="/panel/siparisler">{siparis.bekleyen} tanesi onay bekliyor</Link>
            ) : (
              'Bekleyen yok'
            )
          }
        />
        <StatCard
          etiket="Bugünkü ciro"
          deger={para(siparis.ciro || 0, simge)}
          alt={
            Number(siparis.iptal || 0) > 0 ? `${siparis.iptal} iptal` : 'İptal yok'
          }
        />
        <StatCard
          etiket="Bugün menü açılışı"
          deger={sayi(ozet.today)}
          alt={`Dün ${sayi(ozet.yesterday)}`}
        />
        <StatCard
          etiket="Dönüşüm"
          deger={donusum === null ? '–' : `%${donusum}`}
          alt="Menüyü açanların sipariş verme oranı"
        />
      </section>

      <section className="p-sayilar">
        <StatCard
          etiket="Bugün üye olan"
          deger={sayi(uyelik.bugun_uye || 0)}
          alt={`Bu hafta ${sayi(uyelik.hafta_uye || 0)} · toplam ${sayi(uyelik.toplam_uye || 0)}`}
        />
        <StatCard
          etiket="Bugün kupon kullanımı"
          deger={sayi(uyelik.bugun_kupon_adet || 0)}
          alt={
            Number(uyelik.bugun_kupon_tutar || 0) > 0
              ? `${para(uyelik.bugun_kupon_tutar, simge)} indirim yapıldı`
              : 'İndirim yok'
          }
        />
        <StatCard
          etiket="Son 30 gün kupon"
          deger={sayi(uyelik.ay_kupon_adet || 0)}
          alt={
            Number(uyelik.ay_kupon_tutar || 0) > 0
              ? `${para(uyelik.ay_kupon_tutar, simge)} indirim`
              : 'Kullanım yok'
          }
        />
        <StatCard
          etiket="Bugün hediye kartı"
          deger={para(uyelik.bugun_hediye_tutar || 0, simge)}
          alt="Karttan düşen tutar"
        />
      </section>

      <section className="p-sayilar">
        <StatCard
          etiket="Son 7 gün"
          deger={sayi(ozet.week)}
          alt={
            haftaFark === null ? (
              'Önceki hafta veri yok'
            ) : (
              <>
                <span className={haftaFark >= 0 ? 'artis' : 'azalis'}>
                  {haftaFark >= 0 ? '▲' : '▼'} %{Math.abs(haftaFark)}
                </span>{' '}
                önceki haftaya göre
              </>
            )
          }
        />
        <StatCard
          etiket="Toplam açılış"
          deger={sayi(ozet.total)}
          alt="Kurulumdan bu yana"
        />
        <StatCard
          etiket="Menüdeki ürün"
          deger={sayi(ozet.products)}
          alt={
            Number(ozet.sold_out) > 0 ? (
              <Link to="/panel/urunler">{ozet.sold_out} tanesi bugün yok</Link>
            ) : (
              'Hepsi mevcut'
            )
          }
        />
      </section>

      <Kart
        baslik="Son 14 gün · Sipariş"
        alt={
          siparisToplam14
            ? `${siparisToplam14} sipariş · sütunlara dokununca ciroyu gösterir`
            : 'Henüz sipariş yok'
        }
      >
        <BarChart veri={siparisVeri} degerGoster />
      </Kart>

      <Kart baslik="Son 14 gün · Menü açılışı" alt="Menünün kaç kez açıldığı">
        <BarChart veri={gunlukVeri} degerGoster />
      </Kart>

      <div className="p-ikili">
        <Kart
          baslik="Gün içi yoğunluk"
          alt={
            yogunSaat !== null
              ? `En yoğun saat: ${String(yogunSaat).padStart(2, '0')}:00 · son 30 gün`
              : 'Son 30 günde kayıt yok'
          }
        >
          <BarChart veri={saatlikVeri} ince />
        </Kart>

        <Kart baslik="Nereden bakıyorlar" alt="Son 30 gün">
          <RatioList veri={cihazVeri} />
        </Kart>
      </div>

      <div className="p-ikili">
        <Kart
          baslik="En çok satılanlar"
          alt="Gerçekten sipariş edilen ürünler · son 30 gün"
        >
          <RatioList
            veri={satilan.map((u) => ({
              ad: u.urun_ad,
              altAd: para(u.ciro, simge),
              deger: Number(u.adet),
            }))}
            bosMesaj="Henüz sipariş edilmiş ürün yok."
          />
        </Kart>

        <Kart
          baslik="En çok bakılan ürünler"
          alt="Müşteri ürüne dokunup detayını açtığında sayılır · son 30 gün"
        >
          <RatioList
            veri={urun.map((u) => ({
              ad: u.urun_ad,
              altAd: u.kategori_ad,
              deger: Number(u.adet),
            }))}
            bosMesaj="Henüz kimse ürün detayı açmadı."
          />
        </Kart>

        <Kart baslik="Kategori ilgisi" alt="Menüde en çok gezilen bölümler · son 30 gün">
          <RatioList
            veri={kategori.map((k) => ({ ad: k.kategori_ad, deger: Number(k.adet) }))}
          />
        </Kart>
      </div>
    </>
  );
}
