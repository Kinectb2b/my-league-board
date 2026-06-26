import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { OrgProvider, useOrg } from './contexts/OrgContext'
import { ToastProvider } from './components/Toast'
import AuthPage from './pages/AuthPage'
import OrgSetupPage from './pages/OrgSetupPage'
import Dashboard from './pages/Dashboard'
import EquipmentPage from './pages/EquipmentPage'
import EquipmentDashboardPage from './pages/EquipmentDashboardPage'
import TeamsPage from './pages/TeamsPage'
import LocationsPage from './pages/LocationsPage'
import MembersPage from './pages/MembersPage'
import BoardPage from './pages/BoardPage'
import SettingsPage from './pages/SettingsPage'
import ProfilePage from './pages/ProfilePage'
import AcceptInvitePage from './pages/AcceptInvitePage'
import LandingPage from './pages/LandingPage'
import TreasurerPage from './pages/TreasurerPage'
import SafetyPage from './pages/SafetyPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import TicketsPage from './pages/TicketsPage'
import NewTicketPage from './pages/NewTicketPage'
import TicketDetailPage from './pages/TicketDetailPage'
import BagTemplatesPage from './pages/BagTemplatesPage'
import TeamBagsPage from './pages/TeamBagsPage'
import TeamBagDetailPage from './pages/TeamBagDetailPage'
import MyTeamPage from './pages/MyTeamPage'
import FieldsPage from './pages/FieldsPage'
import AppLayout from './components/AppLayout'
import { SkeletonPageShell } from './components/Skeleton'
import PWAUpdatePrompt from './components/PWAUpdatePrompt'
import PWAInstallPrompt from './components/PWAInstallPrompt'

function ProtectedRoute({ children, roles }) {
  const { user, loading: authLoading } = useAuth()
  const { currentOrg, loading: orgLoading, rolesLoading, hasAnyRole } = useOrg()

  if (authLoading || orgLoading) return <SkeletonPageShell />
  if (!user) return <Navigate to="/auth" />
  if (!currentOrg) return <Navigate to="/setup" />
  // Wait on roles before deciding to bounce — bouncing during the roles
  // loading window would race the sidebar's own canSee() and feel arbitrary.
  if (roles && rolesLoading) return <SkeletonPageShell />
  if (roles && !hasAnyRole(roles)) {
    // Send users to the page closest to their actual job. Anyone with an
    // elevated role lands on /dashboard (their hub); pure-coach/volunteer
    // users land on /my-team where their work lives.
    const fallback = hasAnyRole(['admin', 'equipment_manager', 'board_member']) ? '/dashboard' : '/my-team'
    return <Navigate to={fallback} replace />
  }
  return <AppLayout>{children}</AppLayout>
}

function AppRoutes() {
  const { user, loading: authLoading } = useAuth()
  const { currentOrg } = useOrg()

  if (authLoading) return <SkeletonPageShell />

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/dashboard" /> : <AuthPage />} />
      <Route path="/setup" element={!user ? <Navigate to="/auth" /> : (currentOrg ? <Navigate to="/dashboard" /> : <OrgSetupPage />)} />
      <Route path="/dashboard" element={<ProtectedRoute roles={['admin', 'equipment_manager', 'coach', 'board_member', 'volunteer']}><Dashboard /></ProtectedRoute>} />
      <Route path="/equipment/dashboard" element={<ProtectedRoute roles={['admin', 'equipment_manager']}><EquipmentDashboardPage /></ProtectedRoute>} />
      <Route path="/equipment" element={<ProtectedRoute roles={['admin', 'equipment_manager', 'board_member']}><EquipmentPage /></ProtectedRoute>} />
      <Route path="/teams" element={<ProtectedRoute roles={['admin', 'equipment_manager', 'coach', 'board_member', 'volunteer']}><TeamsPage /></ProtectedRoute>} />
      <Route path="/locations" element={<ProtectedRoute roles={['admin', 'equipment_manager', 'board_member']}><LocationsPage /></ProtectedRoute>} />
      <Route path="/treasurer" element={<ProtectedRoute roles={['admin']}><TreasurerPage /></ProtectedRoute>} />
      <Route path="/safety" element={<ProtectedRoute roles={['admin', 'safety_officer']}><SafetyPage /></ProtectedRoute>} />
      <Route path="/board" element={<ProtectedRoute roles={['admin', 'board_member']}><BoardPage /></ProtectedRoute>} />
      <Route path="/members" element={<ProtectedRoute roles={['admin']}><MembersPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute roles={['admin', 'equipment_manager']}><SettingsPage /></ProtectedRoute>} />
      <Route path="/tickets" element={<ProtectedRoute roles={['admin', 'equipment_manager', 'coach', 'board_member', 'volunteer']}><TicketsPage /></ProtectedRoute>} />
      <Route path="/tickets/new" element={<ProtectedRoute roles={['admin', 'equipment_manager', 'coach', 'board_member', 'volunteer']}><NewTicketPage /></ProtectedRoute>} />
      <Route path="/tickets/:id" element={<ProtectedRoute roles={['admin', 'equipment_manager', 'coach', 'board_member', 'volunteer']}><TicketDetailPage /></ProtectedRoute>} />
      <Route path="/bag-templates" element={<ProtectedRoute roles={['admin', 'equipment_manager']}><BagTemplatesPage /></ProtectedRoute>} />
      <Route path="/team-bags" element={<ProtectedRoute roles={['admin', 'equipment_manager']}><TeamBagsPage /></ProtectedRoute>} />
      <Route path="/team-bags/:id" element={<ProtectedRoute roles={['admin', 'equipment_manager']}><TeamBagDetailPage /></ProtectedRoute>} />
      <Route path="/fields" element={<ProtectedRoute roles={['admin', 'equipment_manager', 'coach', 'board_member', 'volunteer', 'field_manager']}><FieldsPage /></ProtectedRoute>} />
      <Route path="/my-team" element={<ProtectedRoute><MyTeamPage /></ProtectedRoute>} />
      <Route path="/my-team/:team_id" element={<ProtectedRoute><MyTeamPage /></ProtectedRoute>} />
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
            <PWAUpdatePrompt />
            <PWAInstallPrompt />
          </ToastProvider>
        </OrgProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
