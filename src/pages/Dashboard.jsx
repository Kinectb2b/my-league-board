import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import Sidebar from '../components/Sidebar'

export default function Dashboard() {
  const { profile } = useAuth()
  const { currentOrg } = useOrg()
  const [stats, setStats] = useState({ totalItems: 0, totalQty: 0, assignedQty: 0, availableQty: 0, needsRepair: 0, teams: 0, locations: 0 })
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (currentOrg) fetchStats() }, [currentOrg])

  async function fetchStats() {
    setLoading(true)
    const orgId = currentOrg.id
    const [items, teams, locations, stock, activityResult] = await Promise.all([
      supabase.from('equipment_items').select('status, item_condition, quantity').eq('organization_id', orgId),
      supabase.from('teams').select('id', { count: 'exact' }).eq('organization_id', orgId),
      supabase.from('storage_locations').select('id', { count: 'exact' }).eq('organization_id', orgId),
      supabase.from('location_stock').select('quantity').eq('organization_id', orgId),
      supabase.from('activity_log').select('*, profiles!actor_id(full_name)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(10)
    ])
    const d = items.data || []
    const stockTotal = (stock.data || []).reduce((s, r) => s + r.quantity, 0)
    const itemTotal = d.reduce((s, i) => s + i.quantity, 0)
    const totalQty = stockTotal > 0 ? stockTotal : itemTotal
    const assignedQty = d.filter(i => i.status === 'assigned').reduce((s, i) => s + i.quantity, 0)
    setActivities(activityResult.data || [])
    setStats({
      totalItems: d.length,
      totalQty,
      assignedQty,
      availableQty: totalQty - assignedQty,
      needsRepair: d.filter(i => ['broken', 'damaged', 'needs_repair'].includes(i.item_condition)).reduce((s, i) => s + i.quantity, 0),
      teams: teams.count || 0,
      locations: locations.count || 0
    })
    setLoading(false)
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>Dashboard</h1>
            <p className="text-muted">Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}</p>
          </div>
        </div>

        {loading ? <div className="loading-state">Loading...</div> : (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-number">{stats.totalQty}</div>
              <div className="stat-label">Total equipment</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.availableQty}</div>
              <div className="stat-label">Available</div>
            </div>
            <div className="stat-card stat-warning">
              <div className="stat-number">{stats.assignedQty}</div>
              <div className="stat-label">Assigned to teams</div>
            </div>
            <div className="stat-card stat-danger">
              <div className="stat-number">{stats.needsRepair}</div>
              <div className="stat-label">Needs repair</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.teams}</div>
              <div className="stat-label">Teams</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.locations}</div>
              <div className="stat-label">Storage locations</div>
            </div>
          </div>
        )}

        <div className="quick-actions" style={{ marginBottom: 0 }}>
          <h2>Quick actions</h2>
          <div className="action-grid">
            <Link to="/equipment" className="action-card">
              <span className="action-icon">📦</span>
              <span>Manage equipment</span>
            </Link>
            <Link to="/teams" className="action-card">
              <span className="action-icon">👥</span>
              <span>Teams & gear</span>
            </Link>
            <Link to="/locations" className="action-card">
              <span className="action-icon">🏠</span>
              <span>Storage locations</span>
            </Link>
          </div>
        </div>

        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '0.75rem' }}>Recent activity</h2>
          {activities.length === 0 ? (
            <p className="text-muted">No activity yet. Actions will appear here as you use the app.</p>
          ) : (
            <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {activities.map(a => (
                <div key={a.id} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--gray-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: '0.85rem' }}>{a.profiles?.full_name || 'Someone'}</strong>
                    <span style={{ color: 'var(--gray-500)', fontSize: '0.85rem' }}> {a.action} </span>
                    {a.entity_name && <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{a.entity_name}</span>}
                    {a.details && <span style={{ color: 'var(--gray-400)', fontSize: '0.8rem' }}> — {a.details}</span>}
                  </div>
                  <span className="text-muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )

  function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return minutes + 'm ago'
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return hours + 'h ago'
    const days = Math.floor(hours / 24)
    if (days < 7) return days + 'd ago'
    return new Date(date).toLocaleDateString()
  }
}
