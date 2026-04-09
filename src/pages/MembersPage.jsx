import { useState, useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { friendlyError } from '../lib/errors'
import { logActivity } from '../lib/activity'
import Sidebar from '../components/Sidebar'

export default function MembersPage() {
  const { currentOrg } = useOrg()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)

  useEffect(() => { document.title = 'Members | My League Board' }, [])
  useEffect(() => { if (currentOrg) fetchAll() }, [currentOrg])

  async function fetchAll() {
    setLoading(true)
    const [m, i] = await Promise.all([
      supabase.from('organization_members').select('*, profiles!profile_id(full_name, email)').eq('organization_id', currentOrg.id),
      supabase.from('invitations').select('*').eq('organization_id', currentOrg.id).is('accepted_at', null)
    ])
    setMembers(m.data || [])
    setInvitations(i.data || [])
    setLoading(false)
  }

  async function updateRole(memberId, newRole) {
    const { error } = await supabase.from('organization_members').update({ role: newRole }).eq('id', memberId)
    if (error) addToast(friendlyError(error), 'error')
    else { addToast('Role updated'); fetchAll(); logActivity(currentOrg.id, 'changed role', 'member', null) }
  }

  async function removeMember(memberId, name) {
    if (!confirm('Remove ' + name + ' from the league?')) return
    const { error } = await supabase.from('organization_members').delete().eq('id', memberId)
    if (error) addToast(friendlyError(error), 'error')
    else { addToast(name + ' removed'); fetchAll(); logActivity(currentOrg.id, 'removed', 'member', name) }
  }

  async function cancelInvite(inviteId) {
    await supabase.from('invitations').delete().eq('id', inviteId)
    addToast('Invitation cancelled')
    fetchAll()
  }

  const roleLabels = {
    admin: 'President / Admin',
    equipment_manager: 'Equipment Manager',
    coach: 'Coach',
    board_member: 'Board Member',
    volunteer: 'Volunteer'
  }

  const roleColors = {
    admin: { bg: '#ede9fe', color: '#7c3aed' },
    equipment_manager: { bg: '#d4edda', color: '#16a34a' },
    coach: { bg: '#dbeafe', color: '#3b82f6' },
    board_member: { bg: '#fdf3d0', color: '#92700c' },
    volunteer: { bg: '#f3f4f6', color: '#6b7280' }
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>Members</h1>
            <p className="text-muted">{members.length} member{members.length !== 1 ? 's' : ''}{invitations.length > 0 ? ` · ${invitations.length} pending invite${invitations.length !== 1 ? 's' : ''}` : ''}</p>
          </div>
          <button className="btn-primary" onClick={() => setShowAddMemberModal(true)}>+ Add member</button>
        </div>

        {loading ? <div className="loading-state"><div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }}></div></div> : (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id}>
                      <td><strong>{m.profiles?.full_name || 'Unknown'}</strong></td>
                      <td>{m.profiles?.email || '—'}</td>
                      <td>
                        <select
                          value={m.role}
                          onChange={e => updateRole(m.id, e.target.value)}
                          disabled={m.profile_id === user.id}
                          style={{ padding: '0.3rem 0.5rem', border: '1px solid var(--gray-200)', borderRadius: '4px', fontSize: '0.85rem', fontFamily: 'inherit', background: roleColors[m.role]?.bg || '#f3f4f6', color: roleColors[m.role]?.color || '#6b7280', fontWeight: 600 }}
                        >
                          <option value="admin">President / Admin</option>
                          <option value="equipment_manager">Equipment Manager</option>
                          <option value="coach">Coach</option>
                          <option value="board_member">Board Member</option>
                          <option value="volunteer">Volunteer</option>
                        </select>
                      </td>
                      <td>
                        {m.profile_id !== user.id && (
                          <button className="btn-icon-sm btn-icon-danger" onClick={() => removeMember(m.id, m.profiles?.full_name)} title="Remove member">✕</button>
                        )}
                        {m.profile_id === user.id && <span className="text-muted" style={{ fontSize: '0.75rem' }}>You</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {invitations.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--gray-700)' }}>Pending invitations</h2>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Sent</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {invitations.map(inv => (
                        <tr key={inv.id}>
                          <td>{inv.email}</td>
                          <td><span className="badge" style={{ backgroundColor: roleColors[inv.role]?.bg, color: roleColors[inv.role]?.color }}>{roleLabels[inv.role]}</span></td>
                          <td className="text-muted">{new Date(inv.created_at).toLocaleDateString()}</td>
                          <td><button className="btn-icon-sm btn-icon-danger" onClick={() => cancelInvite(inv.id)} title="Cancel invite">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {showAddMemberModal && (
          <AddMemberModal
            orgId={currentOrg.id}
            onClose={() => setShowAddMemberModal(false)}
            onAdded={fetchAll}
          />
        )}
      </main>
      <style>{`
        .btn-icon-sm { background: none; border: none; color: var(--gray-400); cursor: pointer; font-size: 0.85rem; padding: 0.2rem 0.4rem; border-radius: 4px; transition: color 0.15s, background 0.15s; line-height: 1; }
        .btn-icon-sm:hover { color: var(--green-700); background: var(--green-100); }
        .btn-icon-danger:hover { color: var(--red-500) !important; background: var(--red-100) !important; }
      `}</style>
    </div>
  )
}

function AddMemberModal({ orgId, onClose, onAdded }) {
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

      addToast(`${fullName} added as ${role}. Temp password: ${password}`, 'success')
      onAdded()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to add member')
    }
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add a member</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="form-error">{error}</div>}
          <div className="form-group">
            <label>Full name *</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Smith" required />
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
