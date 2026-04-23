import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { friendlyError } from '../lib/errors'
import { logActivity } from '../lib/activity'
import { groupPositions, getRolesForPosition } from '../lib/boardPositionRoles'

export default function BoardPage() {
  const { currentOrg, hasAnyRole } = useOrg()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [positions, setPositions] = useState([])
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPosition, setSelectedPosition] = useState(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [invitePrefilledPosition, setInvitePrefilledPosition] = useState(null)
  const canEdit = hasAnyRole(['admin'])

  useEffect(() => { document.title = 'Board of Directors | My League Board' }, [])

  const fetchAll = useCallback(async () => {
    if (!currentOrg) return
    setLoading(true)
    const orgId = currentOrg.id

    const [posRes, memRes, invRes] = await Promise.all([
      supabase.from('board_positions')
        .select('*, profiles:assigned_to(id, full_name, email, phone, avatar_url)')
        .eq('organization_id', orgId)
        .order('sort_order'),
      supabase.from('organization_members')
        .select('*, profiles!profile_id(id, full_name, email, phone)')
        .eq('organization_id', orgId),
      supabase.from('invitations')
        .select('*')
        .eq('organization_id', orgId)
        .is('accepted_at', null)
    ])

    setPositions(posRes.data || [])
    setMembers(memRes.data || [])
    setInvitations(invRes.data || [])
    setLoading(false)
  }, [currentOrg])

  useEffect(() => { fetchAll() }, [fetchAll])

  const grouped = groupPositions(positions)
  const vacantPositions = positions.filter(p => !p.assigned_to)
  const filledCount = positions.filter(p => p.assigned_to).length

  function openInviteForPosition(pos) {
    setInvitePrefilledPosition(pos)
    setShowInviteModal(true)
  }

  function openInviteGeneral() {
    setInvitePrefilledPosition(null)
    setShowInviteModal(true)
  }

  if (loading) return (
    <div className="loading-state">
      <div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }} />
    </div>
  )

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Board of Directors</h1>
          <p className="text-muted">{filledCount} of {positions.length} positions filled</p>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={openInviteGeneral}>+ Invite member</button>
        )}
      </div>

      {grouped.map(group => (
        <div key={group.name} style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--gray-700)' }}>{group.name}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
            {group.positions.map(pos => (
              <PositionCard
                key={pos.id}
                position={pos}
                canEdit={canEdit}
                pendingInvite={invitations.find(i => i.board_position_id === pos.id)}
                onSelect={() => setSelectedPosition(pos)}
                onInvite={() => openInviteForPosition(pos)}
              />
            ))}
          </div>
        </div>
      ))}

      {selectedPosition && (
        <PositionDetailModal
          position={selectedPosition}
          members={members}
          pendingInvite={invitations.find(i => i.board_position_id === selectedPosition.id)}
          canEdit={canEdit}
          onClose={() => setSelectedPosition(null)}
          onAssign={async (positionId, profileId) => {
            const { error } = await supabase.from('board_positions').update({
              assigned_to: profileId || null,
              appointed_date: profileId ? new Date().toISOString().split('T')[0] : null
            }).eq('id', positionId)
            if (error) { addToast(friendlyError(error), 'error'); return }

            const pos = positions.find(p => p.id === positionId)

            // Auto-grant user_roles for the position
            if (profileId) {
              const rolesToGrant = getRolesForPosition(pos.title)
              for (const role of rolesToGrant) {
                await supabase.from('user_roles').upsert({
                  user_id: profileId,
                  organization_id: currentOrg.id,
                  role,
                  scope_type: 'league',
                  assigned_by: user.id
                }, { onConflict: 'user_id,organization_id,role,scope_type,scope_id' })
              }
            }

            const member = members.find(m => m.profile_id === profileId)
            addToast(profileId
              ? `${member?.profiles?.full_name || 'Member'} assigned to ${pos?.title}`
              : `${pos?.title} unassigned`)
            logActivity(currentOrg.id, profileId ? 'position assigned' : 'position unassigned', 'board', pos?.title, profileId ? member?.profiles?.full_name : null)
            fetchAll()
            setSelectedPosition(null)
          }}
          onInvite={() => { setSelectedPosition(null); openInviteForPosition(selectedPosition) }}
        />
      )}

      {showInviteModal && (
        <InviteModal
          orgId={currentOrg.id}
          userId={user.id}
          vacantPositions={vacantPositions}
          prefilledPosition={invitePrefilledPosition}
          onClose={() => { setShowInviteModal(false); setInvitePrefilledPosition(null) }}
          onSent={() => { fetchAll(); setShowInviteModal(false); setInvitePrefilledPosition(null) }}
        />
      )}
    </>
  )
}

