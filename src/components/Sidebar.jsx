import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'

export default function Sidebar() {
  const { signOut, profile } = useAuth()
  const { currentOrg, hasAnyRole, rolesLoading } = useOrg()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const canSee = (page) => {
    if (rolesLoading) return false
    const access = {
      dashboard: ['admin','equipment_manager','coach','board_member','volunteer'],
      equipment: ['admin','equipment_manager','board_member'],
      teams: ['admin','equipment_manager','coach','board_member','volunteer'],
      locations: ['admin','equipment_manager','board_member'],
      treasurer: ['admin'],
      safety: ['admin', 'safety_officer'],
      members: ['admin'],
      settings: ['admin','equipment_manager']
    }
    return hasAnyRole(access[page] || [])
  }

  return (
    <>
      <div className="mobile-header">
        <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
        <span className="mobile-header-title">{currentOrg?.name || 'My League Board'}</span>
      </div>
      <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12" fill="#1a472a"/>
              <path d="M14 34V18L24 12L34 18V34" stroke="#f5f0e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="24" cy="24" r="5" stroke="#e8b931" strokeWidth="2"/>
              <line x1="24" y1="19" x2="24" y2="14" stroke="#e8b931" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <div className="sidebar-title">{currentOrg?.name || 'My League Board'}</div>
              <div className="sidebar-org">My League Board</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {canSee('dashboard') && <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon">📊</span> Dashboard
          </NavLink>}
          {canSee('equipment') && <NavLink to="/equipment" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon">📦</span> Equipment
          </NavLink>}
          {canSee('teams') && <NavLink to="/teams" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon">👥</span> Teams
          </NavLink>}
          {canSee('locations') && <NavLink to="/locations" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon">🏠</span> Locations
          </NavLink>}
          {canSee('treasurer') && <NavLink to="/treasurer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon">💰</span> Treasurer
          </NavLink>}
          {canSee('safety') && <NavLink to="/safety" className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'} onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon">🛡️</span> Safety
          </NavLink>}
          {canSee('members') && <NavLink to="/members" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon">👤</span> Board
          </NavLink>}
          {canSee('settings') && <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
            <span className="nav-icon">⚙️</span> Settings
          </NavLink>}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <a href="/profile" onClick={(e) => { e.preventDefault(); setSidebarOpen(false); navigate('/profile') }} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="sidebar-user-name">{profile?.full_name || 'User'}</div>
              <div className="sidebar-user-email">{profile?.email || ''}</div>
            </a>
          </div>
          <button onClick={() => setDarkMode(!darkMode)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', padding: '0.5rem 0', width: '100%', textAlign: 'center' }}>
            {darkMode ? '☀️ Light mode' : '🌙 Dark mode'}
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', fontSize: '0.7rem', padding: '0.5rem 0', color: 'rgba(255,255,255,0.4)' }}>
            <NavLink to="/privacy" style={{ color: 'inherit', textDecoration: 'none' }} onClick={() => setSidebarOpen(false)}>Privacy</NavLink>
            <span>·</span>
            <NavLink to="/terms" style={{ color: 'inherit', textDecoration: 'none' }} onClick={() => setSidebarOpen(false)}>Terms</NavLink>
          </div>
          <button className="btn-signout" onClick={signOut}>Sign out</button>
        </div>
      </aside>
    </>
  )
}
