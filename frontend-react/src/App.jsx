import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { LanguageProvider } from './context/LanguageContext'
import StoreLayout from './layouts/StoreLayout'
import { SessionProvider } from './context/SessionContext'
import ScanLandingView from './views/ScanLandingView'
import OrderView from './views/OrderView'
import HomeView from './views/HomeView'
import OrdersHistoryView from './views/OrdersHistoryView'
// ProfileView removed — replaced by Call Staff in BottomNav
import KitchenView from './views/KitchenView'
import AdminView from './views/AdminView'
import LoginView from './views/LoginView'
import AdminMenuRegisterView from './views/AdminMenuRegisterView'
import MenuManagementView from './views/MenuManagementView'
import AdminQrBuilderView from './views/AdminQrBuilderView'
import AdminAnalyticsView from './views/AdminAnalyticsView'
import AdminOperationView from './views/AdminOperationView'
import AdminStaffManageView from './views/AdminStaffManageView'
import AdminPaymentView from './views/AdminPaymentView'
import CheckoutView from './views/CheckoutView'
import StoreSelectView from './views/StoreSelectView'
import ReceiptView from './views/ReceiptView'
import SuperAdminView from './views/SuperAdminView'
import StaffTableView from './views/StaffTableView'
import StaffView from './views/StaffView'
import RegisterView from './views/RegisterView'
import QRPrintView from './views/QRPrintView'
import SettingView from './views/SettingView'
import StaffPortalLayout from './layouts/StaffPortalLayout'
import LandingView from './views/LandingView'
import DemoView from './views/DemoView'
import DemoShowcaseView from './views/DemoShowcaseView'
import OwnerSignUpView from './views/OwnerSignUpView'
import OAuthCallbackView from './views/OAuthCallbackView'
import TermsOfServiceView from './views/TermsOfServiceView'
import PrivacyPolicyView from './views/PrivacyPolicyView'
import DiscoverView from './views/DiscoverView'
import AdminLoginView from './views/AdminLoginView'
import AdminAuthGate from './components/AdminAuthGate'
import PayPayCompleteView from './views/PayPayCompleteView'
import SubscriptionView from './views/SubscriptionView'
import ErrorBoundary from './components/ErrorBoundary'
import { useLocation, useParams } from 'react-router-dom'

// Helper to handle legacy non-standard URLs like /shop1/admin
function LegacyRedirect() {
  const location = useLocation()
  const match = location.pathname.match(/^\/shop(\d+)(.*)/)
  if (match) {
    const storeId = match[1]
    const subPath = match[2]
    let target = `/shop/${storeId}${subPath}`

    // Also handle legacy table format if exists: /table1/home -> /table/1/home
    if (subPath.startsWith('/table')) {
      const tableMatch = subPath.match(/^\/table(\d+)(.*)/);
      if (tableMatch) {
        target = `/shop/${storeId}/table/${tableMatch[1]}${tableMatch[2]}`
      }
    }
    return <Navigate to={target} replace />
  }
  return <Navigate to="/" replace />
}

