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
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (currentOrg) fetchStats() }, [currentOrg])

  async function fetchStats() {
    setLoading(true)
    const orgId = currentOrg.id
    const [items, teams, locations, stock] = await Promise.all([
      supabase.from('equipment_items').select('status, item_condition, quantity').eq('organization_id', orgId),
      supabase.from('teams').select('id', { count: 'exact' }).eq('organization_id', orgId),
      supabase.from('storage_locations').select('id', { count: 'exact' }).eq('organization_id', orgId),
      supabase.from('location_stock').select('quantity').eq('organization_id', orgId)
    ])
    const d = items.data || []
    const stockTotal = (stock.data || []).reduce((s, r) => s + r.quantity, 0)
    const itemTotal = d.reduce((s, i) => s + i.quantity, 0)
    const totalQty = stockTotal > 0 ? stockTotal : itemTotal
    const assignedQty = d.filter(i => i.status === 'assigned').reduce((s, i) => s + i.quantity, 0)
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

        <div className="quick-actions">
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
      </main>
    </div>
  )
}
