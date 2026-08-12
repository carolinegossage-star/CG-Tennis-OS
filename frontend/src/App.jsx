import { BrowserRouter, Routes, Route, Navigate } from 'react';
import { useEffect } from 'react';
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
import { CommunityKnowledge, SafetyChecklists, AlertsNotifications, AIAssistant } from './pages/pages7to10';
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
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/players" element={<PlayerRetention />} />
      <Route path="/identity" element={<IdentityBuilder />} />
      <Route path="/sessions/reflection" element={<SessionReflection />} />
      <Route path="/business" element={<BusinessDashboard />} />
      <Route path="/community" element={<CommunityKnowledge />} />
      <Route path="/checklists" element={<SafetyChecklists />} />
      <Route path="/alerts" element={<AlertsNotifications />} />
      <Route path="/ai-assistant" element={<AIAssistant />} />
      <Route path="/tournaments/events/:eventId/live" element={<TournamentLiveDashboard />} />
      <Route path="/tournaments" element={<TournamentsCalendar />} />
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
