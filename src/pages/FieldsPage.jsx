import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { logActivity } from '../lib/activity'

const FIELD_TYPE_CONFIG = {
  baseball:     { label: 'Baseball',     bg: '#d4edda', text: '#16a34a' },
  softball:     { label: 'Softball',     bg: '#fef9c3', text: '#a16207' },
  batting_cage: { label: 'Batting Cage', bg: '#dbeafe', text: '#2563eb' },
  practice:     { label: 'Practice',     bg: '#f3f4f6', text: '#6b7280' },
  other:        { label: 'Other',        bg: '#f3f4f6', text: '#6b7280' },
}

const STATUS_CONFIG = {
  available:   { label: 'Available',   bg: '#d4edda', text: '#16a34a' },
  maintenance: { label: 'Maintenance', bg: '#fef3c7', text: '#d97706' },
  closed:      { label: 'Closed',      bg: '#fee2e2', text: '#dc2626' },
}

export default function FieldsPage() {
  const { currentOrg, hasAnyRole } = useOrg()
  const { user } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isAdmin = hasAnyRole(['admin'])
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || 'all')
  const [showAdd, setShowAdd] = useState(false)
  const [editingField, setEditingField] = useState(null)
  const [menuOpen, setMenuOpen] = useState(null)

  useEffect(() => { document.title = 'Fields | My League Board' }, [])
  useEffect(() => { if (currentOrg) fetchFields() }, [currentOrg])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick() { setMenuOpen(null) }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [menuOpen])

  async function fetchFields() {
    setLoading(true)
    const { data } = await supabase
      .from('fields')
      .select('*')
      .eq('organization_id', currentOrg.id)
      .order('name')
    setFields(data || [])
    setLoading(false)
  }

  async function addField(formData) {
    const { data, error } = await supabase
      .from('fields')
      .insert({ ...formData, organization_id: currentOrg.id })
      .select()
      .single()
    if (error) { addToast(error.message, 'error'); return { error } }
    addToast('Field added')
    logActivity(currentOrg.id, 'added', 'field', formData.name)
    setShowAdd(false)
    fetchFields()
    return { error: null }
  }

  async function updateField(id, updates) {
    const { error } = await supabase.from('fields').update(updates).eq('id', id)
    if (error) { addToast(error.message, 'error'); return }
    addToast('Field updated')
    setEditingField(null)
    fetchFields()
  }

  async function updateStatus(field, newStatus) {
    const { error } = await supabase.from('fields').update({ status: newStatus }).eq('id', field.id)
    if (error) { addToast(error.message, 'error'); return }
    addToast(`${field.name} marked ${newStatus}`)
    logActivity(currentOrg.id, `marked ${newStatus}`, 'field', field.name)
    fetchFields()
  }

  async function deleteField(field) {
    if (!confirm(`Delete "${field.name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('fields').delete().eq('id', field.id)
    if (error) { addToast(error.message, 'error'); return }
    addToast('Field deleted')
    logActivity(currentOrg.id, 'deleted', 'field', field.name)
    fetchFields()
  }

  function reportIssue(field) {
    const params = new URLSearchParams({
      type: 'field_condition',
    })
    navigate(`/tickets/new?${params.toString()}`)
  }

  const filtered = filterStatus === 'all' ? fields
    : filterStatus === 'not_available' ? fields.filter(f => f.status !== 'available')
    : fields.filter(f => f.status === filterStatus)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Fields</h1>
          <p className="text-muted">Baseball diamonds, softball fields, batting cages, and practice spaces.</p>
        </div>
        <div className="header-actions">
          {isAdmin && <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add field</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-500)' }}>Filter:</span>
        {['all', 'available', 'maintenance', 'closed'].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              padding: '0.3rem 0.7rem',
              borderRadius: '20px',
              border: '1px solid',
              borderColor: filterStatus === s ? 'var(--green-600)' : 'var(--gray-200)',
              background: filterStatus === s ? 'var(--green-50)' : 'white',
              color: filterStatus === s ? 'var(--green-700)' : 'var(--gray-600)',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state"><div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }}></div></div>
      ) : filtered.length === 0 ? (
        fields.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No fields yet.</p>
            <p className="text-muted" style={{ marginBottom: isAdmin ? '1.25rem' : 0 }}>Fields are where your league plays — diamonds, batting cages, practice spaces. Track status and report issues from one place.</p>
            {isAdmin && <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add your first field</button>}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
            <p>No fields match this filter.</p>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Try the "All" filter to see every field.</p>
          </div>
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {filtered.map(field => {
            const typeConf = FIELD_TYPE_CONFIG[field.field_type] || FIELD_TYPE_CONFIG.other
            const statusConf = STATUS_CONFIG[field.status] || STATUS_CONFIG.available
            return (
              <div key={field.id} style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--green-900)', margin: 0 }}>{field.name}</h3>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-block', fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '10px', background: typeConf.bg, color: typeConf.text }}>{typeConf.label}</span>
                      <span style={{ display: 'inline-block', fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '10px', background: statusConf.bg, color: statusConf.text }}>{statusConf.label}</span>
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === field.id ? null : field.id) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--gray-400)', padding: '0.2rem 0.4rem', borderRadius: '4px', lineHeight: 1 }}
                        title="Actions"
                      >
                        &#8942;
                      </button>
                      {menuOpen === field.id && (
                        <div style={{ position: 'absolute', right: 0, top: '100%', background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, minWidth: '160px', overflow: 'hidden' }}>
                          <button onClick={() => { setEditingField(field); setMenuOpen(null) }} style={menuItemStyle}>Edit</button>
                          {field.status !== 'available' && <button onClick={() => { updateStatus(field, 'available'); setMenuOpen(null) }} style={menuItemStyle}>Mark available</button>}
                          {field.status !== 'maintenance' && <button onClick={() => { updateStatus(field, 'maintenance'); setMenuOpen(null) }} style={menuItemStyle}>Mark maintenance</button>}
                          {field.status !== 'closed' && <button onClick={() => { updateStatus(field, 'closed'); setMenuOpen(null) }} style={menuItemStyle}>Mark closed</button>}
                          <button onClick={() => { deleteField(field); setMenuOpen(null) }} style={{ ...menuItemStyle, color: '#dc2626' }}>Delete</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {field.address && <p style={{ fontSize: '0.8rem', color: 'var(--gray-500)', margin: '0.5rem 0 0' }}>{field.address}</p>}
                {field.notes && <p style={{ fontSize: '0.8rem', color: 'var(--gray-400)', margin: '0.35rem 0 0', fontStyle: 'italic' }}>{field.notes}</p>}

                <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--gray-100)', paddingTop: '0.6rem' }}>
                  <button
                    onClick={() => reportIssue(field)}
                    style={{ background: 'none', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', padding: '0.35rem 0.7rem', fontSize: '0.8rem', color: 'var(--gray-600)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
                  >
                    Report issue
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && <FieldModal onSave={addField} onClose={() => setShowAdd(false)} />}
      {editingField && <FieldModal field={editingField} onSave={(formData) => updateField(editingField.id, formData)} onClose={() => setEditingField(null)} />}
    </>
  )
}

const menuItemStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: '0.5rem 0.85rem',
  fontSize: '0.85rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'var(--gray-700)',
}

function FieldModal({ field, onSave, onClose }) {
  const nameInputRef = useRef(null)
  const modalRef = useFocusTrap({ onClose, initialFocusRef: nameInputRef })
  const [name, setName] = useState(field?.name || '')
  const [fieldType, setFieldType] = useState(field?.field_type || '')
  const [address, setAddress] = useState(field?.address || '')
  const [status, setStatus] = useState(field?.status || 'available')
  const [notes, setNotes] = useState(field?.notes || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSubmitting(true)
    setError('')
    const formData = {
      name: name.trim(),
      field_type: fieldType || null,
      address: address.trim() || null,
      status,
      notes: notes.trim() || null,
    }
    const result = await onSave(formData)
    if (result?.error) setError(result.error.message || 'Something went wrong')
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="field-modal-title">
        <div className="modal-header">
          <h2 id="field-modal-title">{field ? 'Edit field' : 'Add a field'}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Name *</label>
            <input ref={nameInputRef} type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Diamond 1" required />
          </div>
          <div className="form-group">
            <label>Field type</label>
            <select value={fieldType} onChange={e => setFieldType(e.target.value)}>
              <option value="">Select type</option>
              <option value="baseball">Baseball</option>
              <option value="softball">Softball</option>
              <option value="batting_cage">Batting Cage</option>
              <option value="practice">Practice</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label>Address</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" />
          </div>
          <div className="form-group">
            <label>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="available">Available</option>
              <option value="maintenance">Maintenance</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any additional notes..." />
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : (field ? 'Save changes' : 'Add field')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
