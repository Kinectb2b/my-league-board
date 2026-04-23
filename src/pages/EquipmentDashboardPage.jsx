import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import { getTicketTypeConfig, PRIORITY_COLORS, STATUS_COLORS } from '../lib/ticketRouting'

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w <= 4) return `${w}w ago`
  return new Date(date).toLocaleDateString()
}

const EVENT_VERBS = {
  receive: 'received', transfer: 'moved', consume: 'consumed',
  damage: 'marked damaged', retire: 'retired', audit: 'adjusted'
}

export default function EquipmentDashboardPage() {
  const { currentOrg } = useOrg()
  const navigate = useNavigate()

  // KPI data
  const [totalItems, setTotalItems] = useState(null)
  const [skuCount, setSkuCount] = useState(null)
  const [belowTarget, setBelowTarget] = useState([])
  const [equipTickets, setEquipTickets] = useState([])
  const [bagsPending, setBagsPending] = useState(0)
  const [bagStats, setBagStats] = useState({})

  // Panel data
  const [recentEvents, setRecentEvents] = useState([])
  const [locationCards, setLocationCards] = useState([])

  // Loading states per panel
  const [kpiLoading, setKpiLoading] = useState(true)
  const [attentionLoading, setAttentionLoading] = useState(true)
  const [activityLoading, setActivityLoading] = useState(true)
  const [locationsLoading, setLocationsLoading] = useState(true)

  useEffect(() => { document.title = 'Equipment Dashboard | My League Board' }, [])
  useEffect(() => { if (currentOrg) fetchAll() }, [currentOrg])

  async function fetchAll() {
    const orgId = currentOrg.id

    // 1. KPI: total items + SKUs
    setKpiLoading(true)
    supabase.from('location_stock')
      .select('quantity, equipment_item_id')
      .eq('organization_id', orgId)
      .then(({ data }) => {
        const rows = data || []
        const total = rows.reduce((sum, r) => sum + (r.quantity || 0), 0)
        const skus = new Set(rows.map(r => r.equipment_item_id)).size
        setTotalItems(total)
        setSkuCount(skus)
        setKpiLoading(false)
      })

    // 2. Below-target stock (may fail if target_quantity doesn't exist yet)
    setAttentionLoading(true)
    supabase.from('location_stock')
      .select('*, equipment_items(name, case_size), storage_locations:storage_location_id(name)')
      .eq('organization_id', orgId)
      .not('target_quantity', 'is', null)
      .then(({ data, error }) => {
        if (error) {
          // target_quantity column likely doesn't exist yet
          setBelowTarget([])
        } else {
          // Client-side filter: Supabase JS can't compare column-to-column
          const alerts = (data || []).filter(r => r.quantity < r.target_quantity)
          alerts.sort((a, b) => (a.quantity / a.target_quantity) - (b.quantity / b.target_quantity))
          setBelowTarget(alerts)
        }
      })

    // 3. Open equipment tickets
    supabase.from('tickets')
      .select('*, opener:opened_by(full_name)')
      .eq('organization_id', orgId)
      .in('ticket_type', ['equipment_team_bag', 'equipment_baseroom', 'equipment_stock_request'])
      .in('status', ['open', 'in_progress'])
      .order('opened_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        // Sort by priority
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
        const sorted = (data || []).sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3))
        setEquipTickets(sorted)
        setAttentionLoading(false)
      })

    // 4. Bags pending (building status for active season)
    supabase.from('team_bags')
      .select('status, seasons!inner(is_active)')
      .eq('organization_id', orgId)
      .eq('seasons.is_active', true)
      .then(({ data }) => {
        const rows = data || []
        const stats = {}
        rows.forEach(r => { stats[r.status] = (stats[r.status] || 0) + 1 })
        setBagsPending(stats.building || 0)
        setBagStats(stats)
      })

    // 5. Recent stock events
    setActivityLoading(true)
    supabase.from('stock_events')
      .select('*, equipment_items:equipment_item_id(name), from_loc:from_location_id(name), to_loc:to_location_id(name), profiles:created_by(full_name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(15)
      .then(({ data, error }) => {
        if (error) {
          // Fallback without profile join
          supabase.from('stock_events')
            .select('*, equipment_items:equipment_item_id(name), from_loc:from_location_id(name), to_loc:to_location_id(name)')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .limit(15)
            .then(({ data: d2 }) => { setRecentEvents(d2 || []); setActivityLoading(false) })
        } else {
          setRecentEvents(data || [])
          setActivityLoading(false)
        }
      })

    // 6. Locations grid
    setLocationsLoading(true)
    const [locsRes, stockRes] = await Promise.all([
      supabase.from('storage_locations').select('id, name').eq('organization_id', orgId).order('name'),
      supabase.from('location_stock').select('storage_location_id, equipment_item_id, quantity').eq('organization_id', orgId)
    ])
    const locs = locsRes.data || []
    const stock = stockRes.data || []
    const cards = locs.map(loc => {
      const locStock = stock.filter(s => s.storage_location_id === loc.id)
      const totalQty = locStock.reduce((sum, s) => sum + (s.quantity || 0), 0)
      const skuCt = new Set(locStock.map(s => s.equipment_item_id)).size
      return { ...loc, totalQty, skuCount: skuCt }
    })
    setLocationCards(cards)
    setLocationsLoading(false)
  }

  const attentionItems = []
  // Add tickets sorted by priority
  equipTickets.forEach(t => {
    attentionItems.push({ type: 'ticket', data: t, sortKey: { urgent: 0, high: 1 }[t.priority] ?? 5 })
  })
  // Add below-target rows
  belowTarget.forEach(r => {
    const deficit = (r.target_quantity || 0) - (r.quantity || 0)
    const pct = r.target_quantity > 0 ? r.quantity / r.target_quantity : 1
    attentionItems.push({ type: 'stock', data: r, deficit, pct, sortKey: pct <= 0 ? 0.5 : pct <= 0.25 ? 1.5 : 2.5 })
  })
  attentionItems.sort((a, b) => a.sortKey - b.sortKey)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Equipment dashboard</h1>
          <p className="text-muted">Overview for equipment managers</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="eqd-kpi-grid">
        <div className="stat-card">
          {kpiLoading ? <div className="skeleton" style={{ width: '80px', height: '2rem' }} /> : (
            <>
              <div className="stat-number">{totalItems ?? 0}</div>
              <div className="stat-label">items · {skuCount ?? 0} SKUs</div>
            </>
          )}
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => document.getElementById('attention-panel')?.scrollIntoView({ behavior: 'smooth' })}>
          <div className="stat-number" style={{ color: belowTarget.length > 0 ? 'var(--orange-500)' : 'var(--green-600)' }}>{belowTarget.length}</div>
          <div className="stat-label">below reorder threshold</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/tickets')}>
          <div className="stat-number" style={{ color: equipTickets.length > 0 ? 'var(--red-500)' : 'var(--gray-500)' }}>{equipTickets.length}</div>
          <div className="stat-label">open equipment tickets</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/team-bags')}>
          <div className="stat-number">{bagsPending}</div>
          <div className="stat-label">bags to assemble</div>
        </div>
      </div>

      {/* Middle: Needs Attention + Recent Activity */}
      <div className="eqd-middle-grid">
        <div className="eqd-panel eqd-panel-wide" id="attention-panel">
          <h2 className="eqd-panel-header">Needs attention · {attentionItems.length} items</h2>
          {attentionLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '3rem', borderRadius: 'var(--radius)' }} />)}
            </div>
          ) : attentionItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--green-600)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✓</div>
              <p>Everything looks good. Nothing needs attention right now.</p>
            </div>
          ) : (
            <div className="eqd-attention-list">
              {attentionItems.slice(0, 20).map((item, i) => {
                if (item.type === 'ticket') {
                  const t = item.data
                  const tc = getTicketTypeConfig(t.ticket_type)
                  const pc = PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.normal
                  return (
                    <div key={`t-${t.id}`} className="eqd-attention-row eqd-attention-clickable" onClick={() => navigate(`/tickets/${t.id}`)}>
                      <span style={{ fontSize: '1rem' }}>🎫</span>
                      <div className="eqd-attention-info">
                        <div className="eqd-attention-title">{t.title}</div>
                        <div className="eqd-attention-meta">
                          <span className="badge" style={{ backgroundColor: 'var(--gray-100)', color: 'var(--gray-600)', fontSize: '0.65rem' }}>{tc?.icon} {tc?.label}</span>
                          <span>opened by {t.opener?.full_name || 'Unknown'}, {timeAgo(t.opened_at)}</span>
                          <span className="badge" style={{ backgroundColor: pc.bg, color: pc.text, fontSize: '0.65rem' }}>{t.priority}</span>
                        </div>
                      </div>
                    </div>
                  )
                } else {
                  const r = item.data
                  const color = r.quantity === 0 ? '#ef4444' : item.pct <= 0.25 ? '#f97316' : '#eab308'
                  return (
                    <div key={`s-${r.id || i}`} className="eqd-attention-row">
                      <span style={{ fontSize: '0.8rem', color }}>●</span>
                      <div className="eqd-attention-info">
                        <div className="eqd-attention-title">{r.equipment_items?.name || 'Unknown'} at {r.storage_locations?.name || 'Unknown'}</div>
                        <div className="eqd-attention-meta">
                          <span>{r.quantity} left · target {r.target_quantity} · need {item.deficit} more</span>
                        </div>
                      </div>
                    </div>
                  )
                }
              })}
            </div>
          )}
        </div>

        <div className="eqd-panel">
          <h2 className="eqd-panel-header">Recent activity</h2>
          {activityLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '2.5rem', borderRadius: 'var(--radius)' }} />)}
            </div>
          ) : recentEvents.length === 0 ? (
            <p className="text-muted" style={{ textAlign: 'center', padding: '1.5rem' }}>No recent activity yet.</p>
          ) : (
            <div className="eqd-activity-list">
              {recentEvents.map(ev => {
                const verb = EVENT_VERBS[ev.event_type] || ev.event_type
                const actor = ev.profiles?.full_name || 'Someone'
                const itemName = ev.equipment_items?.name || 'unknown item'
                const qtyStr = ev.event_type === 'audit'
                  ? `${ev.quantity > 0 ? '+' : ''}${ev.quantity}`
                  : String(ev.quantity)
                return (
                  <div key={ev.id} className="eqd-activity-row">
                    <span className="eqd-activity-icon">{
                      { receive: '📥', transfer: '↔️', consume: '📤', damage: '⚠️', retire: '🗑️', audit: '📋' }[ev.event_type] || '•'
                    }</span>
                    <div className="eqd-activity-info">
                      <div><strong>{actor}</strong> {verb} {qtyStr} of {itemName}</div>
                      <div className="eqd-activity-detail">
                        {ev.from_loc?.name && <span>{ev.from_loc.name}</span>}
                        {ev.from_loc?.name && ev.to_loc?.name && <span> → </span>}
                        {ev.to_loc?.name && <span>{ev.to_loc.name}</span>}
                        {ev.reason && <span> · {ev.reason}</span>}
                      </div>
                      <span className="eqd-activity-time">{timeAgo(ev.created_at)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Storage locations grid */}
      <div className="eqd-panel" style={{ marginTop: '1.25rem' }}>
        <h2 className="eqd-panel-header">Storage locations</h2>
        {locationsLoading ? (
          <div className="eqd-loc-grid">
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '80px', borderRadius: 'var(--radius-lg)' }} />)}
          </div>
        ) : locationCards.length === 0 ? (
          <p className="text-muted" style={{ textAlign: 'center', padding: '1.5rem' }}>No storage locations set up yet.</p>
        ) : (
          <div className="eqd-loc-grid">
            {locationCards.map(loc => (
              <div key={loc.id} className="eqd-loc-card" onClick={() => navigate('/equipment')}>
                <div className="eqd-loc-name">{loc.name}</div>
                <div className="eqd-loc-stats">
                  <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--green-800)' }}>{loc.totalQty}</span>
                  <span className="text-muted"> items · {loc.skuCount} SKUs</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bag status summary */}
      {Object.keys(bagStats).length > 0 && (
        <div className="eqd-bag-summary">
          <span>Bags:</span>
          {bagStats.building > 0 && <span className="eqd-bag-chip" onClick={() => navigate('/team-bags')}>{bagStats.building} building</span>}
          {bagStats.assigned > 0 && <span className="eqd-bag-chip" onClick={() => navigate('/team-bags')}>{bagStats.assigned} assigned</span>}
          {bagStats.returned > 0 && <span className="eqd-bag-chip" onClick={() => navigate('/team-bags')}>{bagStats.returned} returned</span>}
        </div>
      )}

      <style>{dashStyles}</style>
    </>
  )
}

const dashStyles = `
  .eqd-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .eqd-middle-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1.25rem;
    align-items: flex-start;
  }
  .eqd-panel {
    background: white;
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-lg);
    padding: 1.25rem;
  }
  .eqd-panel-wide { /* inherits from grid */ }
  .eqd-panel-header {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--gray-700);
    margin-bottom: 0.75rem;
  }
  .eqd-attention-list, .eqd-activity-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .eqd-attention-row {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.6rem 0.5rem;
    border-bottom: 1px solid var(--gray-100);
    font-size: 0.85rem;
  }
  .eqd-attention-row:last-child { border-bottom: none; }
  .eqd-attention-clickable { cursor: pointer; border-radius: var(--radius); }
  .eqd-attention-clickable:hover { background: var(--green-50); }
  .eqd-attention-info { flex: 1; min-width: 0; }
  .eqd-attention-title { font-weight: 500; }
  .eqd-attention-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-top: 0.15rem;
    font-size: 0.75rem;
    color: var(--gray-500);
  }
  .eqd-activity-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--gray-100);
    font-size: 0.8rem;
  }
  .eqd-activity-row:last-child { border-bottom: none; }
  .eqd-activity-icon { font-size: 0.9rem; flex-shrink: 0; margin-top: 0.1rem; }
  .eqd-activity-info { flex: 1; min-width: 0; line-height: 1.4; }
  .eqd-activity-detail { color: var(--gray-500); font-size: 0.75rem; }
  .eqd-activity-time { color: var(--gray-400); font-size: 0.7rem; }
  .eqd-loc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.75rem;
  }
  .eqd-loc-card {
    background: var(--gray-50);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius);
    padding: 0.85rem 1rem;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .eqd-loc-card:hover { border-color: var(--green-400); box-shadow: var(--shadow-sm); }
  .eqd-loc-name { font-weight: 600; font-size: 0.9rem; margin-bottom: 0.2rem; }
  .eqd-loc-stats { font-size: 0.8rem; }
  .eqd-bag-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 1rem;
    padding: 0.6rem 1rem;
    background: white;
    border: 1px solid var(--gray-200);
    border-radius: var(--radius);
    font-size: 0.85rem;
    color: var(--gray-600);
  }
  .eqd-bag-chip {
    padding: 0.15rem 0.5rem;
    background: var(--green-50);
    border: 1px solid var(--green-200);
    border-radius: 10px;
    color: var(--green-700);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
  }
  .eqd-bag-chip:hover { background: var(--green-100); }
  @media (max-width: 1023px) {
    .eqd-kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .eqd-middle-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .eqd-kpi-grid { grid-template-columns: 1fr 1fr; }
  }
`
