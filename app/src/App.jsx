import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import Register from './pages/Register'
import ProtectedRoute from './components/ProtectedRoute'
import ClientRoute from './components/ClientRoute'
import OwnerLayout from './layouts/OwnerLayout'
import DashboardHome from './pages/owner/DashboardHome'
import ServicesManager from './pages/owner/ServicesManager'
import ProfessionalsManager from './pages/owner/ProfessionalsManager'
import WorkingHoursManager from './pages/owner/WorkingHoursManager'
import ClientsManager from './pages/owner/ClientsManager'
import SettingsPage from './pages/owner/Settings'
import MetricsDashboard from './pages/owner/MetricsDashboard'
import PlansManager from './pages/owner/PlansManager'
import SalonLayout from './layouts/SalonLayout'
import SalonDetails from './pages/client/SalonDetails'
import ClientAppointments from './pages/client/ClientAppointments'
import ClientProfile from './pages/client/ClientProfile'
import ClientHistory from './pages/client/ClientHistory'
import ClientPlans from './pages/client/ClientPlans'
import PaymentReturn from './pages/client/PaymentReturn'
import AdminLayout from './layouts/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import { Toaster } from 'react-hot-toast'
import './App.css'

function LegacySalonRedirect() {
  const { slug } = useParams()
  return <Navigate to={`/s/${slug}`} replace />
}

function App() {
  useEffect(() => {
    let authSubscription;
    let removePushListener = null;
    let lastLoggedInId = null;

    const attachPushListener = (OneSignal, userId) => {
      if (removePushListener) removePushListener();
      const handler = async (event) => {
        const cur = event?.current ?? event;
        if (cur?.optedIn && (cur?.token || cur?.id)) {
          if (userId !== lastLoggedInId) {
            lastLoggedInId = userId;
            await OneSignal.login(userId);
          }
        }
      };
      OneSignal.User.PushSubscription.addEventListener('change', handler);
      removePushListener = () => {
        OneSignal.User.PushSubscription.removeEventListener('change', handler);
        removePushListener = null;
      };
    };

    const linkOneSignal = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        window.OneSignalDeferred = window.OneSignalDeferred || [];

        if (session?.user) {
          window.OneSignalDeferred.push(async function(OneSignal) {
            if (session.user.id !== lastLoggedInId) {
              lastLoggedInId = session.user.id;
              await OneSignal.login(session.user.id);
            }
            attachPushListener(OneSignal, session.user.id);
          });
        }

        const { data } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
          window.OneSignalDeferred.push(async function(OneSignal) {
            if (newSession?.user) {
              if (newSession.user.id !== lastLoggedInId) {
                lastLoggedInId = newSession.user.id;
                await OneSignal.login(newSession.user.id);
              }
              attachPushListener(OneSignal, newSession.user.id);
            } else {
              if (removePushListener) removePushListener();
              lastLoggedInId = null;
              await OneSignal.logout();
            }
          });
        });
        authSubscription = data.subscription;
      } catch (error) {
        console.error('Error linking OneSignal:', error);
      }
    };

    linkOneSignal();

    return () => {
      authSubscription?.unsubscribe();
      if (removePushListener) removePushListener();
    };
  }, []);

  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        {/* Rotas estáticas — devem vir antes do catch /:slug */}
        <Route path="/" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />

        {/* Rotas Protegidas do Proprietário */}
        <Route
          path="/painel"
          element={
            <ProtectedRoute requiredRole="owner">
              <OwnerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="servicos" element={<ServicesManager />} />
          <Route path="planos" element={<PlansManager />} />
          <Route path="profissionais" element={<ProfessionalsManager />} />
          <Route path="horarios" element={<WorkingHoursManager />} />
          <Route path="clientes" element={<ClientsManager />} />
          <Route path="metricas" element={<MetricsDashboard />} />
          <Route path="configuracoes" element={<SettingsPage />} />
        </Route>

        {/* Área do Super Admin */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
        </Route>

        {/* Retorno do Checkout Pro do Mercado Pago — rota estática, DEVE vir antes de /s/:slug
            (senão :slug capturaria "pagamento"). Standalone: sem SalonLayout. */}
        <Route path="/s/pagamento" element={<PaymentReturn />} />

        {/* Árvore multi-tenant por salão */}
        <Route path="/s/:slug" element={<SalonLayout />}>
          <Route index element={<SalonDetails />} />
          <Route element={<ClientRoute />}>
            <Route path="agenda" element={<ClientAppointments />} />
            <Route path="planos" element={<ClientPlans />} />
            <Route path="historico" element={<ClientHistory />} />
            <Route path="perfil" element={<ClientProfile />} />
          </Route>
        </Route>

        {/* Redirect de compatibilidade para links legados /:slug */}
        <Route path="/:slug" element={<LegacySalonRedirect />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
