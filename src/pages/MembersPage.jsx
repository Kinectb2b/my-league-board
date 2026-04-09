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
  const [showInvite, setShowInvite] = useState(false)

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

  async function sendInvite(email, role) {
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      addToast('Please enter a valid email address', 'error')
      return
    }
    const existingMember = members.find(m => m.profiles?.email === email)
    if (existingMember) {
      addToast('This person is already a member', 'error')
      return
    }
    const { data, error } = await supabase.from('invitations').insert({
      organization_id: currentOrg.id,
      email,
      role,
      invited_by: user.id
    }).select().single()
    if (error) {
      if (error.message.includes('duplicate')) addToast('This person has already been invited', 'error')
      else addToast(friendlyError(error), 'error')
      return
    }
    if (data) {
      const inviteUrl = window.location.origin + '/accept-invite?token=' + data.token
      navigator.clipboard.writeText(inviteUrl).catch(() => {})
      addToast('Invite link copied to clipboard!')
    } else {
      addToast('Invitation created')
    }
    logActivity(currentOrg.id, 'invited', 'member', email, 'Role: ' + role)
    setShowInvite(false)
    fetchAll()
  }

  async function cancelInvite(inviteId) {
    await supabase.from('invitations').delete().eq('id', inviteId)
    addToast('Invitation cancelled')
    fetchAll()
  }

  const roleLabels = {
    admin: 'Admin',
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
          <button className="btn-primary" onClick={() => setShowInvite(true)}>+ Invite member</button>
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
                          <option value="admin">Admin</option>
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

        {showInvite && <InviteModal onInvite={sendInvite} onClose={() => setShowInvite(false)} />}
      </main>
      <style>{`
        .btn-icon-sm { background: none; border: none; color: var(--gray-400); cursor: pointer; font-size: 0.85rem; padding: 0.2rem 0.4rem; border-radius: 4px; transition: color 0.15s, background 0.15s; line-height: 1; }
        .btn-icon-sm:hover { color: var(--green-700); background: var(--green-100); }
        .btn-icon-danger:hover { color: var(--red-500) !important; background: var(--red-100) !important; }
      `}</style>
    </div>
  )
}

function InviteModal({ onInvite, onClose }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('volunteer')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await onInvite(email, role)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Invite a member</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Email address *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="coach@example.com" required autoFocus />
          </div>
          <div className="form-group">
            <label>Role *</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option value="admin">Admin — full control</option>
              <option value="equipment_manager">Equipment Manager — manages gear</option>
              <option value="coach">Coach — views team gear</option>
              <option value="board_member">Board Member — read-only</option>
              <option value="volunteer">Volunteer — limited access</option>
            </select>
          </div>
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>They will receive an invitation to join your league. If they don't have an account, they'll need to create one first.</p>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Sending...' : 'Send invitation'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
