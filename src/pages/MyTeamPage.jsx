import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { fetchCoachTeams } from '../lib/coachTeams'
import { useToast } from '../components/Toast'
import { useUserRoles } from '../hooks/useUserRoles'
import { logActivity } from '../lib/activity'
import { STATUS_COLORS, getTicketTypeConfig, PRIORITY_COLORS } from '../lib/ticketRouting'

const BAG_STATUS_CONFIG = {
  building: { label: 'Building', color: '#f97316', bg: '#ffedd5' },
  assigned: { label: 'Assigned', color: '#3b82f6', bg: '#dbeafe' },
  returned: { label: 'Returned', color: '#16a34a', bg: '#d4edda' },
}

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

export default function MyTeamPage() {
  const { team_id } = useParams()
  const navigate = useNavigate()
  const { currentOrg } = useOrg()
  const { user } = useAuth()

  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (currentOrg && user) loadTeams()
  }, [currentOrg, user])

  async function loadTeams() {
    setLoading(true)
    const t = await fetchCoachTeams(currentOrg.id, user.id)
    setTeams(t)
    setLoading(false)
  }

  useEffect(() => {
    document.title = 'My Team | My League Board'
  }, [])

  if (loading) return <div className="loading-state" style={{ padding: '3rem' }}>Loading...</div>

  // No teams — empty state
  if (teams.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
        <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>You're not assigned as a coach for any team yet.</p>
        <p className="text-muted">If you believe this is an error, contact your league administrator.</p>
      </div>
    )
  }

  // If exactly 1 team and no team_id in URL, render that team directly
  // If team_id is in URL, render that team
  // If 2+ teams and no team_id, show picker
  const selectedTeamId = team_id || (teams.length === 1 ? teams[0].id : null)

  if (selectedTeamId) {
    const team = teams.find(t => t.id === selectedTeamId)
    if (!team) {
      return (
        <div className="empty-state">
          <p>Team not found or you don't have access.</p>
          <button className="btn-secondary" onClick={() => navigate('/my-team')}>Back</button>
        </div>
      )
    }
    return <TeamDetail team={team} showBackToList={teams.length > 1} />
  }

  // Multi-team picker
  return <TeamPicker teams={teams} />
}

