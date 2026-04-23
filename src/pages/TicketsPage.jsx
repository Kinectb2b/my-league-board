import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { TICKET_TYPES, PRIORITY_COLORS, STATUS_COLORS, getTicketTypeConfig } from '../lib/ticketRouting'
import { fetchCoachTeams } from '../lib/coachTeams'

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function TicketsPage() {
  const { currentOrg, hasAnyRole } = useOrg()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('my')
  const [coachTeamIds, setCoachTeamIds] = useState([])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const isElevated = hasAnyRole(['admin', 'equipment_manager', 'safety_officer'])

  useEffect(() => { document.title = 'Tickets | My League Board' }, [])
  useEffect(() => {
    if (currentOrg && user) {
      fetchTickets()
      fetchCoachTeams(currentOrg.id, user.id).then(teams => {
        setCoachTeamIds(teams.map(t => t.id))
      })
    }
  }, [currentOrg, user])

  async function fetchTickets() {
    setLoading(true)
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .eq('organization_id', currentOrg.id)
      .order('updated_at', { ascending: false })

    if (!data || data.length === 0) { setTickets(data || []); setLoading(false); return }

    // Resolve names from profiles (opened_by FK targets auth.users which lacks full_name)
    const userIds = [...new Set([...data.map(t => t.opened_by), ...data.map(t => t.assigned_to)].filter(Boolean))]
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds)
    const nameMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]))

    setTickets(data.map(t => ({
      ...t,
      opener: { full_name: nameMap[t.opened_by] || null },
      assignee: { full_name: nameMap[t.assigned_to] || null }
    })))
    setLoading(false)
  }

  const teamFilter = searchParams.get('team') || ''

  const filtered = useMemo(() => {
    return tickets.filter(t => {
      // Tab filter — "my" now includes tickets opened by the user OR for their coached teams
      if (tab === 'my' && t.opened_by !== user?.id && !coachTeamIds.includes(t.team_id)) return false
      if (tab === 'assigned' && t.assigned_to !== user?.id) return false
      // Team filter from query param (e.g. from My Team page)
      if (teamFilter && t.team_id !== teamFilter) return false
      // Dropdown filters
      if (filterStatus && t.status !== filterStatus) return false
      if (filterType && t.ticket_type !== filterType) return false
      if (filterPriority && t.priority !== filterPriority) return false
      if (searchTerm && !t.title.toLowerCase().includes(searchTerm.toLowerCase())) return false
      return true
    })
  }, [tickets, tab, filterStatus, filterType, filterPriority, searchTerm, user, coachTeamIds, teamFilter])

  const openCount = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Tickets</h1>
          <p className="text-muted">{openCount} open</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/tickets/new')}>+ New ticket</button>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: '1rem', borderBottom: '2px solid var(--gray-200)' }}>
        <button className={`tkt-tab ${tab === 'my' ? 'tkt-tab-active' : ''}`} onClick={() => setTab('my')}>My tickets</button>
        <button className={`tkt-tab ${tab === 'assigned' ? 'tkt-tab-active' : ''}`} onClick={() => setTab('assigned')}>Assigned to me</button>
        {isElevated && <button className={`tkt-tab ${tab === 'all' ? 'tkt-tab-active' : ''}`} onClick={() => setTab('all')}>All</button>}
      </div>

      <div className="filters-bar">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All types</option>
          {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <input type="text" className="search-input" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ minWidth: '140px' }} />
      </div>

      {loading ? (
        <div className="loading-state"><div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }}></div></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>{tickets.length === 0 ? 'No tickets yet.' : 'No tickets match your filters.'}</p></div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '30px' }}></th>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Opened by</th>
                <th>Assigned to</th>
                <th>Opened</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ticket => {
                const tc = getTicketTypeConfig(ticket.ticket_type)
                const pc = PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.normal
                const stc = STATUS_COLORS[ticket.status] || STATUS_COLORS.open
                return (
                  <tr key={ticket.id} onClick={() => navigate(`/tickets/${ticket.id}`)} style={{ cursor: 'pointer' }}>
                    <td><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: pc.dot }} title={ticket.priority} /></td>
                    <td><strong style={{ fontSize: '0.9rem' }}>{ticket.title}</strong></td>
                    <td><span className="badge" style={{ backgroundColor: 'var(--gray-100)', color: 'var(--gray-600)', fontSize: '0.7rem' }}>{tc?.icon} {tc?.label || ticket.ticket_type}</span></td>
                    <td><span className="badge" style={{ backgroundColor: stc.bg, color: stc.text }}>{ticket.status.replace('_', ' ')}</span></td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{ticket.opener?.full_name || '—'}</td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{ticket.assignee?.full_name || '—'}</td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{timeAgo(ticket.opened_at)}</td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{timeAgo(ticket.updated_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .tkt-tab { background: none; border: none; padding: 0.6rem 1.25rem; font-size: 0.9rem; font-weight: 600; font-family: inherit; color: var(--gray-500); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color 0.15s, border-color 0.15s; }
        .tkt-tab:hover { color: var(--gray-700); }
        .tkt-tab-active { color: var(--green-700); border-bottom-color: var(--green-700); }
      `}</style>
    </>
  )
}
