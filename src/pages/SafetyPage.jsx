import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { friendlyError } from '../lib/errors'

export default function SafetyPage() {
  const { currentOrg, hasAnyRole } = useOrg()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [tab, setTab] = useState('incidents')
  const [incidents, setIncidents] = useState([])
  const [checks, setChecks] = useState([])
  const [kits, setKits] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddIncident, setShowAddIncident] = useState(false)
  const [showAddCheck, setShowAddCheck] = useState(false)
  const [showAddKit, setShowAddKit] = useState(false)
  const canEdit = hasAnyRole(['admin', 'safety_officer'])

  useEffect(() => { document.title = 'Safety | My League Board' }, [])

  const fetchAll = useCallback(async () => {
    if (!currentOrg) return
    setLoading(true)
    const orgId = currentOrg.id
    const [incRes, chkRes, kitRes] = await Promise.all([
      supabase.from('incident_reports').select('*, profiles:reported_by(full_name)').eq('organization_id', orgId).order('date', { ascending: false }),
      supabase.from('background_checks').select('*, profiles:profile_id(full_name, email)').eq('organization_id', orgId).order('submission_date', { ascending: false }),
      supabase.from('first_aid_kits').select('*').eq('organization_id', orgId).order('name')
    ])
    setIncidents(incRes.data || [])
    setChecks(chkRes.data || [])
    setKits(kitRes.data || [])
    setLoading(false)
  }, [currentOrg])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openIncidents = incidents.filter(i => i.status === 'open').length
  const pendingChecks = checks.filter(c => c.status === 'pending').length
  const expiredChecks = checks.filter(c => c.status === 'expired' || (c.expiration_date && new Date(c.expiration_date) < new Date())).length
  const kitsNeedingAttention = kits.filter(k => k.status !== 'good').length

  if (loading) return (
    <div className="loading-state"><div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }}></div></div>
  )

  return (
    <>
      {/* M-07 fix: standardise page-header to the shared .page-header /
          .header-actions classes so the action button stacks below the
          title consistently across all three tabs at <=768px (was wrapping
          per-tab based on button-text length, producing inconsistent
          mobile layouts between Incidents and Kits). */}
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Safety</h1>
          <p className="text-muted">Incident reports, background checks, and first aid</p>
        </div>
        <div className="header-actions">
          {canEdit && tab === 'incidents' && <button className="btn-primary" onClick={() => setShowAddIncident(true)}>+ Report incident</button>}
          {canEdit && tab === 'checks' && <button className="btn-primary" onClick={() => setShowAddCheck(true)}>+ Add check</button>}
          {canEdit && tab === 'kits' && <button className="btn-primary" onClick={() => setShowAddKit(true)}>+ Add kit</button>}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="stat-card"><div style={{ fontSize: '1.5rem', fontWeight: 700, color: openIncidents > 0 ? 'var(--red-500)' : 'var(--green-600)' }}>{openIncidents}</div><div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Open Incidents</div></div>
        <div className="stat-card"><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-700)' }}>{checks.filter(c => c.status === 'approved').length}</div><div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Approved Checks</div></div>
        <div className="stat-card"><div style={{ fontSize: '1.5rem', fontWeight: 700, color: pendingChecks > 0 ? '#f59e0b' : 'var(--green-600)' }}>{pendingChecks}</div><div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Pending Checks</div></div>
        <div className="stat-card"><div style={{ fontSize: '1.5rem', fontWeight: 700, color: kitsNeedingAttention > 0 ? '#f59e0b' : 'var(--green-600)' }}>{kits.length}</div><div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', marginTop: '0.25rem' }}>First Aid Kits</div></div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--gray-200)', marginBottom: '1.5rem' }}>
        {[{id:'incidents',label:'Incidents'},{id:'checks',label:'Background checks'},{id:'kits',label:'First aid kits'}].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '0.5rem 1.25rem', background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid var(--green-600)' : '2px solid transparent',
            marginBottom: '-2px', fontFamily: 'inherit', fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? 'var(--green-700)' : 'var(--gray-500)', cursor: 'pointer', fontSize: '0.9rem'
          }}>{t.label}{t.id === 'incidents' && openIncidents > 0 ? ` (${openIncidents})` : ''}{t.id === 'checks' && pendingChecks > 0 ? ` (${pendingChecks})` : ''}</button>
        ))}
      </div>

      {/* Incidents tab — table-container wrapper (M-02 fix) gives the
          table horizontal-scroll behaviour at narrow widths instead of
          overflow:hidden's silent clip, and shares chrome with Checks +
          Kits for visual parity. */}
      {tab === 'incidents' && (
        <div className="table-container">
          {incidents.length === 0 ? (
            <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No incidents reported.</p>
              <p className="text-muted" style={{ marginBottom: canEdit ? '1.25rem' : 0 }}>If something happens that needs documenting — an injury, a near-miss — file a report so the league has a record.</p>
              {canEdit && <button className="btn-primary" onClick={() => setShowAddIncident(true)}>+ Report incident</button>}
            </div>
          ) : (
            <table className="data-table" style={{ marginBottom: 0 }}>
              <thead><tr><th>Date</th><th>Player</th><th>Injury</th><th>Location</th><th>Status</th></tr></thead>
              <tbody>
                {incidents.map(inc => (
                  <tr key={inc.id}>
                    <td style={{ fontSize: '0.8rem' }}>{new Date(inc.date).toLocaleDateString()}</td>
                    <td style={{ fontWeight: 500 }}>{inc.player_name || '—'}{inc.team_name ? <span className="text-muted"> ({inc.team_name})</span> : ''}</td>
                    <td>{inc.injury_type || '—'}</td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{inc.location || '—'}</td>
                    <td><span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '6px', fontWeight: 500,
                      background: inc.status === 'resolved' ? '#d4edda' : inc.status === 'follow_up' ? '#fff3cd' : '#f8d7da',
                      color: inc.status === 'resolved' ? '#16a34a' : inc.status === 'follow_up' ? '#856404' : '#dc3545'
                    }}>{inc.status === 'follow_up' ? 'follow up' : inc.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Background checks tab — same table-container wrapper as Incidents (M-02). */}
      {tab === 'checks' && (
        <div className="table-container">
          {checks.length === 0 ? (
            <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No background checks tracked yet.</p>
              <p className="text-muted" style={{ marginBottom: canEdit ? '1.25rem' : 0 }}>Track checks for coaches, volunteers, and anyone working with players. Records expire annually so they need re-running.</p>
              {canEdit && <button className="btn-primary" onClick={() => setShowAddCheck(true)}>+ Add your first check</button>}
            </div>
          ) : (
            <table className="data-table" style={{ marginBottom: 0 }}>
              <thead><tr><th>Name</th><th>Role</th><th>Submitted</th><th>Expires</th><th>Status</th></tr></thead>
              <tbody>
                {checks.map(chk => {
                  const isExpired = chk.expiration_date && new Date(chk.expiration_date) < new Date()
                  return (
                    <tr key={chk.id}>
                      <td style={{ fontWeight: 500 }}>{chk.person_name}</td>
                      <td className="text-muted" style={{ fontSize: '0.8rem' }}>{chk.role || '—'}</td>
                      <td style={{ fontSize: '0.8rem' }}>{chk.submission_date ? new Date(chk.submission_date).toLocaleDateString() : '—'}</td>
                      <td style={{ fontSize: '0.8rem', color: isExpired ? 'var(--red-500)' : undefined }}>{chk.expiration_date ? new Date(chk.expiration_date).toLocaleDateString() : '—'}{isExpired ? ' ⚠️' : ''}</td>
                      <td><span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '6px', fontWeight: 500,
                        background: chk.status === 'approved' ? '#d4edda' : chk.status === 'pending' ? '#fff3cd' : chk.status === 'denied' ? '#f8d7da' : '#f8d7da',
                        color: chk.status === 'approved' ? '#16a34a' : chk.status === 'pending' ? '#856404' : '#dc3545'
                      }}>{isExpired ? 'expired' : chk.status}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* First aid kits tab — empty state goes in .table-container so its
          chrome matches Incidents + Checks tabs (DEV-42 fix); populated
          state keeps the auto-fill grid layout for kit cards. */}
      {tab === 'kits' && (
        kits.length === 0 ? (
          <div className="table-container">
            <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No first aid kits tracked yet.</p>
              <p className="text-muted" style={{ marginBottom: canEdit ? '1.25rem' : 0 }}>Know which kits are where, when each was last inspected, and what's been used. Keeps the league ready and accountable.</p>
              {canEdit && <button className="btn-primary" onClick={() => setShowAddKit(true)}>+ Add your first kit</button>}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {kits.map(kit => (
            <div key={kit.id} style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 600 }}>{kit.name}</div>
                <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '6px', fontWeight: 500,
                  background: kit.status === 'good' ? '#d4edda' : kit.status === 'needs_restock' ? '#fff3cd' : '#f8d7da',
                  color: kit.status === 'good' ? '#16a34a' : kit.status === 'needs_restock' ? '#856404' : '#dc3545'
                }}>{kit.status.replace('_', ' ')}</span>
              </div>
              {kit.location && <div className="text-muted" style={{ fontSize: '0.8rem' }}>📍 {kit.location}</div>}
              {kit.last_inspected && <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Last inspected: {new Date(kit.last_inspected).toLocaleDateString()}</div>}
              {kit.next_inspection && <div style={{ fontSize: '0.75rem', marginTop: '0.15rem', color: new Date(kit.next_inspection) < new Date() ? 'var(--red-500)' : 'var(--gray-500)' }}>Next inspection: {new Date(kit.next_inspection).toLocaleDateString()}{new Date(kit.next_inspection) < new Date() ? ' ⚠️ OVERDUE' : ''}</div>}
            </div>
          ))}
          </div>
        )
      )}

      {/* Add Incident Modal */}
      {showAddIncident && <AddIncidentModal orgId={currentOrg.id} userId={user.id} onClose={() => { setShowAddIncident(false); fetchAll() }} addToast={addToast} />}
      {showAddCheck && <AddCheckModal orgId={currentOrg.id} onClose={() => { setShowAddCheck(false); fetchAll() }} addToast={addToast} />}
      {showAddKit && <AddKitModal orgId={currentOrg.id} onClose={() => { setShowAddKit(false); fetchAll() }} addToast={addToast} />}
    </>
  )
}

function AddIncidentModal({ orgId, userId, onClose, addToast }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [playerAge, setPlayerAge] = useState('')
  const [teamName, setTeamName] = useState('')
  const [injuryType, setInjuryType] = useState('')
  const [description, setDescription] = useState('')
  const [treatment, setTreatment] = useState('')
  const [parentNotified, setParentNotified] = useState(false)
  const [medicalAttention, setMedicalAttention] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const { error } = await supabase.from('incident_reports').insert({
      organization_id: orgId, date, time: time || null, location: location || null,
      reported_by: userId, player_name: playerName || null, player_age: playerAge ? parseInt(playerAge) : null,
      team_name: teamName || null, injury_type: injuryType || null, description,
      treatment: treatment || null, parent_notified: parentNotified, medical_attention: medicalAttention
    })
    if (error) addToast(friendlyError(error), 'error')
    else addToast('Incident report filed')
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
        <div className="modal-header"><h2>Report an incident</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="form-group" style={{ flex: 1 }}><label>Date *</label><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Time</label><input type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
          </div>
          <div className="form-group"><label>Location</label><input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Field 3, parking lot, etc." /></div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="form-group" style={{ flex: 2 }}><label>Player name</label><input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Age</label><input type="number" value={playerAge} onChange={e => setPlayerAge(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="form-group" style={{ flex: 1 }}><label>Team</label><input type="text" value={teamName} onChange={e => setTeamName(e.target.value)} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Injury type</label><select value={injuryType} onChange={e => setInjuryType(e.target.value)}><option value="">Select...</option><option value="bruise">Bruise</option><option value="cut">Cut/Scrape</option><option value="sprain">Sprain/Strain</option><option value="fracture">Fracture</option><option value="concussion">Concussion</option><option value="heat">Heat related</option><option value="bee_sting">Bee sting/Allergy</option><option value="other">Other</option></select></div>
          </div>
          <div className="form-group"><label>Description *</label><textarea value={description} onChange={e => setDescription(e.target.value)} required rows={3} placeholder="What happened?" style={{ fontFamily: 'inherit', resize: 'vertical' }} /></div>
          <div className="form-group"><label>Treatment given</label><textarea value={treatment} onChange={e => setTreatment(e.target.value)} rows={2} placeholder="Ice, bandage, etc." style={{ fontFamily: 'inherit', resize: 'vertical' }} /></div>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}><input type="checkbox" checked={parentNotified} onChange={e => setParentNotified(e.target.checked)} /> Parent/guardian notified</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}><input type="checkbox" checked={medicalAttention} onChange={e => setMedicalAttention(e.target.checked)} /> Required medical attention</label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Filing...' : 'File report'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddCheckModal({ orgId, onClose, addToast }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [submissionDate, setSubmissionDate] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState('pending')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const expirationDate = new Date(submissionDate)
    expirationDate.setFullYear(expirationDate.getFullYear() + 2)
    const { error } = await supabase.from('background_checks').insert({
      organization_id: orgId, person_name: name, role: role || null,
      submission_date: submissionDate, status,
      expiration_date: status === 'approved' ? expirationDate.toISOString().split('T')[0] : null,
      approval_date: status === 'approved' ? submissionDate : null,
      reference_number: referenceNumber || null, notes: notes || null
    })
    if (error) addToast(friendlyError(error), 'error')
    else addToast(`Background check for ${name} recorded`)
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Add a background check</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group"><label>Person name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} required /></div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="form-group" style={{ flex: 1 }}><label>Role</label><input type="text" value={role} onChange={e => setRole(e.target.value)} placeholder="Coach, volunteer, etc." /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Status</label><select value={status} onChange={e => setStatus(e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="denied">Denied</option></select></div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="form-group" style={{ flex: 1 }}><label>Submission date</label><input type="date" value={submissionDate} onChange={e => setSubmissionDate(e.target.value)} /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Reference #</label><input type="text" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} /></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ fontFamily: 'inherit', resize: 'vertical' }} /></div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddKitModal({ orgId, onClose, addToast }) {
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState('good')
  const [lastInspected, setLastInspected] = useState(new Date().toISOString().split('T')[0])
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const nextInspection = new Date(lastInspected)
    nextInspection.setMonth(nextInspection.getMonth() + 1)
    const { error } = await supabase.from('first_aid_kits').insert({
      organization_id: orgId, name, location: location || null, status,
      last_inspected: lastInspected, next_inspection: nextInspection.toISOString().split('T')[0]
    })
    if (error) addToast(friendlyError(error), 'error')
    else addToast(`First aid kit "${name}" added`)
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Add a first aid kit</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group"><label>Kit name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Field 3 Kit, Board Room Kit, etc." required /></div>
          <div className="form-group"><label>Location</label><input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Where is this kit kept?" /></div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="form-group" style={{ flex: 1 }}><label>Status</label><select value={status} onChange={e => setStatus(e.target.value)}><option value="good">Good</option><option value="needs_restock">Needs restock</option><option value="needs_replacement">Needs replacement</option></select></div>
            <div className="form-group" style={{ flex: 1 }}><label>Last inspected</label><input type="date" value={lastInspected} onChange={e => setLastInspected(e.target.value)} /></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Add kit'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
