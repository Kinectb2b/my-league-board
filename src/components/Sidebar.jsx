import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'

export default function Sidebar() {
  const { signOut, profile } = useAuth()
  const { currentOrg } = useOrg()

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="12" fill="#1a472a"/>
            <path d="M14 34V18L24 12L34 18V34" stroke="#f5f0e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="24" cy="24" r="5" stroke="#e8b931" strokeWidth="2"/>
            <line x1="24" y1="19" x2="24" y2="14" stroke="#e8b931" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <div>
            <div className="sidebar-title">MLB</div>
            <div className="sidebar-org">{currentOrg?.name || 'My League Board'}</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">📊</span> Dashboard
        </NavLink>
        <NavLink to="/equipment" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">📦</span> Equipment
        </NavLink>
        <NavLink to="/teams" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">👥</span> Teams
        </NavLink>
        <NavLink to="/locations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">🏠</span> Locations
        </NavLink>
        <NavLink to="/members" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">👤</span> Members
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-name">{profile?.full_name || 'User'}</div>
          <div className="sidebar-user-email">{profile?.email || ''}</div>
        </div>
        <button className="btn-signout" onClick={signOut}>Sign out</button>
      </div>
    </aside>
  )
}
