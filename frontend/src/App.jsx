import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastProvider } from './hooks/useToast';
import { initOfflineStorage } from './utils/offlineStorage';
import Login from "./pages/Login";
import Dashboard from './pages/Dashboard';
import PlayerRetention from './pages/PlayerRetention';
import IdentityBuilder from './pages/IdentityBuilder';
import SessionReflection from './pages/SessionReflection';
import BusinessDashboard from './pages/BusinessDashboard';
import TournamentsCalendar from './pages/TournamentsCalendar';
import TournamentLiveDashboard from './pages/TournamentLiveDashboard';
import LandingPage from './pages/LandingPage';
import ArchetypeAssessment from './pages/ArchetypeAssessment';
import { Pricing } from './pages/Pricing';
import Register from './pages/Register';
import { CommunityKnowledge, SafetyChecklists, AlertsNotifications, AIAssistant } from './pages/pages7to10';
function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem('cgto_token');
  if (!token) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

function AppWithInit() {
  useEffect(() => {
    // Initialize offline storage on app load
    initOfflineStorage().catch(err => console.error('[App] Offline storage init error:', err));
    
    // Register service worker for offline support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('[App] Service Worker registered');
      }).catch(err => console.error('[App] SW registration error:', err));
    }
  }, []);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/archetype-assessment" element={<ArchetypeAssessment />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/players" element={<ProtectedRoute><PlayerRetention /></ProtectedRoute>} />
      <Route path="/identity" element={<ProtectedRoute><IdentityBuilder /></ProtectedRoute>} />
      <Route path="/sessions/reflection" element={<ProtectedRoute><SessionReflection /></ProtectedRoute>} />
      <Route path="/business" element={<ProtectedRoute><BusinessDashboard /></ProtectedRoute>} />
      <Route path="/business-metrics" element={<ProtectedRoute><BusinessDashboard /></ProtectedRoute>} />
      <Route path="/weather" element={<ProtectedRoute><BusinessDashboard /></ProtectedRoute>} />
      <Route path="/community" element={<ProtectedRoute><CommunityKnowledge /></ProtectedRoute>} />
      <Route path="/checklists" element={<ProtectedRoute><SafetyChecklists /></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute><AlertsNotifications /></ProtectedRoute>} />
      <Route path="/ai-assistant" element={<ProtectedRoute><AIAssistant /></ProtectedRoute>} />
      <Route path="/tournaments/events/:eventId/live" element={<ProtectedRoute><TournamentLiveDashboard /></ProtectedRoute>} />
      <Route path="/tournaments" element={<ProtectedRoute><TournamentsCalendar /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppWithInit />
      </BrowserRouter>
    </ToastProvider>
  );
}