function TeamPicker({ teams }) {
  const navigate = useNavigate()
  const { currentOrg } = useOrg()
  const [bagStatuses, setBagStatuses] = useState({})

  useEffect(() => {
    if (!currentOrg) return
    const teamIds = teams.map(t => t.id)
    supabase
      .from('team_bags')
      .select('id, team_id, status')
      .eq('organization_id', currentOrg.id)
      .in('team_id', teamIds)
      .then(({ data }) => {
        const map = {}
        for (const bag of (data || [])) {
          map[bag.team_id] = bag.status
        }
        setBagStatuses(map)
      })
  }, [currentOrg, teams])

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Teams</h1>
          <p className="text-muted">Select a team to view details</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {teams.map(team => {
          const bagStatus = bagStatuses[team.id]
          const sc = bagStatus ? BAG_STATUS_CONFIG[bagStatus] : null
          return (
            <div
              key={team.id}
              onClick={() => navigate(`/my-team/${team.id}`)}
              style={{
                background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)',
                padding: '1.25rem', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green-400)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--green-900)', marginBottom: '0.35rem' }}>{team.name}</h3>
              <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                {team.divisions?.name || 'No division'}
                {team.divisions?.sport_types?.name ? ` - ${team.divisions.sport_types.name}` : ''}
              </p>
              {sc && (
                <span className="badge" style={{ backgroundColor: sc.bg, color: sc.color, fontSize: '0.75rem' }}>
                  Bag: {sc.label}
                </span>
              )}
              {!bagStatus && (
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>No bag assigned</span>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function TeamDetail({ team, showBackToList }) {
  const navigate = useNavigate()
  const { currentOrg } = useOrg()
  const { user } = useAuth()
  const { roles } = useUserRoles(currentOrg?.id, user?.id)

  const [bag, setBag] = useState(null)
  const [bagItems, setBagItems] = useState([])
  const [tickets, setTickets] = useState([])
  const [headCoach, setHeadCoach] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)

  // Can invite assistant coaches if: head coach of this team, admin, or has coach role for this team
  const isAdmin = roles.some(r => r.role === 'admin')
  const isHeadCoach = team.head_coach_id === user?.id
  const hasCoachRole = roles.some(r => r.role === 'coach' && r.scope_type === 'team' && r.scope_id === team.id)
  const canInviteCoach = isAdmin || isHeadCoach || hasCoachRole

  useEffect(() => {
    if (currentOrg && team) fetchTeamData()
  }, [currentOrg, team])

  useEffect(() => {
    if (team) document.title = `${team.name} | My Team | My League Board`
  }, [team])

  async function fetchTeamData() {
    setLoading(true)
    const orgId = currentOrg.id

    // Fetch bag, tickets, and head coach in parallel
    const [bagRes, ticketRes, teamFullRes] = await Promise.all([
      supabase
        .from('team_bags')
        .select('id, status, bag_tag, seasons(name)')
        .eq('organization_id', orgId)
        .eq('team_id', team.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('tickets')
        .select('*')
        .eq('organization_id', orgId)
        .eq('team_id', team.id)
        .order('updated_at', { ascending: false })
        .limit(5),
      supabase
        .from('teams')
        .select('head_coach_id, profiles!head_coach_id(full_name)')
        .eq('id', team.id)
        .single()
    ])

    setTickets(ticketRes.data || [])

    if (teamFullRes.data?.profiles) {
      setHeadCoach(teamFullRes.data.profiles)
    }

    if (bagRes.data) {
      setBag(bagRes.data)
      // Fetch bag items
      const { data: items } = await supabase
        .from('team_bag_items')
        .select('*, equipment_categories(name), equipment_items(name, brand, item_condition)')
        .eq('team_bag_id', bagRes.data.id)
        .order('is_required', { ascending: false })
      setBagItems(items || [])
    } else {
      setBag(null)
      setBagItems([])
    }

    setLoading(false)
  }

  if (loading) return <div className="loading-state" style={{ padding: '3rem' }}>Loading...</div>

  const sc = bag ? (BAG_STATUS_CONFIG[bag.status] || BAG_STATUS_CONFIG.building) : null

  return (
    <>
      {showBackToList && (
        <button className="btn-secondary" onClick={() => navigate('/my-team')} style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
          ← Back to my teams
        </button>
      )}

      {/* Header */}
      <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--green-900)', marginBottom: '0.35rem' }}>{team.name}</h1>
        <p className="text-muted" style={{ fontSize: '0.9rem' }}>
          {team.divisions?.name || 'No division'}
          {team.divisions?.sport_types?.name ? ` - ${team.divisions.sport_types.name}` : ''}
        </p>
        {sc && (
          <span className="badge" style={{ backgroundColor: sc.bg, color: sc.color, fontSize: '0.8rem', marginTop: '0.5rem', display: 'inline-block' }}>
            Bag: {sc.label}
          </span>
        )}
        {headCoach && headCoach.full_name && (
          <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
            Head coach: {headCoach.full_name}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button
          className="btn-primary"
          onClick={() => navigate(`/tickets/new?team_id=${team.id}`)}
          style={{ fontSize: '0.95rem', padding: '0.65rem 1.25rem' }}
        >
          + Report issue
        </button>
        <button
          className="btn-secondary"
          onClick={() => navigate(`/tickets?team=${team.id}`)}
          style={{ fontSize: '0.95rem', padding: '0.65rem 1.25rem' }}
        >
          View all my tickets
        </button>
        {canInviteCoach && (
          <button
            className="btn-secondary"
            onClick={() => setShowInviteModal(true)}
            style={{ fontSize: '0.95rem', padding: '0.65rem 1.25rem' }}
          >
            + Invite assistant coach
          </button>
        )}
      </div>

      {showInviteModal && (
        <InviteCoachModal
          orgId={currentOrg.id}
          userId={user.id}
          team={team}
          onClose={() => setShowInviteModal(false)}
          onSent={() => setShowInviteModal(false)}
        />
      )}

      {/* Team bag section */}
      <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--green-900)', marginBottom: '0.75rem' }}>Team bag</h2>

        {!bag && (
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>No bag assigned yet. Contact your equipment manager.</p>
        )}

        {bag && bag.status === 'building' && (
          <div style={{ padding: '0.75rem', background: 'var(--orange-50, #fff7ed)', borderRadius: 'var(--radius)', border: '1px solid var(--orange-200, #fed7aa)', marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--orange-700, #c2410c)' }}>
              Your bag is being assembled. Check back soon or contact the equipment manager.
            </p>
          </div>
        )}

        {bag && bag.status === 'returned' && (
          <div style={{ padding: '0.75rem', background: 'var(--green-50)', borderRadius: 'var(--radius)', border: '1px solid var(--green-200)', marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--green-700)' }}>
              Your bag for this season has been returned.
            </p>
          </div>
        )}

        {bag && bagItems.length > 0 && (
          <div>
            {bagItems.map(item => {
              const isPacked = item.is_packed
              const itemStatus = item.status
              const isLost = itemStatus === 'lost'
              const isSwapped = itemStatus === 'swapped_out'

              let icon = isPacked ? '✅' : '⬜'
              if (isLost) icon = '❌'
              if (isSwapped) icon = '⚠️'

              return (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.65rem 0', borderBottom: '1px solid var(--gray-100)',
                  opacity: isLost ? 0.5 : 1
                }}>
                  <span style={{ fontSize: '0.9rem', flexShrink: 0, marginTop: '0.1rem' }}>{icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                      {item.equipment_categories?.name || 'Unknown'}
                      {isSwapped && <span style={{ fontSize: '0.75rem', color: 'var(--orange-500)', marginLeft: '0.4rem' }}>(Swapped)</span>}
                      {isLost && <span style={{ fontSize: '0.75rem', color: 'var(--red-500)', marginLeft: '0.4rem' }}>(Lost)</span>}
                    </div>
                    {isPacked && item.equipment_items && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginTop: '0.1rem' }}>
                        {item.equipment_items.name}
                        {item.equipment_items.brand ? `, ${item.equipment_items.brand}` : ''}
                        {item.equipment_items.item_condition ? ` — ${item.equipment_items.item_condition}` : ''}
                      </div>
                    )}
                    {item.notes && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '0.1rem', fontStyle: 'italic' }}>{item.notes}</div>
                    )}
                  </div>
                  {isPacked && !isLost && !isSwapped && bag.status === 'assigned' && (
                    <button
                      className="btn-small"
                      style={{ flexShrink: 0, fontSize: '0.75rem', background: 'white', color: 'var(--gray-600)', border: '1px solid var(--gray-200)' }}
                      onClick={() => navigate(`/tickets/new?team_bag_item_id=${item.id}&team_id=${team.id}`)}
                    >
                      Report issue
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent tickets */}
      <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--green-900)', marginBottom: '0.75rem' }}>Recent tickets for this team</h2>

        {tickets.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>No tickets yet.</p>
        ) : (
          <div>
            {tickets.map(ticket => {
              const tc = getTicketTypeConfig(ticket.ticket_type)
              const stc = STATUS_COLORS[ticket.status] || STATUS_COLORS.open
              return (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.6rem 0', borderBottom: '1px solid var(--gray-100)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{ticket.title}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {tc?.icon} {tc?.label || ticket.ticket_type} — {timeAgo(ticket.updated_at)}
                    </div>
                  </div>
                  <span className="badge" style={{ backgroundColor: stc.bg, color: stc.text, fontSize: '0.7rem', flexShrink: 0 }}>
                    {ticket.status.replace('_', ' ')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Invite Coach Modal ──────────────────────────────────────────

function InviteCoachModal({ orgId, userId, team, onClose, onSent }) {
  const { addToast } = useToast()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [inviteLink, setInviteLink] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fullName.trim()) { setError('Full name is required'); return }
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { setError('Please enter a valid email'); return }
    setSubmitting(true)
    setError(null)

    const { data, error: insertError } = await supabase
      .from('invitations')
      .insert({
        organization_id: orgId,
        email,
        full_name: fullName || null,
        phone: phone || null,
        role: 'coach',
        board_position_id: null,
        intended_roles: ['coach'],
        welcome_message: welcomeMessage || null,
        invited_by: userId,
        scope_type: 'team',
        scope_id: team.id,
      })
      .select('id, token')
      .single()

    if (insertError) {
      if (insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
        setError('An invitation for this email already exists in this league.')
      } else {
        setError(insertError.message)
      }
      setSubmitting(false)
      return
    }

    const link = `${window.location.origin}/accept-invite?token=${data.token}`
    setInviteLink(link)

    logActivity(orgId, 'coach invitation sent', 'team', team.name, `Invited ${fullName || email} as assistant coach`)

    // Send invitation email
    const { data: emailResult, error: emailError } = await supabase.functions.invoke(
      'send-invitation-email',
      { body: { invitation_id: data.id } }
    )

    if (emailError || !emailResult?.success) {
      console.error('Email send failed', emailError || emailResult)
      addToast('Invitation created but email failed to send. Share the link manually.', 'warning')
    } else {
      addToast(`Invitation sent to ${email}`)
    }

    setSubmitting(false)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink)
      addToast('Link copied to clipboard')
    } catch { /* clipboard not available */ }
  }

  if (inviteLink) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--green-900)', marginBottom: '1rem' }}>Invitation created</h2>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
            Share this link with {fullName || email} to join as an assistant coach for {team.name}:
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              readOnly
              value={inviteLink}
              style={{ flex: 1, fontSize: '0.8rem', padding: '0.5rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)' }}
              onFocus={e => e.target.select()}
            />
            <button className="btn-primary" onClick={copyLink} style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Copy</button>
          </div>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
            This link expires in 7 days. The invitee will need to sign up or sign in to accept.
          </p>
          <button className="btn-secondary" onClick={onClose} style={{ width: '100%' }}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--green-900)', marginBottom: '0.25rem' }}>
          Invite assistant coach
        </h2>
        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          for {team.name}{team.divisions?.name ? ` (${team.divisions.name})` : ''}
        </p>

        {error && <div className="form-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label className="form-label">Full name *</label>
            <input className="form-input" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Coach name" required />
          </div>
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label className="form-label">Email *</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="coach@example.com" required />
          </div>
          <div className="form-group" style={{ marginBottom: '0.75rem' }}>
            <label className="form-label">Phone <span className="text-muted">(optional)</span></label>
            <input className="form-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="555-123-4567" />
          </div>
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Welcome message <span className="text-muted">(optional)</span></label>
            <textarea
              className="form-input"
              rows={2}
              value={welcomeMessage}
              onChange={e => setWelcomeMessage(e.target.value)}
              placeholder="A personal note for the new coach..."
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
