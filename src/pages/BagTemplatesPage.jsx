import { useState, useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

export default function BagTemplatesPage() {
  const { currentOrg } = useOrg()
  const { addToast } = useToast()
  const [templates, setTemplates] = useState([])
  const [categories, setCategories] = useState([])
  const [sportTypes, setSportTypes] = useState([])
  const [divisions, setDivisions] = useState([])
  const [equipmentItems, setEquipmentItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => { document.title = 'Bag Templates | My League Board' }, [])
  useEffect(() => { if (currentOrg) fetchAll() }, [currentOrg])

  async function fetchAll() {
    setLoading(true)
    const orgId = currentOrg.id
    const [t, c, s, d, ei] = await Promise.all([
      supabase.from('kit_templates').select('*, kit_template_items(*, equipment_categories(name), equipment_items(name, brand)), sport_types(name)').eq('organization_id', orgId).order('created_at'),
      supabase.from('equipment_categories').select('*').eq('organization_id', orgId).order('name'),
      supabase.from('sport_types').select('*').eq('organization_id', orgId).order('sort_order'),
      supabase.from('divisions').select('*, sport_types(name)').eq('organization_id', orgId).order('sort_order'),
      supabase.from('equipment_items').select('id, name, brand, category_id').eq('organization_id', orgId).order('name')
    ])
    setTemplates(t.data || [])
    setCategories(c.data || [])
    setSportTypes(s.data || [])
    setDivisions(d.data || [])
    setEquipmentItems(ei.data || [])
    setLoading(false)
  }

  async function deleteTemplate(id, name) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return
    await supabase.from('kit_template_items').delete().eq('kit_template_id', id)
    await supabase.from('kit_templates').delete().eq('id', id)
    addToast('Template deleted')
    fetchAll()
  }

  async function duplicateTemplate(tmpl) {
    const { data: newTmpl, error } = await supabase.from('kit_templates')
      .insert({
        organization_id: currentOrg.id,
        name: `Copy of ${tmpl.name}`,
        description: tmpl.description,
        sport_type_id: tmpl.sport_type_id,
        division_name: tmpl.division_name,
        auto_assign_on_team_create: tmpl.auto_assign_on_team_create
      })
      .select().single()
    if (error || !newTmpl) { addToast('Failed to duplicate', 'error'); return }
    if (tmpl.kit_template_items?.length > 0) {
      await supabase.from('kit_template_items').insert(
        tmpl.kit_template_items.map(i => ({
          kit_template_id: newTmpl.id,
          category_id: i.category_id,
          equipment_item_id: i.equipment_item_id || null,
          quantity: i.quantity,
          is_required: i.is_required,
          notes: i.notes
        }))
      )
    }
    addToast(`Duplicated as "Copy of ${tmpl.name}"`)
    fetchAll()
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Bag templates</h1>
          <p className="text-muted">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ New template</button>
      </div>

      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="empty-state">
          <p>No bag templates yet. Create one to define what goes in a team bag.</p>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>+ New template</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Division</th>
                <th>Items</th>
                <th>Auto-Assign</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {templates.map(tmpl => (
                <tr key={tmpl.id}>
                  <td>
                    <strong>{tmpl.name}</strong>
                    {tmpl.description && <span className="item-detail">{tmpl.description}</span>}
                  </td>
                  <td className="text-muted">
                    {tmpl.sport_types?.name || '—'}{tmpl.division_name ? ` / ${tmpl.division_name}` : ''}
                  </td>
                  <td>{tmpl.kit_template_items?.length || 0}</td>
                  <td>{tmpl.auto_assign_on_team_create ? 'Yes' : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn-icon-sm" onClick={() => setEditing(tmpl)} title="Edit">✎</button>
                      <button className="btn-icon-sm" onClick={() => duplicateTemplate(tmpl)} title="Duplicate">⧉</button>
                      <button className="btn-icon-sm btn-icon-danger" onClick={() => deleteTemplate(tmpl.id, tmpl.name)} title="Delete">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && (
        <TemplateModal
          template={editing}
          categories={categories}
          sportTypes={sportTypes}
          divisions={divisions}
          equipmentItems={equipmentItems}
          orgId={currentOrg.id}
          onDone={() => { setShowAdd(false); setEditing(null); fetchAll() }}
          onClose={() => { setShowAdd(false); setEditing(null) }}
        />
      )}

      <style>{`
        .btn-icon-sm { background:none; border:none; color:var(--gray-400); cursor:pointer; font-size:0.85rem; padding:0.2rem 0.4rem; border-radius:4px; transition:color .15s,background .15s; line-height:1; }
        .btn-icon-sm:hover { color:var(--green-700); background:var(--green-100); }
        .btn-icon-danger:hover { color:var(--red-500)!important; background:var(--red-100)!important; }
      `}</style>
    </>
  )
}

function TemplateModal({ template, categories, sportTypes, divisions, equipmentItems, orgId, onDone, onClose }) {
  const [name, setName] = useState(template?.name || '')
  const [sportTypeId, setSportTypeId] = useState(template?.sport_type_id || '')
  const [divisionName, setDivisionName] = useState(template?.division_name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [autoAssign, setAutoAssign] = useState(template?.auto_assign_on_team_create || false)
  const [items, setItems] = useState(
    template?.kit_template_items?.map(i => ({
      category_id: i.category_id,
      equipment_item_id: i.equipment_item_id || '',
      quantity: i.quantity,
      is_required: i.is_required,
      notes: i.notes || ''
    })) || []
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const filteredDivisions = sportTypeId
    ? divisions.filter(d => d.sport_type_id === sportTypeId)
    : divisions

  function addItem() {
    setItems([...items, { category_id: '', equipment_item_id: '', quantity: 1, is_required: true, notes: '' }])
  }

  function updateItem(idx, field, value) {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }
    // Clear specific item if category changes
    if (field === 'category_id') updated[idx].equipment_item_id = ''
    setItems(updated)
  }

  function removeItem(idx) { setItems(items.filter((_, i) => i !== idx)) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (items.length === 0) { setError('Add at least one item to the template.'); return }
    if (items.some(i => !i.category_id)) { setError('Select a category for all items.'); return }
    setSubmitting(true); setError('')

    const payload = {
      name,
      sport_type_id: sportTypeId || null,
      division_name: divisionName || null,
      description: description || null,
      auto_assign_on_team_create: autoAssign
    }

    if (template) {
      await supabase.from('kit_templates').update(payload).eq('id', template.id)
      await supabase.from('kit_template_items').delete().eq('kit_template_id', template.id)
      await supabase.from('kit_template_items').insert(items.map(i => ({
        kit_template_id: template.id,
        category_id: i.category_id,
        equipment_item_id: i.equipment_item_id || null,
        quantity: parseInt(i.quantity) || 1,
        is_required: i.is_required,
        notes: i.notes || null
      })))
    } else {
      const { data, error: err } = await supabase.from('kit_templates')
        .insert({ organization_id: orgId, ...payload })
        .select().single()
      if (err) { setError(err.message); setSubmitting(false); return }
      await supabase.from('kit_template_items').insert(items.map(i => ({
        kit_template_id: data.id,
        category_id: i.category_id,
        equipment_item_id: i.equipment_item_id || null,
        quantity: parseInt(i.quantity) || 1,
        is_required: i.is_required,
        notes: i.notes || null
      })))
    }
    setSubmitting(false)
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{template ? 'Edit template' : 'Create bag template'}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Template name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Minor A Baseball Bag" required />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Sport</label>
              <select value={sportTypeId} onChange={e => { setSportTypeId(e.target.value); setDivisionName('') }}>
                <option value="">All sports</option>
                {sportTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Division</label>
              <select value={divisionName} onChange={e => setDivisionName(e.target.value)}>
                <option value="">Any division</option>
                {filteredDivisions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Description</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
            </div>
            <div className="form-group" style={{ flex: 'none' }}>
              <label>&nbsp;</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 400, textTransform: 'none', cursor: 'pointer' }}>
                <input type="checkbox" checked={autoAssign} onChange={e => setAutoAssign(e.target.checked)} />
                Auto-assign on team create
              </label>
            </div>
          </div>

          <div style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', padding: '1rem', marginTop: '0.5rem', background: 'var(--gray-50)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Bag contents</h3>
              <button type="button" className="btn-small" onClick={addItem}>+ Add item</button>
            </div>

            {items.length === 0 ? (
              <p className="text-muted" style={{ textAlign: 'center', padding: '1rem' }}>No items yet. Click "+ Add item" to build the checklist.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '0 0.25rem' }}>
                  <span style={{ flex: 2 }}>Category</span>
                  <span style={{ width: '55px', textAlign: 'center' }}>Qty</span>
                  <span style={{ width: '90px' }}>Required</span>
                  <span style={{ flex: 2 }}>Specific item</span>
                  <span style={{ width: '24px' }}></span>
                </div>
                {items.map((item, idx) => {
                  const itemsInCat = item.category_id
                    ? equipmentItems.filter(ei => ei.category_id === item.category_id)
                    : []
                  return (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select value={item.category_id} onChange={e => updateItem(idx, 'category_id', e.target.value)} style={{ flex: 2, padding: '0.4rem 0.5rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }} required>
                        <option value="">Select category...</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} style={{ width: '55px', padding: '0.4rem 0.5rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit', textAlign: 'center' }} />
                      <select value={item.is_required ? 'required' : 'optional'} onChange={e => updateItem(idx, 'is_required', e.target.value === 'required')} style={{ width: '90px', padding: '0.4rem 0.5rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                        <option value="required">Required</option>
                        <option value="optional">Optional</option>
                      </select>
                      <select value={item.equipment_item_id} onChange={e => updateItem(idx, 'equipment_item_id', e.target.value)} style={{ flex: 2, padding: '0.4rem 0.5rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                        <option value="">Any item in category</option>
                        {itemsInCat.map(ei => <option key={ei.id} value={ei.id}>{ei.name}{ei.brand ? ` (${ei.brand})` : ''}</option>)}
                      </select>
                      <button type="button" className="btn-icon-sm btn-icon-danger" onClick={() => removeItem(idx)}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : (template ? 'Save changes' : 'Create template')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
