import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { TICKET_TYPES, getAssigneeRoleForType } from '../lib/ticketRouting'
import { validateFile, uploadAttachment } from '../lib/ticketAttachments'
import { friendlyError } from '../lib/errors'

export default function NewTicketPage() {
  const { currentOrg } = useOrg()
  const { user } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [ticketType, setTicketType] = useState(searchParams.get('type') || '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [teamId, setTeamId] = useState(searchParams.get('team_id') || '')
  const [divisionId, setDivisionId] = useState(searchParams.get('division_id') || '')
  const [locationId, setLocationId] = useState(searchParams.get('location_id') || '')
  const [equipmentItemId, setEquipmentItemId] = useState(searchParams.get('equipment_item_id') || '')
  const [teamBagItemId, setTeamBagItemId] = useState(searchParams.get('team_bag_item_id') || '')
  const [files, setFiles] = useState([])
  const [fileError, setFileError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [contextChip, setContextChip] = useState(null)

  // Context data for dropdowns
  const [teams, setTeams] = useState([])
  const [divisions, setDivisions] = useState([])
  const [locations, setLocations] = useState([])
  const [equipmentItems, setEquipmentItems] = useState([])

  useEffect(() => { document.title = 'New ticket | My League Board' }, [])
  useEffect(() => {
    if (currentOrg) {
      const orgId = currentOrg.id
      Promise.all([
        supabase.from('teams').select('id, name').eq('organization_id', orgId).order('name'),
        supabase.from('divisions').select('id, name, sport_types(name)').eq('organization_id', orgId).order('name'),
        supabase.from('storage_locations').select('id, name').eq('organization_id', orgId).order('name'),
        supabase.from('equipment_items').select('id, name, brand').eq('organization_id', orgId).order('name')
      ]).then(([t, d, l, e]) => {
        setTeams(t.data || [])
        setDivisions(d.data || [])
        setLocations(l.data || [])
        setEquipmentItems(e.data || [])
      })
    }
  }, [currentOrg])

  // Pre-fill from team_bag_item_id query param
  useEffect(() => {
    const bagItemId = searchParams.get('team_bag_item_id')
    if (!bagItemId || !currentOrg) return

    supabase
      .from('team_bag_items')
      // FK disambiguator on equipment_items (team_bag_items has equipment_item_id + replacement_item_id).
      .select('id, equipment_categories(name), equipment_items!team_bag_items_equipment_item_id_fkey(name, brand), team_bag_id, team_bags(team_id, teams(id, name))')
      .eq('id', bagItemId)
      .single()
      .then(({ data }) => {
        if (!data) return
        const itemDesc = data.equipment_categories?.name || 'Item'
        const itemDetail = data.equipment_items ? `${data.equipment_items.name}${data.equipment_items.brand ? ` (${data.equipment_items.brand})` : ''}` : ''
        const teamName = data.team_bags?.teams?.name || ''
        const derivedTeamId = data.team_bags?.teams?.id || ''

        setTicketType('equipment_team_bag')
        if (derivedTeamId && !teamId) setTeamId(derivedTeamId)
        if (!title) setTitle(`Issue with ${itemDesc} — ${teamName}`)
        setContextChip({ teamName, itemDesc, itemDetail })
      })
  }, [searchParams, currentOrg])

  function handleFiles(e) {
    const newFiles = Array.from(e.target.files)
    setFileError('')
    for (const f of newFiles) {
      const err = validateFile(f)
      if (err) { setFileError(err); return }
    }
    setFiles(prev => [...prev, ...newFiles])
    e.target.value = ''
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!ticketType || !title.trim()) { setError('Type and title are required.'); return }
    setSubmitting(true); setError('')

    // Auto-assign: find org members with the default role for this ticket type
    let assignedTo = null
    const role = getAssigneeRoleForType(ticketType)
    if (role) {
      const { data: roleHolders } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('organization_id', currentOrg.id)
        .eq('role', role)
      if (roleHolders?.length === 1) {
        assignedTo = roleHolders[0].user_id
      }
    }

    const { data: ticket, error: insertErr } = await supabase.from('tickets').insert({
      organization_id: currentOrg.id,
      ticket_type: ticketType,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      opened_by: user.id,
      assigned_to: assignedTo,
      assigned_at: assignedTo ? new Date().toISOString() : null,
      team_id: teamId || null,
      division_id: divisionId || null,
      location_id: locationId || null,
      equipment_item_id: equipmentItemId || null,
      team_bag_item_id: teamBagItemId || null
    }).select().single()

    if (insertErr) { setError(friendlyError(insertErr)); setSubmitting(false); return }

    // Upload attachments
    for (const file of files) {
      try {
        await uploadAttachment(ticket.id, currentOrg.id, file, user.id)
      } catch (err) {
        addToast(`Couldn't attach ${file.name}. Open the ticket and try the upload again.`, 'error')
      }
    }

    addToast('Ticket created')
    navigate(`/tickets/${ticket.id}`)
  }

  return (
    <>
      <button className="btn-secondary" onClick={() => navigate('/tickets')} style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>← Back to tickets</button>

      <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', maxWidth: '640px' }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--green-900)', marginBottom: '1rem' }}>New ticket</h1>

        {contextChip && (
          <div style={{ padding: '0.6rem 0.85rem', background: 'var(--blue-100, #dbeafe)', border: '1px solid var(--blue-200, #bfdbfe)', borderRadius: 'var(--radius)', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--blue-800, #1e40af)' }}>
            For: <strong>{contextChip.teamName}</strong> — {contextChip.itemDesc}{contextChip.itemDetail ? ` (${contextChip.itemDetail})` : ''}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group">
            <label>Ticket type *</label>
            <select value={ticketType} onChange={e => setTicketType(e.target.value)} required>
              <option value="">Select type...</option>
              {TICKET_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value.slice(0, 100))} placeholder="Brief summary of the issue" required maxLength={100} />
            <span style={{ fontSize: '0.7rem', color: 'var(--gray-400)', textAlign: 'right' }}>{title.length}/100</span>
          </div>

          <div className="form-group">
            <label htmlFor="ticket-description">Description</label>
            <textarea id="ticket-description" value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Provide details, context, or steps to reproduce..." />
          </div>

          <div className="form-group">
            <label>Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Context (optional)</span>
            <div className="form-row" style={{ marginTop: '0.5rem' }}>
              <div className="form-group">
                <label>Team</label>
                <select value={teamId} onChange={e => setTeamId(e.target.value)}>
                  <option value="">None</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Division</label>
                <select value={divisionId} onChange={e => setDivisionId(e.target.value)}>
                  <option value="">None</option>
                  {[...divisions].sort((a, b) => `${a.sport_types?.name} / ${a.name}`.localeCompare(`${b.sport_types?.name} / ${b.name}`)).map(d => <option key={d.id} value={d.id}>{d.sport_types?.name} / {d.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Location</label>
                <select value={locationId} onChange={e => setLocationId(e.target.value)}>
                  <option value="">None</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Equipment item</label>
                <select value={equipmentItemId} onChange={e => setEquipmentItemId(e.target.value)}>
                  <option value="">None</option>
                  {equipmentItems.map(ei => <option key={ei.id} value={ei.id}>{ei.name}{ei.brand ? ` (${ei.brand})` : ''}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--gray-200)', paddingTop: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Attachments</span>
            <div style={{ marginTop: '0.5rem' }}>
              <input type="file" multiple accept="image/*,application/pdf" onChange={handleFiles} style={{ fontSize: '0.85rem' }} />
              {fileError && <div className="form-error" style={{ marginTop: '0.35rem' }}>{fileError}</div>}
              {files.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
                  {files.map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.5rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', fontSize: '0.8rem' }}>
                      <span>{f.name} ({(f.size / 1024).toFixed(0)} KB)</span>
                      <button type="button" onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: 'var(--red-500)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => navigate('/tickets')}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Creating...' : 'Create ticket'}</button>
          </div>
        </form>
      </div>
    </>
  )
}
