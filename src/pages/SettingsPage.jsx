import { useState, useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import Sidebar from '../components/Sidebar'

export default function SettingsPage() {
  const { currentOrg } = useOrg()
  const { addToast } = useToast()
  const [templates, setTemplates] = useState([])
  const [categories, setCategories] = useState([])
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => { if (currentOrg) fetchAll() }, [currentOrg])

  async function fetchAll() {
    setLoading(true)
    const orgId = currentOrg.id
    const [t, c, e] = await Promise.all([
      supabase.from('kit_templates').select('*, kit_template_items(*, equipment_categories(name), equipment_items(name))').eq('organization_id', orgId),
      supabase.from('equipment_categories').select('*').eq('organization_id', orgId).order('name'),
      supabase.from('equipment_items').select('*, equipment_categories(name)').eq('organization_id', orgId).order('name')
    ])
    setTemplates(t.data || []); setCategories(c.data || []); setEquipment(e.data || []); setLoading(false)
  }

  async function deleteTemplate(id, name) {
    if (!confirm('Delete template "' + name + '"? This won\'t affect bags already created from it.')) return
    await supabase.from('kit_template_items').delete().eq('kit_template_id', id)
    await supabase.from('kit_templates').delete().eq('id', id)
    addToast('Template deleted')
    fetchAll()
  }

  async function saveTemplate(template, name, sportTypeId, items) {
    if (template) {
      await supabase.from('kit_templates').update({ name, sport_type_id: sportTypeId || null }).eq('id', template.id)
      await supabase.from('kit_template_items').delete().eq('kit_template_id', template.id)
      if (items.length > 0) {
        await supabase.from('kit_template_items').insert(items.map(i => ({
          kit_template_id: template.id, equipment_item_id: i.equipment_item_id || null,
          category_id: i.category_id || null, quantity: 1, is_required: i.is_required
        })))
      }
      addToast('Template updated')
    } else {
      const { data } = await supabase.from('kit_templates').insert({
        organization_id: currentOrg.id, name, sport_type_id: sportTypeId || null
      }).select().single()
      if (data && items.length > 0) {
        await supabase.from('kit_template_items').insert(items.map(i => ({
          kit_template_id: data.id, equipment_item_id: i.equipment_item_id || null,
          category_id: i.category_id || null, quantity: 1, is_required: i.is_required
        })))
      }
      addToast('Template created')
    }
    setEditingTemplate(null); setShowAdd(false); fetchAll()
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>Settings</h1>
            <p className="text-muted">Kit templates and league settings</p>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Kit templates</h2>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Create template</button>
          </div>

          {loading ? <div className="loading-state">Loading...</div> : templates.length === 0 ? (
            <div className="empty-state"><p>No templates yet. Create one to define what goes in a team gear bag.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {templates.map(t => (
                <div key={t.id} style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ color: 'var(--green-800)' }}>{t.name}</strong>
                      <span className="text-muted" style={{ marginLeft: '0.5rem' }}>{t.kit_template_items?.length || 0} items</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn-small" onClick={() => setEditingTemplate(t)}>Edit</button>
                      <button className="btn-small" style={{ background: 'var(--red-100)', color: 'var(--red-500)' }} onClick={() => deleteTemplate(t.id, t.name)}>Delete</button>
                    </div>
                  </div>
                  {t.kit_template_items && t.kit_template_items.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                      {t.kit_template_items.map((item, i) => (
                        <span key={i} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '10px', fontWeight: 500, background: item.is_required ? '#d4edda' : '#f3f4f6', color: item.is_required ? '#16a34a' : '#6b7280' }}>
                          {item.equipment_items?.name || item.equipment_categories?.name || 'Unknown'} {item.is_required ? '(req)' : '(opt)'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {(showAdd || editingTemplate) && (
          <TemplateEditor
            template={editingTemplate}
            equipment={equipment}
            onSave={saveTemplate}
            onClose={() => { setShowAdd(false); setEditingTemplate(null) }}
          />
        )}
      </main>
    </div>
  )
}

function TemplateEditor({ template, equipment, onSave, onClose }) {
  const [name, setName] = useState(template?.name || '')
  const [items, setItems] = useState(
    template?.kit_template_items?.map(i => ({
      equipment_item_id: i.equipment_item_id, category_id: i.category_id, is_required: i.is_required
    })) || []
  )
  const [submitting, setSubmitting] = useState(false)

  function addItem() { setItems([...items, { equipment_item_id: '', category_id: null, is_required: true }]) }
  function updateItem(idx, field, value) { const u = [...items]; u[idx] = { ...u[idx], [field]: value }; setItems(u) }
  function removeItem(idx) { setItems(items.filter((_, i) => i !== idx)) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    await onSave(template, name, null, items)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{template ? 'Edit template' : 'Create template'}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Template name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Standard Baseball Bag" required autoFocus />
          </div>
          <div style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', padding: '1rem', background: 'var(--gray-50)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ fontSize: '0.9rem' }}>Bag contents</strong>
              <button type="button" className="btn-small" onClick={addItem}>+ Add item</button>
            </div>
            {items.length === 0 ? <p className="text-muted" style={{ textAlign: 'center', padding: '0.5rem' }}>Click "+ Add item"</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select value={item.equipment_item_id || ''} onChange={e => updateItem(idx, 'equipment_item_id', e.target.value)} style={{ flex: 2, padding: '0.4rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                      <option value="">Select item...</option>
                      {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}{eq.equipment_categories?.name ? ' (' + eq.equipment_categories.name + ')' : ''}</option>)}
                    </select>
                    <select value={item.is_required ? 'required' : 'optional'} onChange={e => updateItem(idx, 'is_required', e.target.value === 'required')} style={{ width: '100px', padding: '0.4rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                    </select>
                    <button type="button" style={{ background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer', fontSize: '0.85rem' }} onClick={() => removeItem(idx)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : (template ? 'Save changes' : 'Create template')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
