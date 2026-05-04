import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { logActivity } from '../lib/activity'
import { friendlyError } from '../lib/errors'
import { SkeletonList } from '../components/Skeleton'

export default function BagTemplatesPage() {
  const { currentOrg, hasAnyRole, rolesLoading } = useOrg()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [categories, setCategories] = useState([])
  const [sportTypes, setSportTypes] = useState([])
  const [divisions, setDivisions] = useState([])
  const [equipmentItems, setEquipmentItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [filterSport, setFilterSport] = useState('')
  const [filterDivision, setFilterDivision] = useState('')

  // Permission guard — redirect if not admin or equipment_manager
  useEffect(() => {
    if (!rolesLoading && !hasAnyRole(['admin', 'equipment_manager'])) {
      addToast("You don't have permission to manage templates.", 'error')
      navigate('/')
    }
  }, [rolesLoading])

  useEffect(() => { document.title = 'Bag templates | My League Board' }, [])
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
    if (!confirm(`Delete "${name}"? This won't affect teams that already have bags from this template.`)) return
    const { error: itemsErr } = await supabase.from('kit_template_items').delete().eq('kit_template_id', id)
    if (itemsErr) { addToast(friendlyError(itemsErr), 'error'); return }
    const { error: tmplErr } = await supabase.from('kit_templates').delete().eq('id', id)
    if (tmplErr) { addToast(friendlyError(tmplErr), 'error'); return }
    addToast('Template deleted')
    logActivity(currentOrg.id, 'deleted', 'template', name)
    fetchAll()
  }

  async function duplicateTemplate(tmpl) {
    const { data: newTmpl, error } = await supabase.from('kit_templates')
      .insert({
        organization_id: currentOrg.id,
        name: `${tmpl.name} (copy)`,
        description: tmpl.description,
        sport_type_id: tmpl.sport_type_id,
        division_name: tmpl.division_name,
        auto_assign_on_team_create: false
      })
      .select().single()
    if (error || !newTmpl) { addToast(friendlyError(error), 'error'); return }
    if (tmpl.kit_template_items?.length > 0) {
      const { error: itemsErr } = await supabase.from('kit_template_items').insert(
        tmpl.kit_template_items.map(i => ({
          kit_template_id: newTmpl.id,
          category_id: i.category_id,
          equipment_item_id: i.equipment_item_id || null,
          quantity: i.quantity,
          is_required: i.is_required,
          notes: i.notes
        }))
      )
      if (itemsErr) {
        addToast("Template was copied, but the items didn't come with it. Add them by hand.", 'error')
        fetchAll()
        return
      }
    }
    addToast(`Duplicated as "${tmpl.name} (copy)"`)
    logActivity(currentOrg.id, 'duplicated', 'template', tmpl.name)
    fetchAll()
  }

  // Filter templates by sport and division
  const filteredTemplates = templates.filter(t => {
    if (filterSport && t.sport_type_id !== filterSport) return false
    if (filterDivision && t.division_name !== filterDivision) return false
    return true
  })
  const divisionOptions = filterSport
    ? [...new Set(templates.filter(t => t.sport_type_id === filterSport).map(t => t.division_name).filter(Boolean))]
    : [...new Set(templates.map(t => t.division_name).filter(Boolean))]

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Bag templates</h1>
          <p className="text-muted">Define what equipment auto-assigns to new teams when they're created in a division.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ New template</button>
      </div>

      {!loading && templates.length > 0 && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <select value={filterSport} onChange={e => { setFilterSport(e.target.value); setFilterDivision('') }} style={{ padding: '0.45rem 0.6rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }}>
            <option value="">All sports</option>
            {sportTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filterDivision} onChange={e => setFilterDivision(e.target.value)} style={{ padding: '0.45rem 0.6rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }}>
            <option value="">All divisions</option>
            {divisionOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {(filterSport || filterDivision) && (
            <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} onClick={() => { setFilterSport(''); setFilterDivision('') }}>Clear filters</button>
          )}
          <span className="text-muted" style={{ alignSelf: 'center', fontSize: '0.85rem' }}>{filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={5} style={{ marginTop: '0.5rem' }} />
      ) : templates.length === 0 ? (
        <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No bag templates yet.</p>
          <p className="text-muted" style={{ marginBottom: '1.25rem' }}>Templates define what equipment goes in a team bag. Create one to enable auto-assign on team creation.</p>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Create your first template</button>
        </div>
      ) : (
        <>
          {/* Desktop table — hidden at <=768px */}
          <div className="table-container bt-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Sport / Division</th>
                  <th>Items</th>
                  <th>Auto-Assign</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map(tmpl => {
                  const itemCount = tmpl.kit_template_items?.length || 0
                  return (
                    <tr key={tmpl.id} onClick={() => setEditing(tmpl)} style={{ cursor: 'pointer' }}>
                      <td>
                        <strong>{tmpl.name}</strong>
                        {tmpl.description && <span className="item-detail">{tmpl.description}</span>}
                      </td>
                      <td className="text-muted">
                        {tmpl.sport_types?.name || '—'}{tmpl.division_name ? ` / ${tmpl.division_name}` : ''}
                      </td>
                      <td>{itemCount} item{itemCount !== 1 ? 's' : ''}</td>
                      <td>
                        {tmpl.auto_assign_on_team_create
                          ? <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'var(--green-100)', color: 'var(--green-700)' }}>Auto-assign ON</span>
                          : <span style={{ fontSize: '0.75rem', fontWeight: 500, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'var(--gray-100)', color: 'var(--gray-500)' }}>Manual only</span>
                        }
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button className="btn-icon-sm" onClick={e => { e.stopPropagation(); setEditing(tmpl) }} aria-label={`Edit ${tmpl.name}`} title="Edit">✎</button>
                          <button className="btn-icon-sm" onClick={e => { e.stopPropagation(); duplicateTemplate(tmpl) }} aria-label={`Duplicate ${tmpl.name}`} title="Duplicate">⧉</button>
                          <button className="btn-icon-sm btn-icon-danger" onClick={e => { e.stopPropagation(); deleteTemplate(tmpl.id, tmpl.name) }} aria-label={`Delete ${tmpl.name}`} title="Delete">✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards — hidden at >=769px. Solves M-01 (row actions
              were horizontal-scroll-hidden in the table at 390px) and gives
              the row actions 44pt+ tap targets with text labels. */}
          <div className="bt-cards">
            {filteredTemplates.map(tmpl => {
              const itemCount = tmpl.kit_template_items?.length || 0
              return (
                <div key={tmpl.id} className="bt-card">
                  <button type="button" className="bt-card-trigger" onClick={() => setEditing(tmpl)} aria-label={`Edit template ${tmpl.name}`}>
                    <div className="bt-card-head">
                      <div className="bt-card-title">
                        <div className="bt-card-name">{tmpl.name}</div>
                        {tmpl.description && <div className="bt-card-desc">{tmpl.description}</div>}
                      </div>
                      {tmpl.auto_assign_on_team_create
                        ? <span className="bt-pill bt-pill-on">Auto-assign ON</span>
                        : <span className="bt-pill bt-pill-off">Manual only</span>
                      }
                    </div>
                    <div className="bt-card-meta">
                      {tmpl.sport_types?.name || '—'}{tmpl.division_name ? ` · ${tmpl.division_name}` : ''} · {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </div>
                  </button>
                  <div className="bt-card-actions">
                    <button type="button" className="bt-card-action" onClick={() => setEditing(tmpl)}>✎ Edit</button>
                    <button type="button" className="bt-card-action" onClick={() => duplicateTemplate(tmpl)}>⧉ Duplicate</button>
                    <button type="button" className="bt-card-action bt-card-action-danger" onClick={() => deleteTemplate(tmpl.id, tmpl.name)}>✕ Delete</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
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

        /* Mobile card variant for the templates list (M-01 fix). */
        .bt-cards { display: none; }
        @media (max-width: 768px) {
          .bt-table-wrap { display: none; }
          .bt-cards { display: flex; flex-direction: column; gap: 0.75rem; }
          .bt-card { background: white; border: 1px solid var(--gray-200); border-radius: var(--radius-lg); padding: 1rem; }
          .bt-card-trigger { display: block; width: 100%; padding: 0; background: transparent; border: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
          .bt-card-trigger:focus-visible { outline: 2px solid var(--green-500); outline-offset: 2px; border-radius: var(--radius); }
          .bt-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.5rem; }
          .bt-card-title { flex: 1; min-width: 0; }
          .bt-card-name { font-weight: 600; font-size: 0.95rem; }
          .bt-card-desc { color: var(--gray-500); font-size: 0.8rem; margin-top: 0.15rem; }
          .bt-pill { font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 9999px; white-space: nowrap; flex-shrink: 0; }
          .bt-pill-on { background: var(--green-100); color: var(--green-700); }
          .bt-pill-off { background: var(--gray-100); color: var(--gray-500); font-weight: 500; }
          .bt-card-meta { color: var(--gray-500); font-size: 0.8rem; margin-bottom: 0.75rem; }
          .bt-card-actions { display: flex; gap: 0.5rem; border-top: 1px solid var(--gray-100); padding-top: 0.75rem; }
          .bt-card-action {
            flex: 1; min-height: 44px;
            display: flex; align-items: center; justify-content: center; gap: 0.35rem;
            font-size: 0.85rem; font-weight: 500; font-family: inherit;
            background: white; color: var(--gray-600);
            border: 1px solid var(--gray-200); border-radius: var(--radius);
            cursor: pointer; padding: 0.5rem 0.75rem;
          }
          .bt-card-action:hover, .bt-card-action:active { color: var(--green-700); background: var(--green-50); border-color: var(--green-200); }
          .bt-card-action.bt-card-action-danger:hover, .bt-card-action.bt-card-action-danger:active { color: var(--red-500); background: var(--red-100); border-color: var(--red-100); }
        }
      `}</style>
    </>
  )
}

function TemplateModal({ template, categories, sportTypes, divisions, equipmentItems, orgId, onDone, onClose }) {
  const { addToast } = useToast()
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

    const itemRows = items.map(i => ({
      category_id: i.category_id,
      equipment_item_id: i.equipment_item_id || null,
      quantity: parseInt(i.quantity) || 1,
      is_required: i.is_required,
      notes: i.notes || null
    }))

    if (template) {
      const { error: updErr } = await supabase.from('kit_templates').update(payload).eq('id', template.id)
      if (updErr) { setError(friendlyError(updErr)); setSubmitting(false); return }
      const { error: delErr } = await supabase.from('kit_template_items').delete().eq('kit_template_id', template.id)
      if (delErr) { setError(friendlyError(delErr)); setSubmitting(false); return }
      const { error: insErr } = await supabase.from('kit_template_items').insert(itemRows.map(i => ({ kit_template_id: template.id, ...i })))
      if (insErr) { setError(friendlyError(insErr)); setSubmitting(false); return }
      addToast('Template saved')
      logActivity(orgId, 'updated', 'template', name)
    } else {
      const { data, error: err } = await supabase.from('kit_templates')
        .insert({ organization_id: orgId, ...payload })
        .select().single()
      if (err) { setError(friendlyError(err)); setSubmitting(false); return }
      const { error: itemsErr } = await supabase.from('kit_template_items').insert(itemRows.map(i => ({ kit_template_id: data.id, ...i })))
      if (itemsErr) { setError(friendlyError(itemsErr)); setSubmitting(false); return }
      addToast('Template created')
      logActivity(orgId, 'created', 'template', name)
    }
    setSubmitting(false)
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{template ? 'Edit template' : 'Create a bag template'}</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">✕</button>
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
              <input type="text" list="division-options" value={divisionName} onChange={e => setDivisionName(e.target.value)} placeholder="Any division" />
              <datalist id="division-options">
                {filteredDivisions.map(d => <option key={d.id} value={d.name} />)}
              </datalist>
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
                      <button type="button" className="btn-icon-sm btn-icon-danger" onClick={() => removeItem(idx)} aria-label="Remove this item">✕</button>
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