// ─── Position Card ───────────────────────────────────────────────

function PositionCard({ position, canEdit, pendingInvite, onSelect, onInvite }) {
  const pos = position
  const roleBadges = getRolesForPosition(pos.title)

  return (
    <div
      onClick={onSelect}
      style={{
        background: 'white',
        border: pos.assigned_to ? '1px solid var(--green-200)' : '1px dashed var(--gray-300)',
        borderRadius: 'var(--radius-lg)',
        padding: '1rem',
        opacity: pos.assigned_to ? 1 : 0.75,
        cursor: 'pointer',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{pos.title}</div>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            {pos.is_required && (
              <span style={{ fontSize: '0.6rem', background: 'var(--green-50)', color: 'var(--green-700)', padding: '0.1rem 0.4rem', borderRadius: '6px', fontWeight: 500 }}>Required</span>
            )}
            {roleBadges.map(r => (
              <span key={r} style={{ fontSize: '0.6rem', background: 'var(--gray-100)', color: 'var(--gray-600)', padding: '0.1rem 0.4rem', borderRadius: '6px' }}>{r}</span>
            ))}
          </div>
        </div>
      </div>

      {pos.description && (
        <p className="text-muted" style={{ fontSize: '0.75rem', lineHeight: 1.4, marginBottom: '0.75rem' }}>{pos.description}</p>
      )}

      {pos.assigned_to ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'var(--green-50)', borderRadius: 'var(--radius)', padding: '0.5rem 0.75rem' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--green-200)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.8rem', fontWeight: 600, color: 'var(--green-800)', flexShrink: 0,
            overflow: 'hidden'
          }}>
            {pos.profiles?.avatar_url
              ? <img src={pos.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (pos.profiles?.full_name || '?').charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{pos.profiles?.full_name || 'Unknown'}</div>
            <div className="text-muted" style={{ fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pos.profiles?.email}
              {pos.profiles?.phone ? ' \u00b7 ' + pos.profiles.phone : ''}
            </div>
          </div>
        </div>
      ) : pendingInvite ? (
        <div style={{ textAlign: 'center', padding: '0.5rem', background: 'var(--yellow-50, #fffbeb)', borderRadius: 'var(--radius)', border: '1px dashed var(--yellow-300, #fcd34d)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--yellow-700, #a16207)' }}>
            Invite pending: {pendingInvite.email}
          </span>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '0.5rem' }}>
          {canEdit ? (
            <button
              className="btn-secondary"
              onClick={e => { e.stopPropagation(); onInvite() }}
              style={{ fontSize: '0.8rem', width: '100%' }}
            >
              Assign / Invite
            </button>
          ) : (
            <span className="text-muted" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>Vacant</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Position Detail Modal ───────────────────────────────────────

function PositionDetailModal({ position, members, pendingInvite, canEdit, onClose, onAssign, onInvite }) {
  const [showAssignPicker, setShowAssignPicker] = useState(false)
  const pos = position
  const roleBadges = getRolesForPosition(pos.title)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>{pos.title}</h2>
          <button className="btn-icon" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-form">
          {pos.description && (
            <p className="text-muted" style={{ marginBottom: '1rem' }}>{pos.description}</p>
          )}

          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {pos.is_required && (
              <span style={{ fontSize: '0.7rem', background: 'var(--green-50)', color: 'var(--green-700)', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 500 }}>Required</span>
            )}
            {roleBadges.map(r => (
              <span key={r} style={{ fontSize: '0.7rem', background: 'var(--gray-100)', color: 'var(--gray-600)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                Role: {r}
              </span>
            ))}
          </div>

          {pos.assigned_to ? (
            <div style={{ background: 'var(--green-50)', borderRadius: 'var(--radius-lg)', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{pos.profiles?.full_name || 'Unknown'}</div>
              <div className="text-muted" style={{ fontSize: '0.85rem' }}>{pos.profiles?.email}</div>
              {pos.profiles?.phone && <div className="text-muted" style={{ fontSize: '0.85rem' }}>{pos.profiles.phone}</div>}
              {pos.appointed_date && (
                <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  Appointed: {new Date(pos.appointed_date).toLocaleDateString()}
                </div>
              )}
              {pos.term_expires && (
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                  Term expires: {new Date(pos.term_expires).toLocaleDateString()}
                </div>
              )}
            </div>
          ) : pendingInvite ? (
            <div style={{ background: 'var(--yellow-50, #fffbeb)', borderRadius: 'var(--radius-lg)', padding: '1rem', marginBottom: '1rem', border: '1px dashed var(--yellow-300, #fcd34d)' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--yellow-700, #a16207)' }}>Invitation pending</div>
              <div className="text-muted" style={{ fontSize: '0.85rem' }}>{pendingInvite.full_name || pendingInvite.email}</div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Sent {new Date(pendingInvite.created_at).toLocaleDateString()}</div>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Expires {new Date(pendingInvite.expires_at).toLocaleDateString()}</div>
            </div>
          ) : (
            <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-lg)', padding: '1rem', marginBottom: '1rem', textAlign: 'center' }}>
              <span className="text-muted" style={{ fontStyle: 'italic' }}>This position is vacant</span>
            </div>
          )}

          {canEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pos.assigned_to ? (
                <button
                  className="btn-secondary"
                  onClick={() => onAssign(pos.id, null)}
                  style={{ color: 'var(--red-500)' }}
                >
                  Unassign {pos.profiles?.full_name}
                </button>
              ) : (
                <>
                  <button className="btn-primary" onClick={onInvite}>
                    Send invitation
                  </button>
                  <button className="btn-secondary" onClick={() => setShowAssignPicker(true)}>
                    Assign existing member
                  </button>
                </>
              )}
            </div>
          )}

          {showAssignPicker && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gray-600)' }}>Select a member:</div>
              {members.map(m => (
                <button
                  key={m.id}
                  onClick={() => onAssign(pos.id, m.profile_id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.65rem 0.75rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
                    borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{m.profiles?.full_name || 'Unknown'}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>{m.profiles?.email}</div>
                  </div>
                  <span style={{ color: 'var(--green-600)', fontWeight: 500, fontSize: '0.8rem' }}>Assign</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Invite Modal ────────────────────────────────────────────────

function InviteModal({ orgId, userId, vacantPositions, prefilledPosition, onClose, onSent }) {
  const { addToast } = useToast()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [positionId, setPositionId] = useState(prefilledPosition?.id || '')
  const [extraRoles, setExtraRoles] = useState([])
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [inviteLink, setInviteLink] = useState(null)

  const allRoleOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'coach', label: 'Coach' },
    { value: 'division_vp', label: 'Division VP' },
    { value: 'treasurer', label: 'Treasurer' },
    { value: 'equipment_manager', label: 'Equipment Manager' },
    { value: 'safety_officer', label: 'Safety Officer' },
    { value: 'field_manager', label: 'Field Manager' },
    { value: 'uniform_manager', label: 'Uniform Manager' },
    { value: 'scheduling_manager', label: 'Scheduling Manager' },
    { value: 'registration_manager', label: 'Registration Manager' },
    { value: 'player_agent', label: 'Player Agent' },
    { value: 'umpire_coordinator', label: 'Umpire Coordinator' },
    { value: 'sponsorship_coordinator', label: 'Sponsorship Coordinator' },
    { value: 'board_member', label: 'Board Member' },
    { value: 'volunteer', label: 'Volunteer' },
  ]

  function toggleRole(role) {
    setExtraRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { setError('Please enter a valid email'); return }
    setSubmitting(true)
    setError(null)

    // Build intended_roles: position-implied roles + any extras
    const selectedPos = vacantPositions.find(p => p.id === positionId)
    const positionRoles = selectedPos ? getRolesForPosition(selectedPos.title) : []
    const allIntended = [...new Set([...positionRoles, ...extraRoles])]

    const { data, error: insertError } = await supabase
      .from('invitations')
      .insert({
        organization_id: orgId,
        email,
        full_name: fullName || null,
        phone: phone || null,
        role: 'board_member', // legacy column — the real roles are in intended_roles
        board_position_id: positionId || null,
        intended_roles: allIntended,
        welcome_message: welcomeMessage || null,
        invited_by: userId,
      })
      .select('id, token')
      .single()

    if (insertError) {
      if (insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
        setError('An invitation for this email already exists in this league.')
      } else {
        setError(friendlyError(insertError))
      }
      setSubmitting(false)
      return
    }

    const link = `${window.location.origin}/accept-invite?token=${data.token}`
    setInviteLink(link)

    logActivity(orgId, 'invitation sent', 'member', fullName || email, selectedPos?.title || null)

    // Send invitation email via Edge Function
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
    } catch {
      // fallback — select the text
    }
  }

  // After link is generated, show it
  if (inviteLink) {
    return (
      <div className="modal-overlay" onClick={() => { onSent() }}>
        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
          <div className="modal-header">
            <h2>Invitation created</h2>
            <button className="btn-icon" onClick={onSent}>&times;</button>
          </div>
          <div className="modal-form">
            <p style={{ marginBottom: '0.75rem', color: 'var(--gray-600)' }}>
              Share this link with <strong>{fullName || email}</strong> to join:
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                readOnly
                value={inviteLink}
                style={{ flex: 1, fontSize: '0.8rem', fontFamily: 'monospace' }}
                onFocus={e => e.target.select()}
              />
              <button className="btn-primary" onClick={copyLink} style={{ whiteSpace: 'nowrap' }}>Copy</button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>
              This link expires in 7 days. The invitee will need to sign up or sign in to accept.
            </p>
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="btn-secondary" onClick={onSent}>Done</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h2>Invite to board</h2>
          <button className="btn-icon" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error">{error}</div>}

          <div className="form-group">
            <label>Full name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" />
          </div>

          <div className="form-group">
            <label>Email address *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" required />
          </div>

          <div className="form-group">
            <label>Phone</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
          </div>

          <div className="form-group">
            <label>Board position</label>
            <select value={positionId} onChange={e => setPositionId(e.target.value)}>
              <option value="">No specific position</option>
              {vacantPositions.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <span className="text-muted" style={{ fontSize: '0.7rem' }}>
              Roles implied by the position will be granted automatically
            </span>
          </div>

          <div className="form-group">
            <label>Additional roles</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {allRoleOptions.map(r => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => toggleRole(r.value)}
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '6px',
                    border: extraRoles.includes(r.value) ? '1px solid var(--green-500)' : '1px solid var(--gray-200)',
                    background: extraRoles.includes(r.value) ? 'var(--green-50)' : 'white',
                    color: extraRoles.includes(r.value) ? 'var(--green-700)' : 'var(--gray-600)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Welcome message</label>
            <textarea
              value={welcomeMessage}
              onChange={e => setWelcomeMessage(e.target.value)}
              placeholder="Optional personal message..."
              rows={2}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
