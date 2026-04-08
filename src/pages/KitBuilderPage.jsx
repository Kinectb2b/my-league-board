import { useState, useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Sidebar from '../components/Sidebar'

export default function KitBuilderPage() {
  const [activeTab, setActiveTab] = useState('bags')

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>Kit builder</h1>
            <p className="text-muted">Build, track, and manage team equipment bags</p>
          </div>
        </div>
        <div className="tabs-bar">
          <button className={`tab-btn ${activeTab === 'bags' ? 'active' : ''}`} onClick={() => setActiveTab('bags')}>Team bags</button>
          <button className={`tab-btn ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>Kit templates</button>
        </div>
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'bags' && <BagsTab />}
      </main>
      <style>{kitStyles}</style>
    </div>
  )
}

function TemplatesTab() {
  const { currentOrg } = useOrg()
  const [templates, setTemplates] = useState([])
  const [categories, setCategories] = useState([])
  const [sportTypes, setSportTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => { if (currentOrg) fetchAll() }, [currentOrg])

  async function fetchAll() {
    setLoading(true)
    const orgId = currentOrg.id
    const [t, c, s] = await Promise.all([
      supabase.from('kit_templates').select('*, kit_template_items(*, equipment_categories(name)), sport_types(name)').eq('organization_id', orgId).order('created_at'),
      supabase.from('equipment_categories').select('*').eq('organization_id', orgId).order('name'),
      supabase.from('sport_types').select('*').eq('organization_id', orgId).order('sort_order')
    ])
    setTemplates(t.data || []); setCategories(c.data || []); setSportTypes(s.data || []); setLoading(false)
  }

  async function deleteTemplate(id, name) {
    if (!confirm(`Delete template "${name}"?`)) return
    await supabase.from('kit_template_items').delete().eq('kit_template_id', id)
    await supabase.from('kit_templates').delete().eq('id', id)
    fetchAll()
  }

  if (loading) return <div className="loading-state">Loading...</div>

  return (
    <div>
      <div className="sub-header">
        <span>{templates.length} template{templates.length !== 1 ? 's' : ''}</span>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Create template</button>
      </div>

      {templates.length === 0 ? (
        <div className="empty-state">
          <p>No kit templates yet. Create one to define what goes in a team bag.</p>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Create template</button>
        </div>
      ) : (
        <div className="template-list">
          {templates.map(tmpl => (
            <div key={tmpl.id} className="template-card">
              <div className="template-card-header">
                <div>
                  <h3>{tmpl.name}</h3>
                  <span className="text-muted">{tmpl.sport_types?.name || 'All sports'}{tmpl.division_name ? ` · ${tmpl.division_name}` : ''} · {tmpl.kit_template_items?.length || 0} items</span>
                </div>
                <div className="template-actions">
                  <button className="btn-icon-sm" onClick={() => setEditing(tmpl)} title="Edit">✎</button>
                  <button className="btn-icon-sm btn-icon-danger" onClick={() => deleteTemplate(tmpl.id, tmpl.name)} title="Delete">✕</button>
                </div>
              </div>
              {tmpl.kit_template_items && tmpl.kit_template_items.length > 0 && (
                <div className="template-items-preview">
                  {tmpl.kit_template_items.map(item => (
                    <span key={item.id} className={`template-item-pill ${item.is_required ? 'required' : 'optional'}`}>
                      {item.equipment_categories?.name || 'Unknown'} ×{item.quantity}
                      <span className="pill-tag">{item.is_required ? 'req' : 'opt'}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(showAdd || editing) && (
        <TemplateModal
          template={editing}
          categories={categories}
          sportTypes={sportTypes}
          orgId={currentOrg.id}
          onDone={() => { setShowAdd(false); setEditing(null); fetchAll() }}
          onClose={() => { setShowAdd(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function TemplateModal({ template, categories, sportTypes, orgId, onDone, onClose }) {
  const [name, setName] = useState(template?.name || '')
  const [sportTypeId, setSportTypeId] = useState(template?.sport_type_id || '')
  const [divisionName, setDivisionName] = useState(template?.division_name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [items, setItems] = useState(
    template?.kit_template_items?.map(i => ({ category_id: i.category_id, quantity: i.quantity, is_required: i.is_required, notes: i.notes || '' })) || []
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function addItem() { setItems([...items, { category_id: '', quantity: 1, is_required: true, notes: '' }]) }
  function updateItem(idx, field, value) { const updated = [...items]; updated[idx] = { ...updated[idx], [field]: value }; setItems(updated) }
  function removeItem(idx) { setItems(items.filter((_, i) => i !== idx)) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (items.length === 0) { setError('Add at least one item to the template.'); return }
    if (items.some(i => !i.category_id)) { setError('Select a category for all items.'); return }
    setSubmitting(true); setError('')

    if (template) {
      await supabase.from('kit_templates').update({ name, sport_type_id: sportTypeId || null, division_name: divisionName || null, description: description || null }).eq('id', template.id)
      await supabase.from('kit_template_items').delete().eq('kit_template_id', template.id)
      await supabase.from('kit_template_items').insert(items.map(i => ({ kit_template_id: template.id, category_id: i.category_id, quantity: parseInt(i.quantity) || 1, is_required: i.is_required, notes: i.notes || null })))
    } else {
      const { data, error: err } = await supabase.from('kit_templates').insert({ organization_id: orgId, name, sport_type_id: sportTypeId || null, division_name: divisionName || null, description: description || null }).select().single()
      if (err) { setError(err.message); setSubmitting(false); return }
      await supabase.from('kit_template_items').insert(items.map(i => ({ kit_template_id: data.id, category_id: i.category_id, quantity: parseInt(i.quantity) || 1, is_required: i.is_required, notes: i.notes || null })))
    }
    setSubmitting(false); onDone()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{template ? 'Edit template' : 'Create kit template'}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-row">
            <div className="form-group">
              <label>Template name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Standard Baseball Bag" required />
            </div>
            <div className="form-group">
              <label>Sport</label>
              <select value={sportTypeId} onChange={e => setSportTypeId(e.target.value)}>
                <option value="">All sports</option>
                {sportTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Division (optional)</label>
              <input type="text" value={divisionName} onChange={e => setDivisionName(e.target.value)} placeholder="Minor A, T-Ball, etc" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
          </div>

          <div className="template-items-section">
            <div className="template-items-header">
              <h3>Bag contents</h3>
              <button type="button" className="btn-small" onClick={addItem}>+ Add item</button>
            </div>

            {items.length === 0 ? (
              <p className="text-muted" style={{ textAlign: 'center', padding: '1rem' }}>No items yet. Click "+ Add item" to build the checklist.</p>
            ) : (
              <div className="template-items-list">
                {items.map((item, idx) => (
                  <div key={idx} className="template-item-row">
                    <select value={item.category_id} onChange={e => updateItem(idx, 'category_id', e.target.value)} className="item-category-select" required>
                      <option value="">Select item...</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="item-qty-input" title="Quantity" />
                    <select value={item.is_required ? 'required' : 'optional'} onChange={e => updateItem(idx, 'is_required', e.target.value === 'required')} className="item-req-select">
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                    </select>
                    <input type="text" value={item.notes} onChange={e => updateItem(idx, 'notes', e.target.value)} placeholder="Notes..." className="item-notes-input" />
                    <button type="button" className="btn-icon-sm btn-icon-danger" onClick={() => removeItem(idx)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : (template ? 'Save changes' : 'Create template')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BagsTab() {
  const { currentOrg } = useOrg()
  const { user } = useAuth()
  const [bags, setBags] = useState([])
  const [teams, setTeams] = useState([])
  const [templates, setTemplates] = useState([])
  const [seasons, setSeasons] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [activeBag, setActiveBag] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeason, setFilterSeason] = useState('')

  useEffect(() => { if (currentOrg) fetchAll() }, [currentOrg])
  useEffect(() => { if (seasons.length > 0 && !filterSeason) { const a = seasons.find(s => s.is_active); if (a) setFilterSeason(a.id) } }, [seasons])

  async function fetchAll() {
    setLoading(true)
    const orgId = currentOrg.id
    const [b, t, tmpl, s, c] = await Promise.all([
      supabase.from('team_bags').select('*, teams(name, divisions(name, sport_types(name))), kit_templates(name), seasons(name), profiles!built_by(full_name), team_bag_items(*, equipment_categories(name), bag_item_replacements(*))').eq('organization_id', orgId).order('created_at', { ascending: false }),
      supabase.from('teams').select('*, divisions(name, sport_types(name))').eq('organization_id', orgId),
      supabase.from('kit_templates').select('*, kit_template_items(*, equipment_categories(name))').eq('organization_id', orgId),
      supabase.from('seasons').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
      supabase.from('equipment_categories').select('*').eq('organization_id', orgId)
    ])
    setBags(b.data || []); setTeams(t.data || []); setTemplates(tmpl.data || []); setSeasons(s.data || []); setCategories(c.data || []); setLoading(false)
  }

  async function createBag(teamId, templateId, seasonId, bagTag) {
    const template = templates.find(t => t.id === templateId)
    if (!template) return
    const { data: bag, error } = await supabase.from('team_bags').insert({
      organization_id: currentOrg.id, team_id: teamId, kit_template_id: templateId, season_id: seasonId, bag_tag: bagTag || null, status: 'building'
    }).select().single()
    if (error || !bag) return { error }
    const itemInserts = template.kit_template_items.map(ti => ({
      team_bag_id: bag.id, category_id: ti.category_id, is_required: ti.is_required, is_packed: false, notes: ti.notes
    }))
    await supabase.from('team_bag_items').insert(itemInserts)
    setShowCreate(false); fetchAll(); return { error: null }
  }

  async function togglePacked(bagItemId, currentValue) {
    await supabase.from('team_bag_items').update({ is_packed: !currentValue, packed_at: !currentValue ? new Date().toISOString() : null }).eq('id', bagItemId)
    fetchAll()
  }

  async function markBuilt(bagId) {
    await supabase.from('team_bags').update({ status: 'built', built_by: user.id, built_at: new Date().toISOString() }).eq('id', bagId)
    fetchAll()
  }

  async function markPickedUp(bagId, pickedUpByName) {
    await supabase.from('team_bags').update({ status: 'picked_up', picked_up_by_name: pickedUpByName, picked_up_at: new Date().toISOString() }).eq('id', bagId)
    fetchAll()
  }

  async function markReturned(bagId, condition) {
    await supabase.from('team_bags').update({ status: 'returned', returned_at: new Date().toISOString(), returned_condition: condition || null }).eq('id', bagId)
    fetchAll()
  }

  async function replaceItem(bagItemId, reason, description) {
    await supabase.from('bag_item_replacements').insert({
      team_bag_item_id: bagItemId, reason, description: description || null, replaced_by: user.id
    })
    fetchAll()
  }

  async function deleteBag(id) {
    if (!confirm('Delete this bag and all its items?')) return
    await supabase.from('team_bag_items').delete().eq('team_bag_id', id)
    await supabase.from('team_bags').delete().eq('id', id)
    if (activeBag?.id === id) setActiveBag(null)
    fetchAll()
  }

  const filtered = bags.filter(b => {
    if (filterStatus && b.status !== filterStatus) return false
    if (filterSeason && b.season_id !== filterSeason) return false
    return true
  })

  const statusConfig = {
    building: { label: 'Building', color: '#f97316', bg: '#ffedd5' },
    built: { label: 'Built', color: '#3b82f6', bg: '#dbeafe' },
    picked_up: { label: 'Picked up', color: '#8b5cf6', bg: '#ede9fe' },
    returned: { label: 'Returned', color: '#16a34a', bg: '#d4edda' },
    incomplete: { label: 'Incomplete', color: '#ef4444', bg: '#fee2e2' }
  }

  if (loading) return <div className="loading-state">Loading...</div>

  return (
    <div>
      <div className="sub-header">
        <div className="filters-bar" style={{ marginBottom: 0 }}>
          <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)}>
            <option value="">All seasons</option>
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_active ? ' (active)' : ''}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="building">Building</option>
            <option value="built">Built</option>
            <option value="picked_up">Picked up</option>
            <option value="returned">Returned</option>
          </select>
          <span className="text-muted">{filtered.length} bag{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Build a bag</button>
      </div>

      {templates.length === 0 ? (
        <div className="empty-state"><p>Create a kit template first (use the Kit Templates tab), then come back here to build bags.</p></div>
      ) : filtered.length === 0 && !activeBag ? (
        <div className="empty-state"><p>{bags.length === 0 ? 'No bags built yet. Click "+ Build a bag" to start.' : 'No bags match your filters.'}</p></div>
      ) : (
        <div className="bags-layout">
          <div className="bags-list-panel">
            {filtered.map(bag => {
              const sc = statusConfig[bag.status] || statusConfig.building
              const packedCount = bag.team_bag_items?.filter(i => i.is_packed).length || 0
              const totalCount = bag.team_bag_items?.length || 0
              const requiredCount = bag.team_bag_items?.filter(i => i.is_required).length || 0
              const requiredPacked = bag.team_bag_items?.filter(i => i.is_required && i.is_packed).length || 0
              return (
                <div key={bag.id} className={`bag-card ${activeBag?.id === bag.id ? 'bag-card-active' : ''}`} onClick={() => setActiveBag(bag)}>
                  <div className="bag-card-top">
                    <div>
                      <strong>{bag.teams?.name || 'Unknown team'}</strong>
                      <span className="text-muted" style={{ display: 'block', fontSize: '0.8rem' }}>{bag.teams?.divisions?.name} · {bag.teams?.divisions?.sport_types?.name}</span>
                    </div>
                    <span className="badge" style={{ backgroundColor: sc.bg, color: sc.color }}>{sc.label}</span>
                  </div>
                  <div className="bag-card-bottom">
                    <span className="text-muted">{bag.kit_templates?.name}</span>
                    {bag.bag_tag && <span className="text-muted">Tag: {bag.bag_tag}</span>}
                  </div>
                  <div className="bag-progress">
                    <div className="bag-progress-bar" style={{ width: `${totalCount > 0 ? (packedCount / totalCount) * 100 : 0}%` }}></div>
                  </div>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>{packedCount}/{totalCount} packed · {requiredPacked}/{requiredCount} required</span>
                </div>
              )
            })}
          </div>

          {activeBag && (
            <BagDetail
              bag={activeBag}
              statusConfig={statusConfig}
              onTogglePacked={togglePacked}
              onMarkBuilt={markBuilt}
              onMarkPickedUp={markPickedUp}
              onMarkReturned={markReturned}
              onReplace={replaceItem}
              onDelete={deleteBag}
              onRefresh={fetchAll}
            />
          )}
        </div>
      )}

      {showCreate && (
        <CreateBagModal teams={teams} templates={templates} seasons={seasons} onCreate={createBag} onClose={() => setShowCreate(false)} />
      )}
    </div>
  )
}

function BagDetail({ bag, statusConfig, onTogglePacked, onMarkBuilt, onMarkPickedUp, onMarkReturned, onReplace, onDelete, onRefresh }) {
  const [showPickup, setShowPickup] = useState(false)
  const [showReturn, setShowReturn] = useState(false)
  const [showReplace, setShowReplace] = useState(null)
  const sc = statusConfig[bag.status] || statusConfig.building
  const items = bag.team_bag_items || []
  const requiredItems = items.filter(i => i.is_required)
  const optionalItems = items.filter(i => !i.is_required)
  const allRequiredPacked = requiredItems.every(i => i.is_packed)

  return (
    <div className="bag-detail-panel">
      <div className="bag-detail-header">
        <div>
          <h2>{bag.teams?.name}</h2>
          <span className="text-muted">{bag.kit_templates?.name} · {bag.seasons?.name}{bag.bag_tag ? ` · Tag: ${bag.bag_tag}` : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="badge" style={{ backgroundColor: sc.bg, color: sc.color }}>{sc.label}</span>
          <button className="btn-icon-sm btn-icon-danger" onClick={() => onDelete(bag.id)} title="Delete bag">✕</button>
        </div>
      </div>

      {bag.status === 'building' && allRequiredPacked && (
        <div className="bag-action-bar bag-action-success">
          All required items packed!
          <button className="btn-small" onClick={() => onMarkBuilt(bag.id)}>Mark as built</button>
        </div>
      )}
      {bag.status === 'built' && (
        <div className="bag-action-bar bag-action-info">
          Bag is built and ready for pickup.
          <button className="btn-small" onClick={() => setShowPickup(true)}>Record pickup</button>
        </div>
      )}
      {bag.status === 'picked_up' && (
        <div className="bag-action-bar">
          Picked up by <strong>{bag.picked_up_by_name}</strong> on {new Date(bag.picked_up_at).toLocaleDateString()}
          <button className="btn-small" onClick={() => setShowReturn(true)}>Record return</button>
        </div>
      )}
      {bag.status === 'returned' && (
        <div className="bag-action-bar bag-action-success">
          Returned on {new Date(bag.returned_at).toLocaleDateString()}{bag.returned_condition ? ` · Condition: ${bag.returned_condition}` : ''}
        </div>
      )}
      {bag.built_by && <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>Built by {bag.profiles?.full_name}{bag.built_at ? ` on ${new Date(bag.built_at).toLocaleDateString()}` : ''}</p>}

      <div className="checklist-section">
        {requiredItems.length > 0 && (
          <>
            <h4 className="checklist-heading">Required items ({requiredItems.filter(i => i.is_packed).length}/{requiredItems.length})</h4>
            {requiredItems.map(item => (
              <ChecklistItem key={item.id} item={item} onToggle={onTogglePacked} onReplace={() => setShowReplace(item)} disabled={bag.status === 'returned'} />
            ))}
          </>
        )}
        {optionalItems.length > 0 && (
          <>
            <h4 className="checklist-heading">Optional items ({optionalItems.filter(i => i.is_packed).length}/{optionalItems.length})</h4>
            {optionalItems.map(item => (
              <ChecklistItem key={item.id} item={item} onToggle={onTogglePacked} onReplace={() => setShowReplace(item)} disabled={bag.status === 'returned'} />
            ))}
          </>
        )}
      </div>

      {showPickup && <PickupModal onConfirm={(name) => { onMarkPickedUp(bag.id, name); setShowPickup(false) }} onClose={() => setShowPickup(false)} />}
      {showReturn && <ReturnModal onConfirm={(condition) => { onMarkReturned(bag.id, condition); setShowReturn(false) }} onClose={() => setShowReturn(false)} />}
      {showReplace && <ReplaceModal item={showReplace} onConfirm={(reason, desc) => { onReplace(showReplace.id, reason, desc); setShowReplace(null) }} onClose={() => setShowReplace(null)} />}
    </div>
  )
}

function ChecklistItem({ item, onToggle, onReplace, disabled }) {
  const replacements = item.bag_item_replacements || []
  return (
    <div className={`checklist-item ${item.is_packed ? 'packed' : ''}`}>
      <label className="checklist-label">
        <input type="checkbox" checked={item.is_packed} onChange={() => onToggle(item.id, item.is_packed)} disabled={disabled} />
        <span className="checklist-check">{item.is_packed ? '✓' : ''}</span>
        <span className={`checklist-text ${item.is_packed ? 'checked' : ''}`}>{item.equipment_categories?.name || 'Unknown'}</span>
        <span className={`pill-tag ${item.is_required ? 'required' : 'optional'}`}>{item.is_required ? 'req' : 'opt'}</span>
      </label>
      <div className="checklist-actions">
        {!disabled && <button className="btn-replace" onClick={onReplace} title="Replace item">Replace</button>}
      </div>
      {replacements.length > 0 && (
        <div className="replacement-history">
          {replacements.map(r => (
            <div key={r.id} className="replacement-entry">
              <span className="replacement-reason">{r.reason.replace('_', ' ')}</span>
              {r.description && <span className="text-muted"> — {r.description}</span>}
              <span className="text-muted"> · {new Date(r.replaced_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
      {item.notes && <span className="checklist-note">{item.notes}</span>}
    </div>
  )
}

function CreateBagModal({ teams, templates, seasons, onCreate, onClose }) {
  const [teamId, setTeamId] = useState(''); const [templateId, setTemplateId] = useState(''); const [seasonId, setSeasonId] = useState(seasons.find(s => s.is_active)?.id || ''); const [bagTag, setBagTag] = useState(''); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState('')
  async function handleSubmit(e) { e.preventDefault(); if (!teamId || !templateId || !seasonId) { setError('Select a team, template, and season.'); return }; setSubmitting(true); const result = await onCreate(teamId, templateId, seasonId, bagTag); if (result?.error) setError(result.error.message); setSubmitting(false) }
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Build a bag</h2><button className="btn-icon" onClick={onClose}>✕</button></div><form onSubmit={handleSubmit} className="modal-form"><div className="form-group"><label>Team *</label><select value={teamId} onChange={e => setTeamId(e.target.value)} required><option value="">Select team...</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.divisions?.name} · {t.divisions?.sport_types?.name})</option>)}</select></div><div className="form-group"><label>Kit template *</label><select value={templateId} onChange={e => setTemplateId(e.target.value)} required><option value="">Select template...</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div className="form-row"><div className="form-group"><label>Season *</label><select value={seasonId} onChange={e => setSeasonId(e.target.value)} required>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="form-group"><label>Bag tag #</label><input type="text" value={bagTag} onChange={e => setBagTag(e.target.value)} placeholder="Optional tag number" /></div></div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Creating...' : 'Create bag'}</button></div></form></div></div>)
}

function PickupModal({ onConfirm, onClose }) {
  const [name, setName] = useState('')
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Record pickup</h2><button className="btn-icon" onClick={onClose}>✕</button></div><div className="modal-form"><div className="form-group"><label>Picked up by *</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Coach name or parent name" autoFocus /></div><div className="modal-actions"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => { if (name.trim()) onConfirm(name.trim()) }} disabled={!name.trim()}>Confirm pickup</button></div></div></div></div>)
}

function ReturnModal({ onConfirm, onClose }) {
  const [condition, setCondition] = useState('')
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Record return</h2><button className="btn-icon" onClick={onClose}>✕</button></div><div className="modal-form"><div className="form-group"><label>Return condition</label><select value={condition} onChange={e => setCondition(e.target.value)}><option value="">Select condition...</option><option value="Good - all items present">Good - all items present</option><option value="Missing items">Missing items</option><option value="Damaged items">Damaged items</option><option value="Needs cleaning">Needs cleaning</option></select></div><div className="modal-actions"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onConfirm(condition)}>Confirm return</button></div></div></div></div>)
}

function ReplaceModal({ item, onConfirm, onClose }) {
  const [reason, setReason] = useState('broken'); const [description, setDescription] = useState('')
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Replace: {item.equipment_categories?.name}</h2><button className="btn-icon" onClick={onClose}>✕</button></div><div className="modal-form"><div className="form-group"><label>Reason *</label><select value={reason} onChange={e => setReason(e.target.value)}><option value="broken">Broken</option><option value="lost">Lost</option><option value="damaged">Damaged</option><option value="missing">Missing</option><option value="worn_out">Worn out</option><option value="wrong_size">Wrong size</option><option value="other">Other</option></select></div><div className="form-group"><label>Details</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What happened? Any details for records..." /></div><div className="modal-actions"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onConfirm(reason, description)}>Log replacement</button></div></div></div></div>)
}

const kitStyles = `
  .tabs-bar { display: flex; gap: 0; margin-bottom: 1.5rem; border-bottom: 2px solid var(--gray-200); }
  .tab-btn { background: none; border: none; padding: 0.6rem 1.25rem; font-size: 0.9rem; font-weight: 600; font-family: inherit; color: var(--gray-500); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color 0.15s, border-color 0.15s; }
  .tab-btn:hover { color: var(--gray-700); }
  .tab-btn.active { color: var(--green-700); border-bottom-color: var(--green-700); }
  .sub-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
  .template-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .template-card { background: white; border: 1px solid var(--gray-200); border-radius: var(--radius-lg); padding: 1.25rem; }
  .template-card-header { display: flex; justify-content: space-between; align-items: flex-start; }
  .template-card h3 { font-size: 1rem; font-weight: 600; color: var(--green-800); }
  .template-actions { display: flex; gap: 0.25rem; opacity: 0; transition: opacity 0.15s; }
  .template-card:hover .template-actions { opacity: 1; }
  .template-items-preview { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.75rem; }
  .template-item-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 500; }
  .template-item-pill.required { background: var(--green-100); color: var(--green-700); }
  .template-item-pill.optional { background: var(--gray-100); color: var(--gray-600); }
  .pill-tag { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; }
  .pill-tag.required { color: var(--green-700); }
  .pill-tag.optional { color: var(--gray-500); }
  .modal-wide { max-width: 680px; }
  .template-items-section { border: 1px solid var(--gray-200); border-radius: var(--radius); padding: 1rem; margin-top: 0.5rem; background: var(--gray-50); }
  .template-items-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .template-items-header h3 { font-size: 0.9rem; font-weight: 600; }
  .template-items-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .template-item-row { display: flex; gap: 0.5rem; align-items: center; }
  .item-category-select { flex: 2; padding: 0.4rem 0.5rem; border: 1.5px solid var(--gray-200); border-radius: var(--radius); font-size: 0.85rem; font-family: inherit; }
  .item-qty-input { width: 55px; padding: 0.4rem 0.5rem; border: 1.5px solid var(--gray-200); border-radius: var(--radius); font-size: 0.85rem; font-family: inherit; text-align: center; }
  .item-req-select { width: 100px; padding: 0.4rem 0.5rem; border: 1.5px solid var(--gray-200); border-radius: var(--radius); font-size: 0.85rem; font-family: inherit; }
  .item-notes-input { flex: 1; padding: 0.4rem 0.5rem; border: 1.5px solid var(--gray-200); border-radius: var(--radius); font-size: 0.85rem; font-family: inherit; }
  .bags-layout { display: flex; gap: 1.5rem; }
  .bags-list-panel { flex: 0 0 320px; display: flex; flex-direction: column; gap: 0.5rem; max-height: calc(100vh - 260px); overflow-y: auto; }
  .bag-card { background: white; border: 1.5px solid var(--gray-200); border-radius: var(--radius-lg); padding: 1rem; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
  .bag-card:hover { border-color: var(--green-400); }
  .bag-card-active { border-color: var(--green-600) !important; box-shadow: 0 0 0 2px rgba(58,157,94,0.15); }
  .bag-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.35rem; }
  .bag-card-bottom { display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.5rem; }
  .bag-progress { height: 4px; background: var(--gray-200); border-radius: 2px; overflow: hidden; margin-bottom: 0.35rem; }
  .bag-progress-bar { height: 100%; background: var(--green-500); border-radius: 2px; transition: width 0.3s; }
  .bag-detail-panel { flex: 1; background: white; border: 1px solid var(--gray-200); border-radius: var(--radius-lg); padding: 1.5rem; max-height: calc(100vh - 260px); overflow-y: auto; }
  .bag-detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--gray-100); }
  .bag-detail-header h2 { font-size: 1.2rem; font-weight: 600; color: var(--green-800); }
  .bag-action-bar { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-radius: var(--radius); background: var(--gray-50); border: 1px solid var(--gray-200); font-size: 0.85rem; margin-bottom: 1rem; }
  .bag-action-success { background: var(--green-50); border-color: var(--green-400); color: var(--green-800); }
  .bag-action-info { background: var(--blue-100); border-color: #93bbfd; color: #1e40af; }
  .checklist-section { margin-top: 0.5rem; }
  .checklist-heading { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--gray-500); margin: 1rem 0 0.5rem; }
  .checklist-item { padding: 0.5rem 0; border-bottom: 1px solid var(--gray-100); }
  .checklist-item.packed { opacity: 0.7; }
  .checklist-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.9rem; }
  .checklist-label input[type="checkbox"] { display: none; }
  .checklist-check { width: 20px; height: 20px; border: 1.5px solid var(--gray-300); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: white; background: white; transition: all 0.15s; flex-shrink: 0; }
  .checklist-item.packed .checklist-check { background: var(--green-600); border-color: var(--green-600); }
  .checklist-text { flex: 1; }
  .checklist-text.checked { text-decoration: line-through; color: var(--gray-400); }
  .checklist-actions { display: flex; gap: 0.25rem; margin-left: 2rem; margin-top: 0.25rem; }
  .btn-replace { background: none; border: 1px solid var(--gray-200); color: var(--gray-500); padding: 0.15rem 0.5rem; border-radius: var(--radius); font-size: 0.7rem; font-family: inherit; cursor: pointer; transition: all 0.15s; }
  .btn-replace:hover { border-color: var(--orange-500); color: var(--orange-500); background: var(--orange-100); }
  .replacement-history { margin-left: 2rem; margin-top: 0.35rem; }
  .replacement-entry { font-size: 0.75rem; padding: 0.2rem 0; color: var(--gray-600); }
  .replacement-reason { background: var(--orange-100); color: var(--orange-500); padding: 0.1rem 0.4rem; border-radius: 10px; font-weight: 600; font-size: 0.7rem; text-transform: capitalize; }
  .checklist-note { display: block; margin-left: 2rem; font-size: 0.75rem; color: var(--gray-400); font-style: italic; margin-top: 0.15rem; }
  .btn-icon-sm { background: none; border: none; color: var(--gray-400); cursor: pointer; font-size: 0.85rem; padding: 0.2rem 0.4rem; border-radius: 4px; transition: color 0.15s, background 0.15s; line-height: 1; }
  .btn-icon-sm:hover { color: var(--green-700); background: var(--green-100); }
  .btn-icon-danger:hover { color: var(--red-500) !important; background: var(--red-100) !important; }
  @media (max-width: 768px) { .bags-layout { flex-direction: column; } .bags-list-panel { flex: none; max-height: none; } }
`
