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

function ProtectedRoute({ children }) {
  const { user, loading: authLoading } = useAuth()
  const { currentOrg, loading: orgLoading } = useOrg()

  if (authLoading || orgLoading) return <div className="loading-page">Loading...</div>
  if (!user) return <Navigate to="/auth" />
  if (!currentOrg) return <Navigate to="/setup" />
  return children
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
      <Route path="*" element={<Navigate to="/dashboard" />} />
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
