import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { OrgProvider, useOrg } from './contexts/OrgContext'
import { ToastProvider } from './components/Toast'
import AuthPage from './pages/AuthPage'
import OrgSetupPage from './pages/OrgSetupPage'
import Dashboard from './pages/Dashboard'
import EquipmentPage from './pages/EquipmentPage'
import TeamsPage from './pages/TeamsPage'
import LocationsPage from './pages/LocationsPage'
import MembersPage from './pages/MembersPage'
import SettingsPage from './pages/SettingsPage'
import ProfilePage from './pages/ProfilePage'
import AcceptInvitePage from './pages/AcceptInvitePage'
import LandingPage from './pages/LandingPage'
import TreasurerPage from './pages/TreasurerPage'
import SafetyPage from './pages/SafetyPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import AppLayout from './components/AppLayout'

function ProtectedRoute({ children }) {
  const { user, loading: authLoading } = useAuth()
  const { currentOrg, loading: orgLoading } = useOrg()

  if (authLoading || orgLoading) return <div className="loading-page">Loading...</div>
  if (!user) return <Navigate to="/auth" />
  if (!currentOrg) return <Navigate to="/setup" />
  return <AppLayout>{children}</AppLayout>
}

function AppRoutes() {
  const { user, loading: authLoading } = useAuth()
  const { currentOrg } = useOrg()

  if (authLoading) return <div className="loading-page">Loading...</div>

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/dashboard" /> : <AuthPage />} />
      <Route path="/setup" element={!user ? <Navigate to="/auth" /> : (currentOrg ? <Navigate to="/dashboard" /> : <OrgSetupPage />)} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/equipment" element={<ProtectedRoute><EquipmentPage /></ProtectedRoute>} />
      <Route path="/teams" element={<ProtectedRoute><TeamsPage /></ProtectedRoute>} />
      <Route path="/locations" element={<ProtectedRoute><LocationsPage /></ProtectedRoute>} />
      <Route path="/treasurer" element={<ProtectedRoute><TreasurerPage /></ProtectedRoute>} />
      <Route path="/safety" element={<ProtectedRoute><SafetyPage /></ProtectedRoute>} />
      <Route path="/members" element={<ProtectedRoute><MembersPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LandingPage />} />
      <Route path="*" element={user ? <Navigate to="/dashboard" /> : <Navigate to="/" />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OrgProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </OrgProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