function App() {
  // crypto.randomUUID()는 HTTPS/localhost 전용 → HTTP 환경(GCP) 호환 폴리필 사용
  if (!localStorage.getItem('guest_uuid')) {
    const generateUUID = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
      }
      // HTTP 환경 폴리필
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
      })
    }
    localStorage.setItem('guest_uuid', generateUUID())
  }

  return (
    <ErrorBoundary>
    <ThemeProvider>
      <LanguageProvider>
        <SessionProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingView />} />
              <Route path="/demo" element={<DemoView />} />
              <Route path="/demo/showcase" element={<DemoShowcaseView />} />
              <Route path="/owner/signup" element={<OwnerSignUpView />} />
              <Route path="/owner/signup/oauth-callback" element={<OAuthCallbackView />} />
              <Route path="/terms" element={<TermsOfServiceView />} />
              <Route path="/privacy" element={<PrivacyPolicyView />} />
              <Route path="/discover" element={<DiscoverView />} />
              <Route path="/stores" element={<StoreSelectView />} />
              <Route path="/login" element={<LoginView />} />
              <Route path="/owner/login" element={<LoginView />} />
              <Route path="/super-admin" element={<SuperAdminView />} />
              {/* New Cleaner Route Structure (User Request) */}
              <Route path="/:shop_id">
                {/* Staff Portal: 認証ゲート + 4タブナビ */}
                <Route element={<StaffPortalLayout />}>
                  <Route path="register" element={<RegisterView />} />
                  <Route path="staff" element={<StaffView />} />
                  <Route path="kitchen" element={<KitchenView />} />
                  <Route path="setting" element={<SettingView />} />
                </Route>

                {/* Admin Login (인증 불필요) */}
                <Route path="admin/login" element={<AdminLoginView />} />

                {/* Admin Pages (인증 필요) */}
                <Route element={<AdminAuthGate />}>
                  <Route path="admin" element={<AdminView />} />
                  <Route path="admin/subscription" element={<SubscriptionView />} />
                  <Route path="admin/menu" element={<MenuManagementView />} />
                  <Route path="admin/menu/new" element={<AdminMenuRegisterView />} />
                  <Route path="admin/operation" element={<AdminOperationView />} />
                  <Route path="admin/staff-manage" element={<AdminStaffManageView />} />
                  <Route path="admin/payment" element={<AdminPaymentView />} />
                  <Route path="admin/tables" element={<StaffTableView />} />
                  <Route path="admin/tables/print" element={<QRPrintView />} />
                  <Route path="admin/qr-builder" element={<AdminQrBuilderView />} />
                  <Route path="admin/orders" element={<AdminAnalyticsView />} />
                  <Route path="admin/analytics" element={<AdminAnalyticsView />} />
                </Route>

                {/* Guest Session-based Clean URLs & Table direct URLs */}
                <Route element={<StoreLayout />}>
                  {/* Clean Session URLs */}
                  <Route path="home" element={<HomeView />} />
                  <Route path="menu" element={<OrderView />} />
                  <Route path="orders" element={<OrdersHistoryView />} />
                  <Route path="checkout" element={<CheckoutView />} />
                  {/* Profile route removed — Call Staff in BottomNav */}

                  {/* Take-out URL (no table, Square payment) */}
                  <Route path="takeout" element={<OrderView orderType="take_out" />} />

                  {/* Explicit Table Number URLs (To maintain visual context in URL) */}
                  <Route path="table/:tableNumber" element={<OrderView />} />
                  <Route path="table/:tableNumber/home" element={<HomeView />} />
                  <Route path="table/:tableNumber/menu" element={<OrderView />} />
                  <Route path="table/:tableNumber/orders" element={<OrdersHistoryView />} />
                  <Route path="table/:tableNumber/checkout" element={<CheckoutView />} />
                  {/* Profile route removed — Call Staff in BottomNav */}
                </Route>

                <Route path="receipt/:orderId" element={<ReceiptView />} />
                <Route path="paypay-complete" element={<PayPayCompleteView />} />
              </Route>

              {/* Legacy Format Support (Backward Compatibility) */}
              <Route path="/shop/:storeId" element={<StoreLayout />}>
                <Route path="table/:tableNumber/home" element={<HomeView />} />
                <Route path="table/:tableNumber/menu" element={<OrderView />} />
                <Route path="table/:tableNumber/orders" element={<OrdersHistoryView />} />
                <Route path="table/:tableNumber/checkout" element={<CheckoutView />} />
                {/* Profile route removed — Call Staff in BottomNav */}
                <Route path="admin" element={<AdminView />} />
                <Route path="admin/menu" element={<MenuManagementView />} />
                <Route path="admin/menu/new" element={<AdminMenuRegisterView />} />
                <Route path="admin/tables/print" element={<QRPrintView />} />
                <Route path="admin/qr-builder" element={<AdminQrBuilderView />} />
                <Route path="admin/orders" element={<AdminAnalyticsView />} />
                <Route path="admin/analytics" element={<AdminAnalyticsView />} />
                <Route path="receipt/:orderId" element={<ReceiptView />} />
                <Route path="kitchen" element={<KitchenView />} />
              </Route>

              {/* Legacy Format Support (Backward Compatibility) */}
              <Route path="/shop:storeId/*" element={<LegacyRedirect />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SessionProvider>
      </LanguageProvider>
    </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
