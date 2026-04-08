import { useState, useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Sidebar from '../components/Sidebar'

export default function AssignmentsPage() {
  const { currentOrg } = useOrg()
  const { user } = useAuth()
  const [assignments, setAssignments] = useState([])
  const [teams, setTeams] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAssign, setShowAssign] = useState(false)
  const [filterActive, setFilterActive] = useState(true)

  useEffect(() => {
    if (currentOrg) fetchAll()
  }, [currentOrg])

  async function fetchAll() {
    setLoading(true)
    const orgId = currentOrg.id
    const [a, t, i] = await Promise.all([
      supabase.from('equipment_assignments').select('*, equipment_items(name, tag_number), teams(name), profiles!assigned_by(full_name)').eq('organization_id', orgId).order('assigned_at', { ascending: false }),
      supabase.from('teams').select('*, divisions(name, sport_types(name))').eq('organization_id', orgId),
      supabase.from('equipment_items').select('*').eq('organization_id', orgId).eq('status', 'available')
    ])
    setAssignments(a.data || [])
    setTeams(t.data || [])
    setItems(i.data || [])
    setLoading(false)
  }

  async function returnItem(assignmentId, itemId) {
    await supabase.from('equipment_assignments').update({ returned_at: new Date().toISOString() }).eq('id', assignmentId)
    await supabase.from('equipment_items').update({ status: 'available' }).eq('id', itemId)
    fetchAll()
  }

  async function assignItem(itemId, teamId) {
    const { error } = await supabase.from('equipment_assignments').insert({
      organization_id: currentOrg.id,
      equipment_item_id: itemId,
      team_id: teamId,
      assigned_by: user.id
    })
    if (!error) {
      await supabase.from('equipment_items').update({ status: 'assigned' }).eq('id', itemId)
      fetchAll()
      setShowAssign(false)
    }
    return { error }
  }

  const filtered = filterActive
    ? assignments.filter(a => !a.returned_at)
    : assignments

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>Equipment assignments</h1>
            <p className="text-muted">{filtered.length} {filterActive ? 'active' : 'total'} assignments</p>
          </div>
          <button className="btn-primary" onClick={() => setShowAssign(true)}>+ Assign equipment</button>
        </div>

        <div className="filters-bar">
          <label className="toggle-label">
            <input type="checkbox" checked={filterActive} onChange={e => setFilterActive(e.target.checked)} />
            Show active only
          </label>
        </div>

        {loading ? (
          <div className="loading-state">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>{assignments.length === 0 ? 'No assignments yet. Assign equipment to teams to track who has what.' : 'No active assignments.'}</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Team</th>
                  <th>Assigned</th>
                  <th>By</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.equipment_items?.name}</strong>
                      {a.equipment_items?.tag_number && <span className="item-detail">#{a.equipment_items.tag_number}</span>}
                    </td>
                    <td>{a.teams?.name || '—'}</td>
                    <td>{new Date(a.assigned_at).toLocaleDateString()}</td>
                    <td>{a.profiles?.full_name || '—'}</td>
                    <td>
                      {a.returned_at ? (
                        <span className="badge badge-neutral">Returned {new Date(a.returned_at).toLocaleDateString()}</span>
                      ) : (
                        <span className="badge" style={{ backgroundColor: '#3b82f620', color: '#3b82f6' }}>Checked out</span>
                      )}
                    </td>
                    <td>
                      {!a.returned_at && (
                        <button className="btn-small" onClick={() => returnItem(a.id, a.equipment_item_id)}>Return</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showAssign && (
          <AssignModal items={items} teams={teams} onAssign={assignItem} onClose={() => setShowAssign(false)} />
        )}
      </main>
    </div>
  )
}

function AssignModal({ items, teams, onAssign, onClose }) {
  const [itemId, setItemId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!itemId || !teamId) { setError('Select both an item and a team'); return }
    setSubmitting(true)
    const { error } = await onAssign(itemId, teamId)
    if (error) setError(error.message)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Assign equipment</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Equipment *</label>
            <select value={itemId} onChange={e => setItemId(e.target.value)} required>
              <option value="">Select available equipment</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.name}{i.tag_number ? ` (#${i.tag_number})` : ''}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Assign to team *</label>
            <select value={teamId} onChange={e => setTeamId(e.target.value)} required>
              <option value="">Select team</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.divisions?.name} {t.divisions?.sport_types?.name})</option>)}
            </select>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Assigning...' : 'Assign'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
