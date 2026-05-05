import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { friendlyError } from '../lib/errors'
import { formatRoleLabel, PRIMARY_MEMBER_ROLES } from '../lib/roles'
import { logActivity } from '../lib/activity'

export default function MembersPage() {
  const { currentOrg, hasAnyRole } = useOrg()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [positions, setPositions] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddMember, setShowAddMember] = useState(false)
  const [assigningPosition, setAssigningPosition] = useState(null)
  const canEdit = hasAnyRole(['admin'])

  useEffect(() => { document.title = 'Board directory | My League Board' }, [])

  const fetchAll = useCallback(async () => {
    if (!currentOrg) return
    setLoading(true)
    const orgId = currentOrg.id

    const [posRes, memRes] = await Promise.all([
      supabase.from('board_positions').select('*, profiles:assigned_to(id, full_name, email, phone)').eq('organization_id', orgId).order('sort_order'),
      supabase.from('organization_members').select('*, profiles!profile_id(id, full_name, email, phone)').eq('organization_id', orgId)
    ])

    setPositions(posRes.data || [])
    setMembers(memRes.data || [])
    setLoading(false)
  }, [currentOrg])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function assignPosition(positionId, profileId) {
    const { error } = await supabase.from('board_positions').update({
      assigned_to: profileId || null,
      appointed_date: profileId ? new Date().toISOString().split('T')[0] : null
    }).eq('id', positionId)
    if (error) addToast(friendlyError(error), 'error')
    else {
      const pos = positions.find(p => p.id === positionId)
      const member = members.find(m => m.profile_id === profileId)
      addToast(profileId ? `${member?.profiles?.full_name || 'Member'} assigned to ${pos?.title}` : `${pos?.title} unassigned`)
      logActivity(currentOrg.id, profileId ? 'position assigned' : 'position unassigned', 'board', pos?.title, profileId ? member?.profiles?.full_name : null)
      fetchAll()
    }
  }

  async function changeRole(memberId, newRole) {
    const { error } = await supabase.from('organization_members').update({ role: newRole }).eq('id', memberId)
    if (error) addToast(friendlyError(error), 'error')
    else { addToast('Role updated'); fetchAll() }
  }

  async function removeMember(member) {
    if (member.profile_id === user.id) { addToast("You can't remove yourself", 'error'); return }
    if (!confirm(`Remove ${member.profiles?.full_name || member.profiles?.email}? They will lose access to this league.`)) return
    const { error } = await supabase.from('organization_members').delete().eq('id', member.id)
    if (!error) { addToast('Member removed'); logActivity(currentOrg.id, 'member removed', 'member', member.profiles?.full_name); fetchAll() }
  }

  if (loading) return (
    <div className="loading-state"><div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }}></div></div>
  )

  const filledPositions = positions.filter(p => p.assigned_to)
  const vacantPositions = positions.filter(p => !p.assigned_to)

  return (
    <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Board directory</h1>
            <p className="text-muted">{filledPositions.length} of {positions.length} positions filled · {members.length} members</p>
          </div>
          {canEdit && <button className="btn-primary" onClick={() => setShowAddMember(true)}>+ Add member</button>}
        </div>

        {/* Board Positions */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--gray-700)' }}>Board of directors</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
            {positions.map(pos => (
              <div key={pos.id} style={{
                background: 'white',
                border: pos.assigned_to ? '1px solid var(--green-200)' : '1px dashed var(--gray-300)',
                borderRadius: 'var(--radius-lg)',
                padding: '1rem',
                opacity: pos.assigned_to ? 1 : 0.75
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{pos.title}</div>
                    {pos.is_required && <span style={{ fontSize: '0.65rem', background: 'var(--green-50)', color: 'var(--green-700)', padding: '0.1rem 0.4rem', borderRadius: '6px', fontWeight: 500 }}>Required</span>}
                  </div>
                </div>
                <p className="text-muted" style={{ fontSize: '0.75rem', lineHeight: 1.4, marginBottom: '0.75rem' }}>{pos.description}</p>

                {pos.assigned_to ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--green-50)', borderRadius: 'var(--radius)', padding: '0.5rem 0.75rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{pos.profiles?.full_name || 'Unknown'}</div>
                      <div className="text-muted" style={{ fontSize: '0.7rem' }}>{pos.profiles?.email}{pos.profiles?.phone ? ' · ' + pos.profiles.phone : ''}</div>
                      {pos.appointed_date && <div className="text-muted" style={{ fontSize: '0.65rem' }}>Since {new Date(pos.appointed_date).toLocaleDateString()}</div>}
                    </div>
                    {canEdit && <button className="btn-small" onClick={() => assignPosition(pos.id, null)} style={{ fontSize: '0.7rem', color: 'var(--red-500)', background: 'none', border: 'none', cursor: 'pointer' }}>Unassign</button>}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '0.5rem' }}>
                    {canEdit ? (
                      <button className="btn-secondary" onClick={() => setAssigningPosition(pos)} style={{ fontSize: '0.8rem', width: '100%' }}>Assign member</button>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>Vacant</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* All Members */}
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--gray-700)' }}>All members</h2>
          <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <table className="data-table mp-members-table" style={{ marginBottom: 0 }}>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th className="mp-remove-col"></th></tr></thead>
              <tbody>
                {members.map(m => {
                  const canRemove = canEdit && m.profile_id !== user.id
                  return (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 500 }}>{m.profiles?.full_name || '—'}</td>
                      <td>{m.profiles?.email}</td>
                      <td>
                        {canEdit && m.profile_id !== user.id ? (
                          <select value={m.role} onChange={e => changeRole(m.id, e.target.value)} className="mp-role-select" style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', fontFamily: 'inherit', background: 'white' }}>
                            {PRIMARY_MEMBER_ROLES.map(role => (
                              <option key={role} value={role}>{formatRoleLabel(role)}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: '0.8rem' }}>{formatRoleLabel(m.role)}{m.profile_id === user.id ? ' (You)' : ''}</span>
                        )}
                        {/* Mobile-only inline Remove — desktop renders it in the
                            4th column (hidden at <=768px via CSS). M-04 fix. */}
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => removeMember(m)}
                            className="mp-remove-mobile"
                          >Remove</button>
                        )}
                      </td>
                      <td className="mp-remove-col" style={{ textAlign: 'right' }}>
                        {canRemove && (
                          <button onClick={() => removeMember(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-500)', fontSize: '0.8rem' }}>Remove</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assign Position Modal */}
        {assigningPosition && (
          <div className="modal-overlay" onClick={() => setAssigningPosition(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Assign {assigningPosition.title}</h2>
                <button className="btn-icon" onClick={() => setAssigningPosition(null)} aria-label="Close">✕</button>
              </div>
              <div className="modal-form">
                <p className="text-muted" style={{ marginBottom: '1rem' }}>{assigningPosition.description}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {members.map(m => (
                    <button key={m.id} onClick={() => { assignPosition(assigningPosition.id, m.profile_id); setAssigningPosition(null) }} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.65rem 0.75rem', background: 'var(--gray-50)', border: '1px solid var(--gray-200)',
                      borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left'
                    }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{m.profiles?.full_name || 'Unknown'}</div>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{m.profiles?.email}</div>
                      </div>
                      <span style={{ color: 'var(--green-600)', fontWeight: 500, fontSize: '0.8rem' }}>Assign →</span>
                    </button>
                  ))}
                </div>
                <div className="modal-actions" style={{ marginTop: '1rem' }}>
                  <button className="btn-secondary" onClick={() => setAssigningPosition(null)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Member Modal */}
        {showAddMember && (
          <AddMemberModal
            orgId={currentOrg.id}
            onClose={() => setShowAddMember(false)}
            onAdded={fetchAll}
          />
        )}

        <style>{`
          /* M-04 fix. The All-members table renders a 4th column with the
             Remove action on desktop; at <=768px the table can't fit 4 cols
             without horizontal-scrolling past the parent's overflow:hidden,
             which clipped the Remove action with no recovery. Mobile drops
             the 4th column and inlines a Remove button under the role
             select instead. */
          .mp-remove-mobile { display: none; }
          @media (max-width: 768px) {
            .mp-members-table { min-width: 0; }
            .mp-remove-col { display: none; }
            .mp-role-select { min-height: 44px; }
            .mp-remove-mobile {
              display: inline-flex;
              align-items: center;
              margin-top: 0.5rem;
              padding: 0.4rem 0.75rem;
              background: none;
              border: 1px solid var(--gray-200);
              border-radius: var(--radius);
              color: var(--red-500);
              font-size: 0.8rem;
              font-family: inherit;
              cursor: pointer;
              min-height: 44px;
            }
            .mp-remove-mobile:hover, .mp-remove-mobile:active {
              background: var(--red-100);
              border-color: var(--red-100);
            }
          }
        `}</style>
    </>
  )
}

function AddMemberModal({ orgId, onClose, onAdded }) {
  const fullNameRef = useRef(null)
  const modalRef = useFocusTrap({ onClose, initialFocusRef: fullNameRef })
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('coach')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const { addToast } = useToast()

  function generateTempPassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let pw = ''
    for (let i = 0; i < 8; i++) pw += chars[Math.floor(Math.random() * chars.length)]
    setPassword(pw)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { setError('Please enter a valid email'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    setSubmitting(true)
    setError(null)

    try {
      // Step 1: Create the auth user via Supabase signUp
      // The user will need to change their password on first login
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName }
        }
      })

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError('This email is already registered. They can sign in and you can add them manually.')
          setSubmitting(false)
          return
        }
        throw signUpError
      }

      const userId = signUpData.user?.id
      if (!userId) throw new Error('Failed to create user account')

      // Step 2: Create their profile
      await supabase.from('profiles').upsert({
        id: userId,
        email,
        full_name: fullName
      })

      // Step 3: Add them to the organization with the selected role
      const { error: memberError } = await supabase.from('organization_members').insert({
        organization_id: orgId,
        profile_id: userId,
        role
      })

      if (memberError) throw memberError

      // Step 4: Log the activity
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('activity_log').insert({
        organization_id: orgId,
        actor_id: user.id,
        action: 'member added',
        entity_type: 'member',
        entity_name: fullName,
        details: `Added as ${role}`
      })

      addToast(`${fullName} added as ${formatRoleLabel(role)}. Temp password: ${password}`, 'success')
      onAdded()
      onClose()
    } catch (err) {
      setError(friendlyError(err))
    }
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="mem-add-modal-title">
        <div className="modal-header">
          <h2 id="mem-add-modal-title">Add a member</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error">{error}</div>}
          <div className="form-group">
            <label>Full name *</label>
            <input ref={fullNameRef} type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Smith" required />
          </div>
          <div className="form-group">
            <label>Email address *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" required />
          </div>
          <div className="form-group">
            <label>Temporary password *</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required style={{ flex: 1 }} />
              <button type="button" className="btn-secondary" onClick={generateTempPassword} style={{ whiteSpace: 'nowrap' }}>Generate</button>
            </div>
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>They'll change this after first login</span>
          </div>
          <div className="form-group">
            <label>Role *</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option value="admin">President / Admin — full control of everything</option>
              <option value="equipment_manager">Equipment Manager — manages all gear and locations</option>
              <option value="safety_officer">Safety Officer — manages incidents, background checks, first aid</option>
              <option value="coach">Coach — views their team's gear status</option>
              <option value="board_member">Board Member — read-only oversight of all areas</option>
              <option value="volunteer">Volunteer — limited view for helpers</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Creating account...' : 'Add member'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
