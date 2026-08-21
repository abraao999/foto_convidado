import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import { AuthProvider } from './contexts/AuthContext';
import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import VerifyEmail from './pages/auth/VerifyEmail';
import DashboardHome from './pages/dashboard/DashboardHome';
import AdminPage from './pages/dashboard/AdminPage';
import DownloadsPage from './pages/dashboard/DownloadsPage';
import EventsPage from './pages/dashboard/EventsPage';
import PaymentPage from './pages/dashboard/PaymentPage';
import PhotosPage from './pages/dashboard/PhotosPage';
import ProfilePage from './pages/dashboard/ProfilePage';
import SettingsPage from './pages/dashboard/SettingsPage';
import SubscriptionPage from './pages/dashboard/SubscriptionPage';
import GuestGalleryUploadPage from './pages/GuestGalleryUploadPage';
import Landing from './pages/Landing';

function AuthenticatedApp() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function GuestUploadRedirect() {
  const { slug = '' } = useParams();
  return <Navigate to={`/galeria/${slug}/enviar`} replace />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/galeria/:slug/enviar" element={<GuestGalleryUploadPage />} />
        <Route path="/galeria/:slug" element={<GuestUploadRedirect />} />
        <Route path="/galeria/:slug/download" element={<GuestUploadRedirect />} />
        <Route path="/enviar" element={<Navigate to="/" replace />} />

        <Route element={<AuthenticatedApp />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Register />} />
          <Route path="/verificar-email" element={<VerifyEmail />} />
          <Route path="/recuperar-senha" element={<ForgotPassword />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />
          <Route
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/pagamento" element={<PaymentPage />} />
            <Route path="/assinatura" element={<SubscriptionPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="/eventos" element={<EventsPage />} />
            <Route path="/galerias" element={<Navigate to="/eventos" replace />} />
            <Route path="/fotos" element={<PhotosPage />} />
            <Route path="/download" element={<DownloadsPage />} />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
