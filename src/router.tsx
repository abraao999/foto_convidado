import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import ProfilePage from './pages/dashboard/ProfilePage';
import SettingsPage from './pages/dashboard/SettingsPage';
import SubscriptionPage from './pages/dashboard/SubscriptionPage';
import LegacyGuestUpload from './pages/LegacyGuestUpload';
import Landing from './pages/Landing';

export default function AppRouter() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Register />} />
          <Route path="/recuperar-senha" element={<ForgotPassword />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />
          <Route path="/enviar" element={<LegacyGuestUpload />} />
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
            <Route
              path="/fotos"
              element={
                <ComingSoonPage
                  title="Fotos"
                  description="Envie e organize as fotos das suas galerias."
                  stage="Etapa 6"
                />
              }
            />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
