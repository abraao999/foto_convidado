import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import DashboardHome from './pages/dashboard/DashboardHome';
import ComingSoonPage from './pages/dashboard/ComingSoonPage';
import EventsPage from './pages/dashboard/EventsPage';
import PaymentPage from './pages/dashboard/PaymentPage';
import PhotosPage from './pages/dashboard/PhotosPage';
import ProfilePage from './pages/dashboard/ProfilePage';
import SettingsPage from './pages/dashboard/SettingsPage';
import SubscriptionPage from './pages/dashboard/SubscriptionPage';
import LegacyGuestUpload from './pages/LegacyGuestUpload';
import GuestGalleryUploadPage from './pages/GuestGalleryUploadPage';
import Landing from './pages/Landing';

function AuthenticatedApp() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/enviar" element={<LegacyGuestUpload />} />
        <Route path="/galeria/:slug/enviar" element={<GuestGalleryUploadPage />} />

        <Route element={<AuthenticatedApp />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Register />} />
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
            <Route
              path="/download"
              element={
                <ComingSoonPage
                  title="Download"
                  description="Gerencie downloads individuais e em ZIP."
                  stage="Etapa 8"
                />
              }
            />
            <Route
              path="/admin"
              element={
                <ComingSoonPage
                  title="Administração"
                  description="Gerencie usuários, pagamentos e galerias."
                  stage="Etapa 9"
                />
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
