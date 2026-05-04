import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { getTicketTypeConfig, getAssigneeRoleForType, PRIORITY_COLORS, STATUS_COLORS } from '../lib/ticketRouting'
import { validateFile, uploadAttachment, getAttachmentUrl } from '../lib/ticketAttachments'
import { friendlyError } from '../lib/errors'
import { resolveActorLabel } from '../lib/actorLabel'
import { SkeletonPage } from '../components/Skeleton'

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

export default function TicketDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentOrg, hasAnyRole } = useOrg()
  const { user } = useAuth()
  const { addToast } = useToast()

  const [ticket, setTicket] = useState(null)
  const [comments, setComments] = useState([])
  const [events, setEvents] = useState([])
  const [attachments, setAttachments] = useState([])
  const [orgMembers, setOrgMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [commentBody, setCommentBody] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)

  useEffect(() => { if (currentOrg && id) fetchAll() }, [currentOrg, id])

  async function fetchAll() {
    setLoading(true)
    const [t, c, e, a, m] = await Promise.all([
      supabase.from('tickets')
        .select('*, teams(name), divisions(name), storage_locations:location_id(name), equipment_items:equipment_item_id(name, brand)')
        .eq('id', id).single(),
      supabase.from('ticket_comments')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('ticket_events')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('ticket_attachments')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at'),
      supabase.from('organization_members')
        .select('profile_id, profiles:profile_id(full_name)')
        .eq('organization_id', currentOrg.id)
    ])

    // Resolve user names from profiles (FKs target auth.users which lacks full_name)
    const rawTicket = t.data
    const rawComments = c.data || []
    const rawEvents = e.data || []
    const userIds = [...new Set([
      rawTicket?.opened_by, rawTicket?.assigned_to, rawTicket?.resolved_by,
      ...rawComments.map(c => c.author_id),
      ...rawEvents.map(e => e.actor_id)
    ].filter(Boolean))]
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
      : { data: [] }
    const nameMap = Object.fromEntries((profiles || []).map(p => [p.id, p.full_name]))

    if (rawTicket) {
      rawTicket.opener = { full_name: nameMap[rawTicket.opened_by] || null }
      rawTicket.assignee = { full_name: nameMap[rawTicket.assigned_to] || null }
      rawTicket.resolver = { full_name: nameMap[rawTicket.resolved_by] || null }
    }
    setTicket(rawTicket)
    setComments(rawComments.map(c => ({ ...c, author: { full_name: nameMap[c.author_id] || null } })))
    setEvents(rawEvents.map(e => ({
      ...e,
      actor_label: resolveActorLabel({
        actorId: e.actor_id,
        currentUserId: user?.id,
        fullName: nameMap[e.actor_id],
      }),
    })))
    setAttachments(a.data || [])
    setOrgMembers(m.data || [])
    setLoading(false)
    if (rawTicket) document.title = `${rawTicket.title} | Tickets`
  }

  if (loading) return <div style={{ padding: '1rem 0' }}><SkeletonPage rows={4} /></div>
  if (!ticket) return <div className="empty-state"><p>Ticket not found.</p><button className="btn-secondary" onClick={() => navigate('/tickets')}>Back</button></div>

  const tc = getTicketTypeConfig(ticket.ticket_type)
  const pc = PRIORITY_COLORS[ticket.priority] || PRIORITY_COLORS.normal
  const stc = STATUS_COLORS[ticket.status] || STATUS_COLORS.open
  const isOpener = user?.id === ticket.opened_by
  const isAssignee = user?.id === ticket.assigned_to
  const assigneeRole = getAssigneeRoleForType(ticket.ticket_type)
  const isRoleHolder = hasAnyRole(['admin', assigneeRole])
  const canModify = isOpener || isAssignee || isRoleHolder

  async function updateField(field, value) {
    const updates = { [field]: value }
    if (field === 'status' && value === 'resolved') {
      updates.resolved_at = new Date().toISOString()
      updates.resolved_by = user.id
    }
    if (field === 'status' && value !== 'resolved') {
      updates.resolved_at = null
      updates.resolved_by = null
    }
    if (field === 'assigned_to') {
      updates.assigned_at = value ? new Date().toISOString() : null
    }
    await supabase.from('tickets').update(updates).eq('id', ticket.id)
    fetchAll()
  }

  async function submitComment(e) {
    e.preventDefault()
    if (!commentBody.trim()) return
    setSubmittingComment(true)
    const { error } = await supabase.from('ticket_comments').insert({
      ticket_id: ticket.id,
      author_id: user.id,
      body: commentBody.trim()
    })
    setSubmittingComment(false)
    if (error) { addToast(friendlyError(error), 'error'); return }
    setCommentBody('')
    fetchAll()
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const err = validateFile(file)
    if (err) { addToast(err, 'error'); e.target.value = ''; return }
    setUploadingFile(true)
    try {
      await uploadAttachment(ticket.id, currentOrg.id, file, user.id)
      addToast('File uploaded')
      fetchAll()
    } catch (uploadErr) {
      console.error('Attachment upload failed:', uploadErr)
      addToast("That file didn't upload. Try again, or check your connection.", 'error')
    }
    setUploadingFile(false)
    e.target.value = ''
  }

  async function openAttachment(att) {
    try {
      const url = await getAttachmentUrl(att.storage_path)
      window.open(url, '_blank')
    } catch (err) {
      console.error('Attachment load failed:', err)
      addToast("We couldn't open that attachment. Try again, or refresh the page.", 'error')
    }
  }

  // Merge comments + events into unified activity feed
  const activity = [
    ...comments.map(c => ({ type: 'comment', data: c, at: c.created_at })),
    ...events.filter(e => e.event_type !== 'commented').map(e => ({ type: 'event', data: e, at: e.created_at }))
  ].sort((a, b) => new Date(a.at) - new Date(b.at))

  function formatEvent(ev) {
    const actor = ev.actor_label
    const d = ev.detail || {}
    switch (ev.event_type) {
      case 'opened': return `${actor} opened this ticket`
      case 'assigned': return `${actor} assigned this ticket`
      case 'unassigned': return `${actor} removed the assignee`
      case 'status_changed': return `${actor} changed status from ${d.from} to ${d.to}`
      case 'priority_changed': return `${actor} changed priority from ${d.from} to ${d.to}`
      case 'resolved': return `${actor} resolved this ticket`
      case 'reopened': return `${actor} reopened this ticket`
      case 'cancelled': return `${actor} cancelled this ticket`
      default: return `${actor}: ${ev.event_type}`
    }
  }

  // Get members with the assignee role for the "assign to" dropdown
  const assignableMemberIds = new Set()
  // We'll show all org members in the dropdown — filtering by role requires
  // querying user_roles which we don't have loaded here. The RLS on the
  // update policy enforces who can actually be assigned.
  orgMembers.forEach(m => assignableMemberIds.add(m.profile_id))

  return (
    <>
      <button className="btn-secondary" onClick={() => navigate('/tickets')} style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>← Back to tickets</button>

      <div className="tkt-detail-layout">
        {/* Main column */}
        <div className="tkt-main">
          {/* Header */}
          <div className="tkt-header-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: pc.dot }} />
              <span className="badge" style={{ backgroundColor: 'var(--gray-100)', color: 'var(--gray-600)', fontSize: '0.7rem' }}>{tc?.icon} {tc?.label}</span>
              <span className="badge" style={{ backgroundColor: stc.bg, color: stc.text }}>{ticket.status.replace('_', ' ')}</span>
            </div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--green-900)', marginBottom: '0.35rem' }}>{ticket.title}</h1>
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>
              Opened by {ticket.opener?.full_name || 'Unknown'} · {timeAgo(ticket.opened_at)}
              {ticket.assignee && <> · Assigned to {ticket.assignee.full_name}</>}
            </p>
          </div>

          {/* Description */}
          {ticket.description && (
            <div className="tkt-card">
              <h3 className="tkt-section-label">Description</h3>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.6 }}>{ticket.description}</div>
            </div>
          )}

          {/* Attachments */}
          {(attachments.length > 0 || true) && (
            <div className="tkt-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="tkt-section-label">Attachments ({attachments.length})</h3>
                <label className="btn-small" style={{ cursor: 'pointer', position: 'relative' }}>
                  {uploadingFile ? 'Uploading...' : '+ Add file'}
                  <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} disabled={uploadingFile} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                </label>
              </div>
              {attachments.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {attachments.map(att => (
                    <button key={att.id} onClick={() => openAttachment(att)} className="tkt-attachment-chip">
                      <span>{att.mime_type?.startsWith('image/') ? '🖼' : '📄'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{att.filename}</span>
                      <span className="text-muted" style={{ fontSize: '0.7rem' }}>{(att.size_bytes / 1024).toFixed(0)}KB</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Activity feed */}
          <div className="tkt-card">
            <h3 className="tkt-section-label">Activity</h3>
            <div className="tkt-activity-feed">
              {activity.map((a, i) => {
                if (a.type === 'comment') {
                  const c = a.data
                  return (
                    <div key={`c-${c.id}`} className="tkt-comment">
                      <div className="tkt-comment-header">
                        <strong style={{ fontSize: '0.85rem' }}>{c.author?.full_name || 'Unknown'}</strong>
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>{timeAgo(c.created_at)}</span>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.5 }}>{c.body}</div>
                    </div>
                  )
                } else {
                  const ev = a.data
                  return (
                    <div key={`e-${ev.id}`} className="tkt-event-line">
                      <span className="tkt-event-dot" />
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>{formatEvent(ev)}</span>
                      <span className="text-muted" style={{ fontSize: '0.7rem', marginLeft: 'auto' }}>{timeAgo(ev.created_at)}</span>
                    </div>
                  )
                }
              })}
              {activity.length === 0 && <p className="text-muted">No activity yet.</p>}
            </div>
          </div>

          {/* Comment composer */}
          <div className="tkt-card">
            <form onSubmit={submitComment} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <textarea
                value={commentBody}
                onChange={e => setCommentBody(e.target.value)}
                placeholder="Add a comment..."
                rows={3}
                style={{ padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.9rem', fontFamily: 'inherit', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn-primary" disabled={submittingComment || !commentBody.trim()} style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>
                  {submittingComment ? 'Posting...' : 'Comment'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="tkt-sidebar">
          <div className="tkt-sidebar-card">
            <div className="tkt-sidebar-group">
              <label className="tkt-sidebar-label">Status</label>
              <select value={ticket.status} onChange={e => updateField('status', e.target.value)} disabled={!canModify} style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="tkt-sidebar-group">
              <label className="tkt-sidebar-label">Priority</label>
              <select value={ticket.priority} onChange={e => updateField('priority', e.target.value)} disabled={!canModify} style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="tkt-sidebar-group">
              <label className="tkt-sidebar-label">Assigned to</label>
              <select value={ticket.assigned_to || ''} onChange={e => updateField('assigned_to', e.target.value || null)} disabled={!canModify} style={{ width: '100%', padding: '0.4rem 0.5rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                <option value="">Unassigned</option>
                {orgMembers.map(m => (
                  <option key={m.profile_id} value={m.profile_id}>{m.profiles?.full_name || 'Unknown'}</option>
                ))}
              </select>
            </div>

            {ticket.resolved_at && (
              <div className="tkt-sidebar-group">
                <label className="tkt-sidebar-label">Resolved</label>
                <span style={{ fontSize: '0.8rem' }}>
                  {new Date(ticket.resolved_at).toLocaleDateString()} by {ticket.resolver?.full_name || 'Unknown'}
                </span>
                {ticket.resolution_note && <p style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginTop: '0.25rem' }}>{ticket.resolution_note}</p>}
              </div>
            )}
          </div>

          {/* Context links */}
          {(ticket.teams || ticket.divisions || ticket.storage_locations || ticket.equipment_items) && (
            <div className="tkt-sidebar-card">
              <label className="tkt-sidebar-label">Context</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.25rem' }}>
                {ticket.teams && <Link to="/teams" className="tkt-context-link">Team: {ticket.teams.name}</Link>}
                {ticket.divisions && <span className="tkt-context-link">Division: {ticket.divisions.name}</span>}
                {ticket.storage_locations && <Link to="/locations" className="tkt-context-link">Location: {ticket.storage_locations.name}</Link>}
                {ticket.equipment_items && <Link to="/equipment" className="tkt-context-link">Equipment: {ticket.equipment_items.name}{ticket.equipment_items.brand ? ` (${ticket.equipment_items.brand})` : ''}</Link>}
              </div>
            </div>
          )}
        </aside>
      </div>

      <style>{detailStyles}</style>
    </>
  )
}

const detailStyles = `
  .tkt-detail-layout { display: flex; gap: 1.25rem; align-items: flex-start; }
  .tkt-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1rem; }
  .tkt-sidebar { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; gap: 1rem; position: sticky; top: 1rem; }
  .tkt-header-card, .tkt-card, .tkt-sidebar-card {
    background: white; border: 1px solid var(--gray-200); border-radius: var(--radius-lg); padding: 1.25rem;
  }
  .tkt-section-label {
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--gray-500); margin-bottom: 0.5rem;
  }
  .tkt-sidebar-group { margin-bottom: 0.75rem; }
  .tkt-sidebar-group:last-child { margin-bottom: 0; }
  .tkt-sidebar-label {
    display: block; font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--gray-500); margin-bottom: 0.25rem;
  }
  .tkt-context-link {
    font-size: 0.8rem; color: var(--green-700); text-decoration: none;
    padding: 0.2rem 0; display: block;
  }
  .tkt-context-link:hover { text-decoration: underline; }
  .tkt-attachment-chip {
    display: inline-flex; align-items: center; gap: 0.35rem;
    padding: 0.35rem 0.6rem; background: var(--gray-50); border: 1px solid var(--gray-200);
    border-radius: var(--radius); font-size: 0.8rem; cursor: pointer; font-family: inherit;
    transition: border-color 0.15s;
  }
  .tkt-attachment-chip:hover { border-color: var(--green-400); }
  .tkt-activity-feed { display: flex; flex-direction: column; gap: 0.5rem; }
  .tkt-comment {
    padding: 0.75rem; background: var(--gray-50); border-radius: var(--radius);
    border: 1px solid var(--gray-100);
  }
  .tkt-comment-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;
  }
  .tkt-event-line {
    display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0;
    border-bottom: 1px solid var(--gray-100);
  }
  .tkt-event-line:last-child { border-bottom: none; }
  .tkt-event-dot {
    width: 6px; height: 6px; border-radius: 50%; background: var(--gray-300); flex-shrink: 0;
  }
  @media (max-width: 768px) {
    .tkt-detail-layout { flex-direction: column; }
    .tkt-sidebar { width: 100%; position: static; order: -1; }
  }
`
