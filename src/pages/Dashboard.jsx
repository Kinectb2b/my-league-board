import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { profile } = useAuth()
  const { currentOrg } = useOrg()
  const [stats, setStats] = useState({ totalItems: 0, totalQty: 0, assignedQty: 0, availableQty: 0, needsRepair: 0, teams: 0, locations: 0 })
  const [activities, setActivities] = useState([])
  const [checklist, setChecklist] = useState(null)
  const [bagStats, setBagStats] = useState({ total: 0, building: 0, built: 0, pickedUp: 0, returned: 0 })
  const [pickedUpBags, setPickedUpBags] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [fieldAlerts, setFieldAlerts] = useState(0)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => { document.title = 'Dashboard | My League Board' }, [])
  useEffect(() => { if (currentOrg) fetchStats() }, [currentOrg])

  async function fetchStats() {
    setLoading(true)
    const orgId = currentOrg.id
    const [items, teams, locations, stock, activityResult, templatesResult, seasonsResult, fieldsResult] = await Promise.all([
      supabase.from('equipment_items').select('status, item_condition, quantity').eq('organization_id', orgId),
      supabase.from('teams').select('id', { count: 'exact' }).eq('organization_id', orgId),
      supabase.from('storage_locations').select('id, is_supply_room').eq('organization_id', orgId),
      supabase.from('location_stock').select('quantity, target_quantity, equipment_items(name), storage_locations(name)').eq('organization_id', orgId),
      supabase.from('activity_log').select('*, profiles!actor_id(full_name)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(10),
      supabase.from('kit_templates').select('id', { count: 'exact' }).eq('organization_id', orgId),
      supabase.from('seasons').select('id, name, is_active').eq('organization_id', orgId),
      supabase.from('fields').select('status').eq('organization_id', orgId)
    ])
    const fieldsDown = (fieldsResult.data || []).filter(f => f.status === 'maintenance' || f.status === 'closed').length
    setFieldAlerts(fieldsDown)
    const activeSeason = (seasonsResult.data || []).find(s => s.is_active)
    if (activeSeason) {
      const bagsResult = await supabase.from('team_bags').select('status, teams(name), picked_up_by_name, picked_up_at').eq('organization_id', orgId).eq('season_id', activeSeason.id)
      const bags = bagsResult.data || []
      setBagStats({ total: bags.length, building: bags.filter(b => b.status === 'building').length, built: bags.filter(b => b.status === 'built').length, pickedUp: bags.filter(b => b.status === 'picked_up').length, returned: bags.filter(b => b.status === 'returned').length })
      setPickedUpBags(bags.filter(b => b.status === 'picked_up'))
    } else {
      setBagStats({ total: 0, building: 0, built: 0, pickedUp: 0, returned: 0 })
      setPickedUpBags([])
    }
    setLowStock((stock.data || []).filter(s => s.target_quantity && s.quantity < s.target_quantity))
    const d = items.data || []
    const stockTotal = (stock.data || []).reduce((s, r) => s + r.quantity, 0)
    const itemTotal = d.reduce((s, i) => s + i.quantity, 0)
    const totalQty = stockTotal > 0 ? stockTotal : itemTotal
    const assignedQty = d.filter(i => i.status === 'assigned').reduce((s, i) => s + i.quantity, 0)
    setActivities(activityResult.data || [])
    const locData = locations.data || []
    const hasEquipment = d.length > 0
    const hasTeams = (teams.count || 0) > 0
    const hasLocations = locData.length > 0
    const hasSupplyRoom = locData.some(l => l.is_supply_room)
    const hasTemplates = (templatesResult.count || 0) > 0
    const allDone = hasEquipment && hasTeams && hasLocations && hasSupplyRoom && hasTemplates
    setChecklist(allDone ? null : { hasEquipment, hasTeams, hasLocations, hasSupplyRoom, hasTemplates })
    setStats({
      totalItems: d.length,
      totalQty,
      assignedQty,
      availableQty: totalQty - assignedQty,
      needsRepair: d.filter(i => ['broken', 'damaged', 'needs_repair'].includes(i.item_condition)).reduce((s, i) => s + i.quantity, 0),
      teams: teams.count || 0,
      locations: locData.length
    })
    setLoading(false)
    setLastUpdated(new Date())
  }

  return (
    <>
        <div className="page-header">
          <div>
            <h1>Dashboard</h1>
            <p className="text-muted">Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {lastUpdated && <span className="text-muted" style={{ fontSize: '0.75rem' }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
            <button className="btn-icon-sm" onClick={fetchStats} title="Refresh" style={{ fontSize: '1rem' }}>↻</button>
          </div>
        </div>

        {loading ? <div className="loading-state"><div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }}></div></div> : (
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

        {bagStats.total > 0 && (
          <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '0.75rem' }}>Gear bag status</h2>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {bagStats.building > 0 && <div style={{ background: '#ffedd5', border: '1px solid #fed7aa', borderRadius: 'var(--radius)', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f97316' }}>{bagStats.building}</span><span style={{ fontSize: '0.8rem', color: '#ea580c' }}>Building</span></div>}
              {bagStats.built > 0 && <div style={{ background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 'var(--radius)', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#3b82f6' }}>{bagStats.built}</span><span style={{ fontSize: '0.8rem', color: '#1e40af' }}>Ready</span></div>}
              {bagStats.pickedUp > 0 && <div style={{ background: '#ede9fe', border: '1px solid #ddd6fe', borderRadius: 'var(--radius)', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#8b5cf6' }}>{bagStats.pickedUp}</span><span style={{ fontSize: '0.8rem', color: '#6d28d9' }}>Picked up</span></div>}
              {bagStats.returned > 0 && <div style={{ background: '#d4edda', border: '1px solid #b7dfc3', borderRadius: 'var(--radius)', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#16a34a' }}>{bagStats.returned}</span><span style={{ fontSize: '0.8rem', color: '#15803d' }}>Returned</span></div>}
              <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--gray-700)' }}>{bagStats.total}</span><span style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>Total bags</span></div>
            </div>
          </div>
        )}

        {pickedUpBags.length > 0 && (
          <div style={{ marginTop: '1rem', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#92400e' }}>⚠️ {pickedUpBags.length} bag{pickedUpBags.length !== 1 ? 's' : ''} still out</h3>
              <a href="/teams" style={{ color: '#92400e', fontSize: '0.8rem', fontWeight: 500 }}>View teams →</a>
            </div>
            {pickedUpBags.slice(0, 5).map((b, i) => (
              <div key={i} style={{ fontSize: '0.85rem', color: '#78350f', padding: '0.2rem 0' }}>
                {b.teams?.name} — picked up by {b.picked_up_by_name}
              </div>
            ))}
            {pickedUpBags.length > 5 && <div style={{ fontSize: '0.8rem', color: '#92400e', marginTop: '0.25rem' }}>+{pickedUpBags.length - 5} more</div>}
          </div>
        )}

        {lowStock.length > 0 && (
          <div style={{ marginTop: '1rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#9a3412' }}>📦 {lowStock.length} item{lowStock.length !== 1 ? 's' : ''} below target</h3>
              <a href="/locations" style={{ color: '#9a3412', fontSize: '0.8rem', fontWeight: 500 }}>View locations →</a>
            </div>
            {lowStock.slice(0, 5).map((s, i) => (
              <div key={i} style={{ fontSize: '0.85rem', color: '#7c2d12', padding: '0.2rem 0', display: 'flex', justifyContent: 'space-between' }}>
                <span>{s.equipment_items?.name} at {s.storage_locations?.name}</span>
                <span style={{ fontWeight: 600 }}>Need {s.target_quantity - s.quantity} more</span>
              </div>
            ))}
            {lowStock.length > 5 && <div style={{ fontSize: '0.8rem', color: '#9a3412', marginTop: '0.25rem' }}>+{lowStock.length - 5} more</div>}
          </div>
        )}

        {fieldAlerts > 0 && (
          <div style={{ marginTop: '1rem', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#92400e' }}>📍 {fieldAlerts} field{fieldAlerts !== 1 ? 's' : ''} not available</h3>
              <Link to="/fields?status=not_available" style={{ color: '#92400e', fontSize: '0.8rem', fontWeight: 500 }}>View fields →</Link>
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

        {checklist && (
          <div style={{ marginTop: '2rem', background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--gray-700)', marginBottom: '0.75rem' }}>Getting started</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <CheckItem done={checklist.hasEquipment} label="Add your equipment inventory" link="/equipment" />
              <CheckItem done={checklist.hasLocations} label="Set up storage locations" link="/locations" />
              <CheckItem done={checklist.hasSupplyRoom} label="Mark a supply room" link="/locations" />
              <CheckItem done={checklist.hasTeams} label="Add teams and divisions" link="/teams" />
              <CheckItem done={checklist.hasTemplates} label="Create a kit template" link="/settings" />
            </div>
          </div>
        )}
    </>
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

function CheckItem({ done, label, link }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0' }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', background: done ? 'var(--green-600)' : 'var(--gray-200)', color: done ? 'white' : 'var(--gray-400)' }}>{done ? '✓' : ''}</span>
      {done ? <span style={{ color: 'var(--gray-400)', textDecoration: 'line-through' }}>{label}</span> : <a href={link} style={{ color: 'var(--green-700)', fontWeight: 500, textDecoration: 'none' }}>{label}</a>}
    </div>
  )
}
