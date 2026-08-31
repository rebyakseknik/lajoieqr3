import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MenuPage from './menu/MenuPage';

/**
 * Panel ayri bir parca olarak indirilir. Musteri QR'i okuttugunda
 * yalnizca menu kodunu indirir; yonetim ekranlari ve QR kutuphanesi
 * yalnizca /panel adresine girildiginde yuklenir.
 */
const RequireAuth = lazy(() => import('./panel/RequireAuth'));
const PanelLayout = lazy(() => import('./panel/PanelLayout'));
const Dashboard   = lazy(() => import('./panel/Dashboard'));
const Products    = lazy(() => import('./panel/Products'));
const Categories  = lazy(() => import('./panel/Categories'));
const BulkAdd     = lazy(() => import('./panel/BulkAdd'));
const QrCode      = lazy(() => import('./panel/QrCode'));
const Settings    = lazy(() => import('./panel/Settings'));
const Orders      = lazy(() => import('./panel/Orders'));
const Coupons     = lazy(() => import('./panel/Coupons'));
const Campaigns   = lazy(() => import('./panel/Campaigns'));
const Duyurular   = lazy(() => import('./panel/Announcements'));

/** Siparis takip ekrani da ayri indirilir; menuyu agirlastirmaz. */
const OrderStatus = lazy(() => import('./siparis/OrderStatus'));
const MyAccount   = lazy(() => import('./hesap/MyAccount'));
const CampaignLanding = lazy(() => import('./menu/CampaignLanding'));
const HomePage    = lazy(() => import('./menu/HomePage'));
const PaymentPage = lazy(() => import('./siparis/PaymentPage'));

function Bekleme() {
  return (
    <div className="p-yok" style={{ padding: '60px 24px', textAlign: 'center' }}>
      Yükleniyor…
    </div>
  );
}

/** Her panel sayfasini bekleme ekraniyla sarar. */
function S({ children }) {
  return <Suspense fallback={<Bekleme />}>{children}</Suspense>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"         element={<MenuPage />} />
        <Route path="/anasayfa" element={<S><HomePage /></S>} />

        <Route path="/siparis/:kod" element={<S><OrderStatus /></S>} />
        <Route path="/hesabim"      element={<S><MyAccount /></S>} />
        <Route path="/kayit/:slug"  element={<S><CampaignLanding /></S>} />
        <Route path="/odeme/:kod"   element={<S><PaymentPage /></S>} />

        <Route
          path="/panel"
          element={
            <S>
              <RequireAuth>
                <PanelLayout />
              </RequireAuth>
            </S>
          }
        >
          <Route index             element={<S><Dashboard /></S>} />
          <Route path="siparisler" element={<S><Orders /></S>} />
          <Route path="kuponlar"   element={<S><Coupons /></S>} />
          <Route path="kampanyalar" element={<S><Campaigns /></S>} />
          <Route path="duyurular"  element={<S><Duyurular /></S>} />
          <Route path="urunler"    element={<S><Products /></S>} />
          <Route path="kategoriler" element={<S><Categories /></S>} />
          <Route path="toplu"      element={<S><BulkAdd /></S>} />
          <Route path="qr"         element={<S><QrCode /></S>} />
          <Route path="ayarlar"    element={<S><Settings /></S>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
