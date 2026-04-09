import { useState, useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import { useToast } from '../components/Toast'
import { logActivity } from '../lib/activity'

export default function TeamsPage() {
  const { currentOrg, userRole } = useOrg()
  const { user } = useAuth()
  const { addToast } = useToast()
  const canEdit = ['admin','equipment_manager'].includes(userRole)
  const [teams, setTeams] = useState([])
  const [divisions, setDivisions] = useState([])
  const [seasons, setSeasons] = useState([])
  const [sportTypes, setSportTypes] = useState([])
  const [bags, setBags] = useState([])
  const [templates, setTemplates] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [showAddDivision, setShowAddDivision] = useState(false)
  const [showAddSport, setShowAddSport] = useState(false)
  const [showAddSeason, setShowAddSeason] = useState(false)
  const [editingTeam, setEditingTeam] = useState(null)
  const [editingDivision, setEditingDivision] = useState(null)
  const [filterSeason, setFilterSeason] = useState('')
  const [dragDivision, setDragDivision] = useState(null)
  const [dragOverDivision, setDragOverDivision] = useState(null)
  const [dragSport, setDragSport] = useState(null)
  const [dragOverSport, setDragOverSport] = useState(null)
  const [quickAddDivisionId, setQuickAddDivisionId] = useState(null)
  const [quickAddName, setQuickAddName] = useState('')
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false)
  const [gearTeam, setGearTeam] = useState(null)
  const [showAssignGear, setShowAssignGear] = useState(null)
  const [bulkAssignDivision, setBulkAssignDivision] = useState(null)
  const [teamSearch, setTeamSearch] = useState('')

  useEffect(() => { document.title = 'Teams | My League Board' }, [])
  useEffect(() => { if (currentOrg) fetchAll() }, [currentOrg])
  useEffect(() => { if (seasons.length > 0 && !filterSeason) { const a = seasons.find(s => s.is_active); if (a) setFilterSeason(a.id) } }, [seasons])

  async function fetchAll() {
    setLoading(true)
    const orgId = currentOrg.id
    const [t, d, s, sp, b, tmpl, mem] = await Promise.all([
      supabase.from('teams').select('*, divisions(name, sport_type_id, season_id, sport_types(name))').eq('organization_id', orgId),
      supabase.from('divisions').select('*, sport_types(name), seasons(name)').eq('organization_id', orgId).order('sort_order'),
      supabase.from('seasons').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }),
      supabase.from('sport_types').select('*').eq('organization_id', orgId).order('sort_order'),
      supabase.from('team_bags').select('*, teams(name), kit_templates(name), profiles!built_by(full_name), team_bag_items(*, equipment_categories(name), equipment_items(name), bag_item_replacements(*))').eq('organization_id', orgId),
      supabase.from('kit_templates').select('*, kit_template_items(*, equipment_categories(name), equipment_items(name))').eq('organization_id', orgId),
      supabase.from('organization_members').select('*, profiles!profile_id(id, full_name, email)').eq('organization_id', orgId)
    ])
    setTeams(t.data||[]); setDivisions(d.data||[]); setSeasons(s.data||[]); setSportTypes(sp.data||[]); setBags(b.data||[]); setTemplates(tmpl.data||[]); setMembers(mem.data||[]); setLoading(false)
  }

  function getTeamBag(teamId) { return bags.find(b => b.team_id === teamId && b.season_id === filterSeason) }

  async function duplicateTeam(team) {
    const { error } = await supabase.from('teams').insert({ organization_id: currentOrg.id, name: team.name + ' (copy)', division_id: team.division_id, color: team.color })
    if (!error) { addToast('Team duplicated'); fetchAll() }
  }
  async function deleteTeam(id, name) { if (!confirm(`Delete team "${name}"?`)) return; await supabase.from('teams').delete().eq('id', id); fetchAll() }
  async function deleteDivision(id, name) { const dt = teams.filter(t => t.division_id === id); if (dt.length > 0) { alert(`Cannot delete — has ${dt.length} team(s).`); return }; if (!confirm(`Delete "${name}"?`)) return; await supabase.from('divisions').delete().eq('id', id); fetchAll() }
  async function deleteSport(id, name) { const sd = divisions.filter(d => d.sport_type_id === id); if (sd.length > 0) { alert(`Cannot delete — has ${sd.length} division(s).`); return }; if (!confirm(`Delete "${name}"?`)) return; await supabase.from('sport_types').delete().eq('id', id); fetchAll() }

  async function handleDivisionDrop(targetDivId, sportId) {
    if (!dragDivision || dragDivision.id === targetDivId || dragDivision.sport_type_id !== sportId) { setDragDivision(null); setDragOverDivision(null); return }
    const sportDivs = filteredDivisions.filter(d => d.sport_type_id === sportId).map(d => d.id)
    const fi = sportDivs.indexOf(dragDivision.id); const ti = sportDivs.indexOf(targetDivId)
    sportDivs.splice(fi, 1); sportDivs.splice(ti, 0, dragDivision.id)
    await Promise.all(sportDivs.map((id, i) => supabase.from('divisions').update({ sort_order: i }).eq('id', id)))
    setDragDivision(null); setDragOverDivision(null); fetchAll()
  }

  async function handleSportDrop(targetSportId) {
    if (!dragSport || dragSport.id === targetSportId) { setDragSport(null); setDragOverSport(null); return }
    const ids = sportTypes.map(s => s.id); const fi = ids.indexOf(dragSport.id); const ti = ids.indexOf(targetSportId)
    ids.splice(fi, 1); ids.splice(ti, 0, dragSport.id)
    await Promise.all(ids.map((id, i) => supabase.from('sport_types').update({ sort_order: i }).eq('id', id)))
    setDragSport(null); setDragOverSport(null); fetchAll()
  }

  async function quickAddTeam(divisionId) {
    if (!quickAddName.trim()) return; setQuickAddSubmitting(true)
    await supabase.from('teams').insert({ organization_id: currentOrg.id, name: quickAddName.trim(), division_id: divisionId, color: '#1a472a' })
    setQuickAddName(''); setQuickAddDivisionId(null); setQuickAddSubmitting(false); fetchAll()
    logActivity(currentOrg.id, 'added', 'team', quickAddName.trim())
  }

  async function createBagFromTemplate(teamId, templateId, bagTag) {
    const template = templates.find(t => t.id === templateId)
    if (!template) return
    const { data: bag, error } = await supabase.from('team_bags').insert({
      organization_id: currentOrg.id, team_id: teamId, kit_template_id: templateId,
      season_id: filterSeason, bag_tag: bagTag || null, status: 'building'
    }).select().single()
    if (error || !bag) return
    const items = template.kit_template_items.map(ti => ({
      team_bag_id: bag.id, category_id: ti.category_id, equipment_item_id: ti.equipment_item_id, is_required: ti.is_required, is_packed: false, notes: ti.notes
    }))
    if (items.length > 0) await supabase.from('team_bag_items').insert(items)
    setShowAssignGear(null); fetchAll(); addToast('Gear assigned to team')
    logActivity(currentOrg.id, 'assigned gear', 'team', teams.find(t => t.id === teamId)?.name)
  }

  async function togglePacked(bagItemId, current) {
    await supabase.from('team_bag_items').update({ is_packed: !current, packed_at: !current ? new Date().toISOString() : null }).eq('id', bagItemId)
    fetchAll()
  }

  async function markBuilt(bagId) {
    await supabase.from('team_bags').update({ status: 'built', built_by: user.id, built_at: new Date().toISOString() }).eq('id', bagId)
    fetchAll(); addToast('Bag marked as built')
    logActivity(currentOrg.id, 'marked built', 'bag', gearTeam?.name)
  }

  async function markPickedUp(bagId, name) {
    await supabase.from('team_bags').update({ status: 'picked_up', picked_up_by_name: name, picked_up_at: new Date().toISOString() }).eq('id', bagId)
    fetchAll(); addToast('Pickup recorded')
    logActivity(currentOrg.id, 'recorded pickup', 'bag', gearTeam?.name, 'Picked up by ' + name)
  }

  async function markReturned(bagId, condition) {
    await supabase.from('team_bags').update({ status: 'returned', returned_at: new Date().toISOString(), returned_condition: condition || null }).eq('id', bagId)
    fetchAll(); addToast('Return recorded')
    logActivity(currentOrg.id, 'recorded return', 'bag', gearTeam?.name)
  }

  async function replaceItem(bagItemId, reason, description) {
    await supabase.from('bag_item_replacements').insert({ team_bag_item_id: bagItemId, reason, description: description || null, replaced_by: user.id })
    fetchAll()
  }

  async function removeBagItem(bagItemId) {
    if (!confirm('Remove this item from the bag?')) return
    await supabase.from('team_bag_items').delete().eq('id', bagItemId)
    addToast('Item removed from bag')
    fetchAll()
  }

  async function deleteBag(bagId) {
    if (!confirm('Delete this bag assignment?')) return
    await supabase.from('team_bag_items').delete().eq('team_bag_id', bagId)
    await supabase.from('team_bags').delete().eq('id', bagId)
    setGearTeam(null); fetchAll()
  }

  const filteredDivisions = divisions.filter(d => !filterSeason || d.season_id === filterSeason)
  const filteredTeams = teams.filter(t => { const div = divisions.find(d => d.id === t.division_id); const matchesSearch = !teamSearch || t.name.toLowerCase().includes(teamSearch.toLowerCase()); return div && (!filterSeason || div.season_id === filterSeason) && matchesSearch })

  const statusConfig = {
    building: { label: 'Building', color: '#f97316', bg: '#ffedd5' },
    built: { label: 'Ready', color: '#3b82f6', bg: '#dbeafe' },
    picked_up: { label: 'Picked up', color: '#8b5cf6', bg: '#ede9fe' },
    returned: { label: 'Returned', color: '#16a34a', bg: '#d4edda' }
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>Teams & divisions</h1>
            <p className="text-muted">{filteredTeams.length} teams across {filteredDivisions.length} divisions</p>
          </div>
          {canEdit && <div className="header-actions">
            <button className="btn-secondary" onClick={() => setShowAddSport(true)}>+ Sport</button>
            <button className="btn-secondary" onClick={() => setShowAddSeason(true)}>+ Season</button>
            {sportTypes.length > 0 && seasons.length > 0 && (<><button className="btn-secondary" onClick={() => setShowAddDivision(true)}>+ Division</button><button className="btn-primary" onClick={() => setShowAddTeam(true)}>+ Team</button></>)}
          </div>}
        </div>

        {seasons.length > 0 && (
          <div className="filters-bar">
            <input type="text" className="search-input" value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder="Search teams..." style={{ maxWidth: '200px' }} />
            <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)}>
              <option value="">All seasons</option>
              {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_active ? ' (active)' : ''}</option>)}
            </select>
            {sportTypes.length > 1 && <p className="text-muted" style={{ fontSize: '0.8rem', marginLeft: '0.5rem' }}>Drag sports or divisions to reorder</p>}
          </div>
        )}

        {loading ? <div className="loading-state"><div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }}></div></div> : sportTypes.length === 0 ? (
          <div className="empty-state"><p>Start by adding your sports and a season.</p><div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '0.5rem' }}><button className="btn-primary" onClick={() => setShowAddSport(true)}>+ Add sport</button><button className="btn-secondary" onClick={() => setShowAddSeason(true)}>+ Add season</button></div></div>
        ) : seasons.length === 0 ? (
          <div className="empty-state"><p>Add a season to get started.</p><button className="btn-primary" onClick={() => setShowAddSeason(true)}>+ Add season</button></div>
        ) : (
          <div className="sports-container">
            {sportTypes.map(sport => {
              const sportDivisions = filteredDivisions.filter(d => d.sport_type_id === sport.id)
              return (
                <div key={sport.id} className={`sport-section ${dragOverSport === sport.id ? 'sport-drag-over' : ''} ${dragSport?.id === sport.id ? 'sport-dragging' : ''}`}
                  onDragOver={e => { if (dragSport) { e.preventDefault(); setDragOverSport(sport.id) } }}
                  onDragLeave={() => { if (dragSport) setDragOverSport(null) }}
                  onDrop={e => { if (dragSport) { e.preventDefault(); handleSportDrop(sport.id) } }}>
                  <div className="sport-header" draggable onDragStart={e => { setDragSport(sport); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { setDragSport(null); setDragOverSport(null) }}>
                    <div className="sport-header-left">
                      <span className="sport-drag-handle">⠿</span>
                      <h2 className="sport-title">{sport.name.toUpperCase()}</h2>
                      <span className="sport-count">{sportDivisions.length} div · {filteredTeams.filter(t => { const d = divisions.find(dd => dd.id === t.division_id); return d && d.sport_type_id === sport.id }).length} teams</span>
                    </div>
                    {canEdit && <div className="sport-header-actions"><button className="btn-icon-sm btn-icon-danger" onClick={e => { e.stopPropagation(); deleteSport(sport.id, sport.name) }}>✕</button></div>}
                  </div>
                  {sportDivisions.length === 0 ? <div className="empty-sport"><p className="text-muted">No divisions yet</p></div> : (
                    <div className="divisions-list">
                      {sportDivisions.map(div => (
                        <div key={div.id} className={`division-card ${dragOverDivision === div.id ? 'division-drag-over' : ''} ${dragDivision?.id === div.id ? 'division-dragging' : ''}`}
                          onDragOver={e => { if (dragDivision) { e.preventDefault(); e.stopPropagation(); setDragOverDivision(div.id) } }}
                          onDragLeave={() => { if (dragDivision) setDragOverDivision(null) }}
                          onDrop={e => { if (dragDivision) { e.preventDefault(); e.stopPropagation(); handleDivisionDrop(div.id, sport.id) } }}>
                          <div className="division-header">
                            <div className="division-header-left" draggable onDragStart={e => { e.stopPropagation(); setDragDivision(div); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { setDragDivision(null); setDragOverDivision(null) }}>
                              <span className="division-drag-handle">⠿</span>
                              <div><h3>{div.name}</h3><span className="division-meta">{div.seasons?.name}{div.age_range ? ` · Ages ${div.age_range}` : ''}</span></div>
                            </div>
                            {canEdit && <div className="division-actions">
                              <button className="btn-small" onClick={(e) => { e.stopPropagation(); setBulkAssignDivision(div) }} title="Assign gear to all teams">🎒</button>
                              <button className="btn-quick-add" onClick={() => { setQuickAddDivisionId(quickAddDivisionId === div.id ? null : div.id); setQuickAddName('') }}>+</button>
                              <button className="btn-icon-sm" onClick={() => setEditingDivision(div)}>✎</button>
                              <button className="btn-icon-sm btn-icon-danger" onClick={() => deleteDivision(div.id, div.name)}>✕</button>
                            </div>}
                          </div>
                          <div className="team-list">
                            {filteredTeams.filter(t => t.division_id === div.id).map(team => {
                              const bag = getTeamBag(team.id)
                              const sc = bag ? statusConfig[bag.status] : null
                              const packed = bag?.team_bag_items?.filter(i => i.is_packed).length || 0
                              const total = bag?.team_bag_items?.length || 0
                              return (
                                <div key={team.id} className="team-row">
                                  <span className="team-color-dot" style={{ backgroundColor: team.color || '#6b7280' }}></span>
                                  <span className="team-name-text">{team.name}</span>
                                  {(() => { const coach = team.head_coach_id ? members.find(m => m.profile_id === team.head_coach_id) : null; return coach ? <span className="text-muted" style={{ fontSize: '0.75rem', marginLeft: '0.25rem' }}>({coach.profiles?.full_name})</span> : null })()}
                                  <div className="team-gear-status">
                                    {!bag ? (
                                      canEdit ? <button className="btn-assign" onClick={() => setShowAssignGear(team)}>Assign gear</button> : <span className="text-muted" style={{ fontSize: '0.75rem' }}>No gear</span>
                                    ) : (
                                      <button className="btn-gear-status" style={{ backgroundColor: sc.bg, color: sc.color }} onClick={() => setGearTeam(team)}>
                                        {sc.label}{bag.status === 'building' && ` ${packed}/${total}`}
                                      </button>
                                    )}
                                  </div>
                                  {canEdit && <div className="team-row-actions">
                                    <button className="btn-icon-sm" onClick={() => duplicateTeam(team)} title="Duplicate">⧉</button>
                                    <button className="btn-icon-sm" onClick={() => setEditingTeam(team)}>✎</button>
                                    <button className="btn-icon-sm btn-icon-danger" onClick={() => deleteTeam(team.id, team.name)}>✕</button>
                                  </div>}
                                </div>
                              )
                            })}
                            {quickAddDivisionId === div.id && (
                              <div className="quick-add-row">
                                <input type="text" className="quick-add-input" placeholder="Team name..." value={quickAddName} onChange={e => setQuickAddName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') quickAddTeam(div.id); if (e.key === 'Escape') { setQuickAddDivisionId(null); setQuickAddName('') } }} autoFocus disabled={quickAddSubmitting} />
                                <button className="btn-small" onClick={() => quickAddTeam(div.id)} disabled={quickAddSubmitting || !quickAddName.trim()}>Add</button>
                                <button className="btn-icon-sm" onClick={() => { setQuickAddDivisionId(null); setQuickAddName('') }}>✕</button>
                              </div>
                            )}
                            {filteredTeams.filter(t => t.division_id === div.id).length === 0 && quickAddDivisionId !== div.id && (
                              <p className="text-muted" style={{ padding: '0.5rem 0 0.5rem 1.75rem', fontStyle: 'italic' }}>No teams yet</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {showAddSport && <AddSportModal orgId={currentOrg.id} onDone={() => { setShowAddSport(false); fetchAll() }} onClose={() => setShowAddSport(false)} />}
        {showAddSeason && <AddSeasonModal orgId={currentOrg.id} onDone={() => { setShowAddSeason(false); fetchAll() }} onClose={() => setShowAddSeason(false)} />}
        {showAddDivision && <AddDivisionModal orgId={currentOrg.id} seasons={seasons} sportTypes={sportTypes} onDone={() => { setShowAddDivision(false); fetchAll(); addToast('Division added') }} onClose={() => setShowAddDivision(false)} />}
        {showAddTeam && <AddTeamModal orgId={currentOrg.id} divisions={filteredDivisions.length > 0 ? filteredDivisions : divisions} sportTypes={sportTypes} members={members} onDone={() => { setShowAddTeam(false); fetchAll(); addToast('Team added') }} onClose={() => setShowAddTeam(false)} />}
        {editingTeam && <EditTeamModal team={editingTeam} divisions={divisions} members={members} onDone={() => { setEditingTeam(null); fetchAll() }} onClose={() => setEditingTeam(null)} />}
        {editingDivision && <EditDivisionModal division={editingDivision} seasons={seasons} sportTypes={sportTypes} onDone={() => { setEditingDivision(null); fetchAll() }} onClose={() => setEditingDivision(null)} />}
        {showAssignGear && <AssignGearModal team={showAssignGear} templates={templates} onAssign={createBagFromTemplate} onClose={() => setShowAssignGear(null)} />}
        {gearTeam && <GearDetailModal team={gearTeam} bag={getTeamBag(gearTeam.id)} statusConfig={statusConfig} onToggle={togglePacked} onMarkBuilt={markBuilt} onPickup={markPickedUp} onReturn={markReturned} onReplace={replaceItem} onRemove={removeBagItem} onDelete={deleteBag} onPrint={printChecklist} onClose={() => { setGearTeam(null); fetchAll() }} />}
        {bulkAssignDivision && (
          <BulkAssignModal
            division={bulkAssignDivision}
            teams={filteredTeams}
            templates={templates}
            existingBags={bags}
            filterSeason={filterSeason}
            onAssign={createBagFromTemplate}
            onClose={() => { setBulkAssignDivision(null); fetchAll() }}
          />
        )}
      </main>
      <style>{teamStyles}</style>
    </div>
  )
}

function AssignGearModal({ team, templates, onAssign, onClose }) {
  const { currentOrg } = useOrg()
  const [templateId, setTemplateId] = useState('')
  const [bagTag, setBagTag] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showCreateTemplate, setShowCreateTemplate] = useState(false)
  const [localTemplates, setLocalTemplates] = useState(templates)
  const [categories, setCategories] = useState([])
  const [sportTypes, setSportTypes] = useState([])
  const [tName, setTName] = useState('')
  const [tSport, setTSport] = useState('')
  const [tItems, setTItems] = useState([])
  const [tSubmitting, setTSubmitting] = useState(false)
  const [tError, setTError] = useState('')

  useEffect(() => {
    if (currentOrg) {
      supabase.from('equipment_items').select('*, equipment_categories(name)').eq('organization_id', currentOrg.id).order('name').then(({ data }) => setCategories(data || []))
      supabase.from('sport_types').select('*').eq('organization_id', currentOrg.id).then(({ data }) => setSportTypes(data || []))
    }
  }, [])

  function addTItem() { setTItems([...tItems, { category_id: '', quantity: 1, is_required: true }]) }
  function updateTItem(idx, field, value) { const u = [...tItems]; u[idx] = { ...u[idx], [field]: value }; setTItems(u) }
  function removeTItem(idx) { setTItems(tItems.filter((_, i) => i !== idx)) }

  async function createTemplate(e) {
    e.preventDefault()
    if (!tName.trim()) { setTError('Enter a template name'); return }
    if (tItems.length === 0) { setTError('Add at least one item'); return }
    if (tItems.some(i => !i.category_id)) { setTError('Select a category for all items'); return }
    setTSubmitting(true); setTError('')
    const { data, error } = await supabase.from('kit_templates').insert({
      organization_id: currentOrg.id, name: tName, sport_type_id: tSport || null
    }).select('*, kit_template_items(*, equipment_categories(name))').single()
    if (error) { setTError(error.message); setTSubmitting(false); return }
    await supabase.from('kit_template_items').insert(tItems.map(i => ({
      kit_template_id: data.id, equipment_item_id: i.category_id,
      quantity: parseInt(i.quantity) || 1, is_required: i.is_required
    })))
    const { data: refreshed } = await supabase.from('kit_templates').select('*, kit_template_items(*, equipment_categories(name), equipment_items(name))').eq('id', data.id).single()
    setLocalTemplates([...localTemplates, refreshed])
    setTemplateId(data.id)
    setShowCreateTemplate(false)
    setTSubmitting(false)
  }

  async function handleSubmit(e) {
    e.preventDefault(); if (!templateId) return; setSubmitting(true)
    await onAssign(team.id, templateId, bagTag); setSubmitting(false)
  }

  if (showCreateTemplate) {
    return (
      <div className="modal-overlay" onClick={onClose}><div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Create kit template</h2><button className="btn-icon" onClick={() => setShowCreateTemplate(false)}>✕</button></div>
        <form onSubmit={createTemplate} className="modal-form">
          <div className="form-row">
            <div className="form-group"><label>Template name *</label><input type="text" value={tName} onChange={e => setTName(e.target.value)} placeholder="Standard Baseball Bag" required autoFocus /></div>
            <div className="form-group"><label>Sport</label><select value={tSport} onChange={e => setTSport(e.target.value)}><option value="">All sports</option>{sportTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <div style={{ border: '1px solid var(--gray-200)', borderRadius: 'var(--radius)', padding: '1rem', background: 'var(--gray-50)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Bag contents</h3>
              <button type="button" className="btn-small" onClick={addTItem}>+ Add item</button>
            </div>
            {tItems.length === 0 ? <p className="text-muted" style={{ textAlign: 'center', padding: '0.5rem' }}>Click "+ Add item" to build the checklist</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {tItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select value={item.category_id} onChange={e => updateTItem(idx, 'category_id', e.target.value)} style={{ flex: 2, padding: '0.4rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }} required>
                      <option value="">Select item...</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}{c.equipment_categories?.name ? ` (${c.equipment_categories.name})` : ''}</option>)}
                    </select>
                    <select value={item.is_required ? 'required' : 'optional'} onChange={e => updateTItem(idx, 'is_required', e.target.value === 'required')} style={{ width: '100px', padding: '0.4rem', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                      <option value="required">Required</option>
                      <option value="optional">Optional</option>
                    </select>
                    <button type="button" className="btn-icon-sm btn-icon-danger" onClick={() => removeTItem(idx)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {tError && <div className="form-error">{tError}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowCreateTemplate(false)}>← Back</button>
            <button type="submit" className="btn-primary" disabled={tSubmitting}>{tSubmitting ? 'Creating...' : 'Create template'}</button>
          </div>
        </form>
      </div></div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-header"><h2>Assign gear to {team.name}</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
      <form onSubmit={handleSubmit} className="modal-form">
        <div className="form-group"><label>Kit template *</label>
          <select value={templateId} onChange={e => { if (e.target.value === '__new__') { setShowCreateTemplate(true); return }; setTemplateId(e.target.value) }}>
            <option value="">Select a template...</option>
            {localTemplates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.kit_template_items?.length || 0} items)</option>)}
            <option value="__new__">＋ Create new template...</option>
          </select>
        </div>
        {templateId && (
          <div className="template-preview">
            <h4>Template contents:</h4>
            {localTemplates.find(t => t.id === templateId)?.kit_template_items?.map((item, i) => (
              <div key={i} className="template-preview-item">
                <span>{item.equipment_items?.name || item.equipment_categories?.name || 'Unknown'}</span>
                <span className={`pill-tag ${item.is_required ? 'required' : 'optional'}`}>{item.is_required ? 'Required' : 'Optional'}</span>
              </div>
            ))}
          </div>
        )}
        <div className="form-group"><label>Bag tag # (optional)</label><input type="text" value={bagTag} onChange={e => setBagTag(e.target.value)} placeholder="Tag number for this bag" /></div>
        <div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={submitting || !templateId}>{submitting ? 'Assigning...' : 'Assign gear'}</button></div>
      </form>
    </div></div>
  )
}

function GearDetailModal({ team, bag, statusConfig, onToggle, onMarkBuilt, onPickup, onReturn, onReplace, onRemove, onDelete, onPrint, onClose }) {
  const [showPickup, setShowPickup] = useState(false)
  const [showReturn, setShowReturn] = useState(false)
  const [showReplace, setShowReplace] = useState(null)
  const [showAddItem, setShowAddItem] = useState(false)

  if (!bag) { onClose(); return null }

  const sc = statusConfig[bag.status]
  const items = bag.team_bag_items || []
  const required = items.filter(i => i.is_required)
  const optional = items.filter(i => !i.is_required)
  const allReqPacked = required.every(i => i.is_packed)
  const packed = items.filter(i => i.is_packed).length

  return (
    <div className="modal-overlay" onClick={onClose}><div className="modal modal-wide" onClick={e => e.stopPropagation()}>
      <div className="modal-header">
        <div>
          <h2>{team.name} — Gear</h2>
          <span className="text-muted">{bag.kit_templates?.name}{bag.bag_tag ? ` · Tag: ${bag.bag_tag}` : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="badge" style={{ backgroundColor: sc.bg, color: sc.color }}>{sc.label}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="modal-form">
        {bag.status === 'building' && allReqPacked && (
          <div className="gear-action-bar gear-action-success">All required items packed! <button className="btn-small" onClick={() => onMarkBuilt(bag.id)}>Mark as built</button></div>
        )}
        {bag.status === 'building' && !allReqPacked && (
          <div className="gear-action-bar">{packed}/{items.length} items packed · {required.filter(i => !i.is_packed).length} required items remaining</div>
        )}
        {bag.status === 'built' && (
          <div className="gear-action-bar gear-action-info">Bag is ready for pickup <button className="btn-small" onClick={() => setShowPickup(true)}>Record pickup</button></div>
        )}
        {bag.status === 'picked_up' && (
          <div className="gear-action-bar">Picked up by <strong>{bag.picked_up_by_name}</strong> on {new Date(bag.picked_up_at).toLocaleDateString()} <button className="btn-small" onClick={() => setShowReturn(true)}>Record return</button></div>
        )}
        {bag.status === 'returned' && (
          <div className="gear-action-bar gear-action-success">Returned {new Date(bag.returned_at).toLocaleDateString()}{bag.returned_condition ? ` · ${bag.returned_condition}` : ''}</div>
        )}
        {bag.built_by && <p className="text-muted" style={{ fontSize: '0.8rem' }}>Built by {bag.profiles?.full_name}{bag.built_at ? ` on ${new Date(bag.built_at).toLocaleDateString()}` : ''}</p>}

        {required.length > 0 && (
          <div className="checklist-section">
            <h4 className="checklist-heading">Required ({required.filter(i => i.is_packed).length}/{required.length})</h4>
            {required.map(item => <ChecklistRow key={item.id} item={item} onToggle={onToggle} onReplace={() => setShowReplace(item)} onRemove={() => onRemove(item.id)} disabled={bag.status === 'returned'} canRemove={['building','built'].includes(bag.status)} />)}
          </div>
        )}
        {optional.length > 0 && (
          <div className="checklist-section">
            <h4 className="checklist-heading">Optional ({optional.filter(i => i.is_packed).length}/{optional.length})</h4>
            {optional.map(item => <ChecklistRow key={item.id} item={item} onToggle={onToggle} onReplace={() => setShowReplace(item)} onRemove={() => onRemove(item.id)} disabled={bag.status === 'returned'} canRemove={['building','built'].includes(bag.status)} />)}
          </div>
        )}

        <div className="gear-footer">
          <button className="btn-secondary" onClick={() => onPrint(team, bag)}>Print checklist</button>
          {['building','built'].includes(bag.status) && <button className="btn-secondary" onClick={() => setShowAddItem(true)}>+ Add item</button>}
          <button className="btn-secondary btn-danger-text" onClick={() => onDelete(bag.id)}>Delete bag assignment</button>
        </div>
      </div>

      {showPickup && <PickupModal onConfirm={name => { onPickup(bag.id, name); setShowPickup(false) }} onClose={() => setShowPickup(false)} />}
      {showReturn && <ReturnModal onConfirm={cond => { onReturn(bag.id, cond); setShowReturn(false) }} onClose={() => setShowReturn(false)} />}
      {showReplace && <ReplaceModal item={showReplace} onConfirm={(reason, desc) => { onReplace(showReplace.id, reason, desc); setShowReplace(null) }} onClose={() => setShowReplace(null)} />}
      {showAddItem && (
        <AddBagItemModal
          bagId={bag.id}
          existingItemIds={(bag.team_bag_items || []).map(i => i.equipment_item_id).filter(Boolean)}
          orgId={bag.organization_id}
          onClose={() => { setShowAddItem(false); onClose() }}
        />
      )}
    </div></div>
  )
}

function ChecklistRow({ item, onToggle, onReplace, onRemove, disabled, canRemove }) {
  const replacements = item.bag_item_replacements || []
  return (
    <div className={`checklist-row ${item.is_packed ? 'packed' : ''}`}>
      <label className="checklist-label" onClick={e => { if (!disabled) { e.preventDefault(); onToggle(item.id, item.is_packed) } }}>
        <span className={`checklist-box ${item.is_packed ? 'checked' : ''}`}>{item.is_packed ? '✓' : ''}</span>
        <span className={item.is_packed ? 'line-through' : ''}>{item.equipment_items?.name || item.equipment_categories?.name || 'Unknown'}</span>
      </label>
      {!disabled && <button className="btn-replace" onClick={onReplace}>Replace</button>}
      {canRemove && <button className="btn-replace" onClick={onRemove} style={{ color: 'var(--red-500)' }}>Remove</button>}
      {replacements.length > 0 && (
        <div className="replacements">
          {replacements.map(r => (
            <div key={r.id} className="replacement-entry">
              <span className="replacement-reason">{r.reason.replace('_', ' ')}</span>
              {r.description && <span> — {r.description}</span>}
              <span className="text-muted"> · {new Date(r.replaced_at).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddBagItemModal({ bagId, existingItemIds, orgId, onClose }) {
  const [equipment, setEquipment] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [isRequired, setIsRequired] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const { addToast } = useToast()

  useEffect(() => {
    supabase.from('equipment_items').select('*, equipment_categories(name)')
      .eq('organization_id', orgId).order('name')
      .then(({ data }) => setEquipment((data || []).filter(e => !existingItemIds.includes(e.id))))
  }, [])

  async function handleAdd(e) {
    e.preventDefault()
    if (!selectedId) return
    setSubmitting(true)
    const { error } = await supabase.from('team_bag_items').insert({
      team_bag_id: bagId,
      equipment_item_id: selectedId,
      is_required: isRequired,
      is_packed: false
    })
    if (error) addToast('Failed to add item', 'error')
    else addToast('Item added to bag')
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Add item to bag</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
        <form onSubmit={handleAdd} className="modal-form">
          <div className="form-group">
            <label>Equipment item *</label>
            <select value={selectedId} onChange={e => setSelectedId(e.target.value)} required>
              <option value="">Select item...</option>
              {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}{eq.equipment_categories?.name ? ' (' + eq.equipment_categories.name + ')' : ''}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select value={isRequired ? 'required' : 'optional'} onChange={e => setIsRequired(e.target.value === 'required')}>
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting || !selectedId}>{submitting ? 'Adding...' : 'Add to bag'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PickupModal({ onConfirm, onClose }) {
  const [name, setName] = useState('')
  return (<div className="modal-overlay" style={{ zIndex: 200 }} onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Record pickup</h2><button className="btn-icon" onClick={onClose}>✕</button></div><div className="modal-form"><div className="form-group"><label>Picked up by *</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Coach or parent name" autoFocus /></div><div className="modal-actions"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => { if (name.trim()) onConfirm(name.trim()) }} disabled={!name.trim()}>Confirm</button></div></div></div></div>)
}

function ReturnModal({ onConfirm, onClose }) {
  const [cond, setCond] = useState('')
  return (<div className="modal-overlay" style={{ zIndex: 200 }} onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Record return</h2><button className="btn-icon" onClick={onClose}>✕</button></div><div className="modal-form"><div className="form-group"><label>Condition</label><select value={cond} onChange={e => setCond(e.target.value)}><option value="">Select...</option><option value="Good - all items present">Good - all items</option><option value="Missing items">Missing items</option><option value="Damaged items">Damaged items</option><option value="Needs cleaning">Needs cleaning</option></select></div><div className="modal-actions"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onConfirm(cond)}>Confirm return</button></div></div></div></div>)
}

function ReplaceModal({ item, onConfirm, onClose }) {
  const [reason, setReason] = useState('broken'); const [desc, setDesc] = useState('')
  return (<div className="modal-overlay" style={{ zIndex: 200 }} onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Replace: {item.equipment_items?.name || item.equipment_categories?.name}</h2><button className="btn-icon" onClick={onClose}>✕</button></div><div className="modal-form"><div className="form-group"><label>Reason *</label><select value={reason} onChange={e => setReason(e.target.value)}><option value="broken">Broken</option><option value="lost">Lost</option><option value="damaged">Damaged</option><option value="missing">Missing</option><option value="worn_out">Worn out</option><option value="wrong_size">Wrong size</option><option value="other">Other</option></select></div><div className="form-group"><label>Details</label><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="What happened?" /></div><div className="modal-actions"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onConfirm(reason, desc)}>Log replacement</button></div></div></div></div>)
}

function AddSportModal({ orgId, onDone, onClose }) {
  const [name, setName] = useState(''); const [sub, setSub] = useState(false); const [err, setErr] = useState('')
  async function go(e) { e.preventDefault(); setSub(true); const { error } = await supabase.from('sport_types').insert({ organization_id: orgId, name, sort_order: 0 }); if (error) setErr(error.message.includes('duplicate') ? 'Already exists.' : error.message); else onDone(); setSub(false) }
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Add sport</h2><button className="btn-icon" onClick={onClose}>✕</button></div><form onSubmit={go} className="modal-form"><div className="form-group"><label>Sport name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus /></div>{err && <div className="form-error">{err}</div>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={sub}>{sub ? 'Adding...' : 'Add sport'}</button></div></form></div></div>)
}

function AddSeasonModal({ orgId, onDone, onClose }) {
  const [name, setName] = useState(''); const [sd, setSd] = useState(''); const [ed, setEd] = useState(''); const [ia, setIa] = useState(false); const [sub, setSub] = useState(false); const [err, setErr] = useState('')
  async function go(e) { e.preventDefault(); setSub(true); const { error } = await supabase.from('seasons').insert({ organization_id: orgId, name, start_date: sd||null, end_date: ed||null, is_active: ia }); if (error) setErr(error.message.includes('duplicate') ? 'Already exists.' : error.message); else onDone(); setSub(false) }
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Add season</h2><button className="btn-icon" onClick={onClose}>✕</button></div><form onSubmit={go} className="modal-form"><div className="form-group"><label>Season name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus /></div><div className="form-row"><div className="form-group"><label>Start</label><input type="date" value={sd} onChange={e => setSd(e.target.value)} /></div><div className="form-group"><label>End</label><input type="date" value={ed} onChange={e => setEd(e.target.value)} /></div></div><label className="toggle-label"><input type="checkbox" checked={ia} onChange={e => setIa(e.target.checked)} /> Active season</label>{err && <div className="form-error">{err}</div>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={sub}>{sub ? 'Adding...' : 'Add season'}</button></div></form></div></div>)
}

function AddDivisionModal({ orgId, seasons, sportTypes, onDone, onClose }) {
  const [name, setName] = useState(''); const [sid, setSid] = useState(seasons.find(s => s.is_active)?.id||seasons[0]?.id||''); const [spid, setSpid] = useState(sportTypes[0]?.id||''); const [ar, setAr] = useState(''); const [sub, setSub] = useState(false); const [err, setErr] = useState('')
  async function go(e) { e.preventDefault(); setSub(true); const { error } = await supabase.from('divisions').insert({ organization_id: orgId, name, season_id: sid, sport_type_id: spid, age_range: ar||null }); if (error) setErr(error.message); else onDone(); setSub(false) }
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Add division</h2><button className="btn-icon" onClick={onClose}>✕</button></div><form onSubmit={go} className="modal-form"><div className="form-group"><label>Name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} required /></div><div className="form-row"><div className="form-group"><label>Sport *</label><select value={spid} onChange={e => setSpid(e.target.value)} required>{sportTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="form-group"><label>Season *</label><select value={sid} onChange={e => setSid(e.target.value)} required>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div><div className="form-group"><label>Age range</label><input type="text" value={ar} onChange={e => setAr(e.target.value)} placeholder="9-10, 11-12" /></div>{err && <div className="form-error">{err}</div>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={sub}>{sub ? 'Adding...' : 'Add'}</button></div></form></div></div>)
}

function AddTeamModal({ orgId, divisions, sportTypes, members, onDone, onClose }) {
  const [name, setName] = useState(''); const [did, setDid] = useState(divisions[0]?.id||''); const [color, setColor] = useState('#1a472a'); const [coachId, setCoachId] = useState(''); const [sub, setSub] = useState(false); const [err, setErr] = useState('')
  const grouped = sportTypes.map(s => ({ sport: s, divs: divisions.filter(d => d.sport_type_id === s.id) })).filter(g => g.divs.length > 0)
  async function go(e) { e.preventDefault(); setSub(true); const { error } = await supabase.from('teams').insert({ organization_id: orgId, name, division_id: did, color, head_coach_id: coachId || null }); if (error) setErr(error.message); else onDone(); setSub(false) }
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Add team</h2><button className="btn-icon" onClick={onClose}>✕</button></div><form onSubmit={go} className="modal-form"><div className="form-group"><label>Name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} required /></div><div className="form-row"><div className="form-group"><label>Division *</label><select value={did} onChange={e => setDid(e.target.value)} required>{grouped.map(g => <optgroup key={g.sport.id} label={g.sport.name}>{g.divs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>)}</select></div><div className="form-group"><label>Color</label><input type="color" value={color} onChange={e => setColor(e.target.value)} /></div></div><div className="form-group"><label>Head coach</label><select value={coachId} onChange={e => setCoachId(e.target.value)}><option value="">No coach assigned</option>{members.filter(m => ['admin','equipment_manager','coach'].includes(m.role)).map(m => <option key={m.profile_id} value={m.profile_id}>{m.profiles?.full_name || m.profiles?.email || 'Unknown'}</option>)}</select></div>{err && <div className="form-error">{err}</div>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={sub}>{sub ? 'Adding...' : 'Add'}</button></div></form></div></div>)
}

function EditTeamModal({ team, divisions, members, onDone, onClose }) {
  const [name, setName] = useState(team.name); const [did, setDid] = useState(team.division_id); const [color, setColor] = useState(team.color||'#1a472a'); const [coachId, setCoachId] = useState(team.head_coach_id||''); const [sub, setSub] = useState(false); const [err, setErr] = useState('')
  async function go(e) { e.preventDefault(); setSub(true); const { error } = await supabase.from('teams').update({ name, division_id: did, color, head_coach_id: coachId || null }).eq('id', team.id); if (error) setErr(error.message); else onDone(); setSub(false) }
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Edit team</h2><button className="btn-icon" onClick={onClose}>✕</button></div><form onSubmit={go} className="modal-form"><div className="form-group"><label>Name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} required /></div><div className="form-row"><div className="form-group"><label>Division *</label><select value={did} onChange={e => setDid(e.target.value)} required>{divisions.map(d => <option key={d.id} value={d.id}>{d.name} ({d.sport_types?.name})</option>)}</select></div><div className="form-group"><label>Color</label><input type="color" value={color} onChange={e => setColor(e.target.value)} /></div></div><div className="form-group"><label>Head coach</label><select value={coachId} onChange={e => setCoachId(e.target.value)}><option value="">No coach assigned</option>{members.filter(m => ['admin','equipment_manager','coach'].includes(m.role)).map(m => <option key={m.profile_id} value={m.profile_id}>{m.profiles?.full_name || m.profiles?.email || 'Unknown'}</option>)}</select></div>{err && <div className="form-error">{err}</div>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={sub}>{sub ? 'Saving...' : 'Save'}</button></div></form></div></div>)
}

function EditDivisionModal({ division, seasons, sportTypes, onDone, onClose }) {
  const [name, setName] = useState(division.name); const [sid, setSid] = useState(division.season_id); const [spid, setSpid] = useState(division.sport_type_id); const [ar, setAr] = useState(division.age_range||''); const [sub, setSub] = useState(false); const [err, setErr] = useState('')
  async function go(e) { e.preventDefault(); setSub(true); const { error } = await supabase.from('divisions').update({ name, season_id: sid, sport_type_id: spid, age_range: ar||null }).eq('id', division.id); if (error) setErr(error.message); else onDone(); setSub(false) }
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Edit division</h2><button className="btn-icon" onClick={onClose}>✕</button></div><form onSubmit={go} className="modal-form"><div className="form-group"><label>Name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} required /></div><div className="form-row"><div className="form-group"><label>Sport *</label><select value={spid} onChange={e => setSpid(e.target.value)} required>{sportTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="form-group"><label>Season *</label><select value={sid} onChange={e => setSid(e.target.value)} required>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div><div className="form-group"><label>Age range</label><input type="text" value={ar} onChange={e => setAr(e.target.value)} /></div>{err && <div className="form-error">{err}</div>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={sub}>{sub ? 'Saving...' : 'Save'}</button></div></form></div></div>)
}

function printChecklist(team, bag) {
  const items = bag.team_bag_items || []
  const required = items.filter(i => i.is_required)
  const optional = items.filter(i => !i.is_required)

  const html = `
    <html>
    <head>
      <title>${team.name} - Gear Checklist</title>
      <style>
        body { font-family: 'DM Sans', Arial, sans-serif; padding: 2rem; max-width: 600px; margin: 0 auto; }
        h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
        h2 { font-size: 0.9rem; color: #666; margin-top: 1.5rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .meta { color: #888; font-size: 0.85rem; margin-bottom: 1.5rem; }
        .item { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0; border-bottom: 1px solid #eee; }
        .box { width: 18px; height: 18px; border: 2px solid #333; border-radius: 3px; flex-shrink: 0; }
        .packed .box { background: #1a472a; }
        .label { font-size: 0.9rem; }
        @media print { body { padding: 1rem; } }
      </style>
    </head>
    <body>
      <h1>${team.name}</h1>
      <div class="meta">
        ${bag.kit_templates?.name || 'Gear bag'}${bag.bag_tag ? ' · Tag: ' + bag.bag_tag : ''}<br>
        Printed ${new Date().toLocaleDateString()}
      </div>
      ${required.length > 0 ? '<h2>Required</h2>' + required.map(i =>
        '<div class="item' + (i.is_packed ? ' packed' : '') + '"><div class="box"></div><span class="label">' + (i.equipment_items?.name || i.equipment_categories?.name || 'Unknown') + '</span></div>'
      ).join('') : ''}
      ${optional.length > 0 ? '<h2>Optional</h2>' + optional.map(i =>
        '<div class="item' + (i.is_packed ? ' packed' : '') + '"><div class="box"></div><span class="label">' + (i.equipment_items?.name || i.equipment_categories?.name || 'Unknown') + '</span></div>'
      ).join('') : ''}
    </body>
    </html>
  `
  const printWindow = window.open('', '_blank')
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.print()
}

function BulkAssignModal({ division, teams, templates, existingBags, filterSeason, onAssign, onClose }) {
  const [templateId, setTemplateId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState(null)

  const divTeams = teams.filter(t => t.division_id === division.id)
  const teamsWithoutBags = divTeams.filter(t => !existingBags.find(b => b.team_id === t.id && b.season_id === filterSeason))
  const teamsWithBags = divTeams.filter(t => existingBags.find(b => b.team_id === t.id && b.season_id === filterSeason))

  async function handleBulkAssign(e) {
    e.preventDefault()
    if (!templateId || teamsWithoutBags.length === 0) return
    setSubmitting(true)
    let success = 0
    let failed = 0
    for (const team of teamsWithoutBags) {
      try {
        await onAssign(team.id, templateId, null)
        success++
      } catch { failed++ }
    }
    setResults({ success, failed, total: teamsWithoutBags.length })
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Assign gear to {division.name}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form">
          {results ? (
            <div>
              <p style={{ textAlign: 'center', fontSize: '1.1rem', fontWeight: 600, color: 'var(--green-700)', marginBottom: '1rem' }}>
                ✓ Assigned gear to {results.success} of {results.total} teams
              </p>
              {results.failed > 0 && <p className="form-error">{results.failed} team(s) failed</p>}
              <div className="modal-actions"><button className="btn-primary" onClick={onClose}>Done</button></div>
            </div>
          ) : (
            <form onSubmit={handleBulkAssign}>
              <p className="text-muted" style={{ marginBottom: '1rem' }}>
                {teamsWithoutBags.length} of {divTeams.length} teams need gear assigned.
                {teamsWithBags.length > 0 && ` ${teamsWithBags.length} already have bags and will be skipped.`}
              </p>
              {teamsWithoutBags.length === 0 ? (
                <p style={{ textAlign: 'center', fontWeight: 500 }}>All teams already have gear assigned!</p>
              ) : (
                <div className="form-group">
                  <label>Kit template *</label>
                  <select value={templateId} onChange={e => setTemplateId(e.target.value)} required>
                    <option value="">Select a template...</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.kit_template_items?.length || 0} items)</option>)}
                  </select>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                {teamsWithoutBags.length > 0 && (
                  <button type="submit" className="btn-primary" disabled={submitting || !templateId}>
                    {submitting ? `Assigning (${teamsWithoutBags.length} teams)...` : `Assign to ${teamsWithoutBags.length} teams`}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

const teamStyles = `
  .sports-container{display:flex;flex-direction:column;gap:2rem}
  .sport-section{background:white;border-radius:var(--radius-lg);border:1px solid var(--gray-200);overflow:hidden;transition:box-shadow .15s}
  .sport-drag-over{box-shadow:0 0 0 2px var(--gold-500)!important}
  .sport-dragging{opacity:.4}
  .sport-header{display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;background:var(--green-900);color:white;cursor:grab;user-select:none}
  .sport-header:active{cursor:grabbing}
  .sport-header-left{display:flex;align-items:center;gap:.5rem}
  .sport-drag-handle{color:rgba(255,255,255,.3);font-size:1.1rem;line-height:1}
  .sport-title{font-size:1.1rem;font-weight:700;letter-spacing:.08em}
  .sport-count{font-size:.75rem;opacity:.5}
  .sport-header-actions{opacity:0;transition:opacity .15s}
  .sport-header:hover .sport-header-actions{opacity:1}
  .sport-header-actions .btn-icon-sm{color:rgba(255,255,255,.5)}
  .sport-header-actions .btn-icon-sm:hover{color:white!important;background:rgba(255,255,255,.15)!important}
  .empty-sport{padding:1.5rem;text-align:center}
  .divisions-list{display:flex;flex-direction:column}
  .division-card{padding:1rem 1.25rem;border-bottom:1px solid var(--gray-100);transition:background .1s}
  .division-card:last-child{border-bottom:none}
  .division-drag-over{background:var(--green-50)!important;box-shadow:inset 0 2px 0 var(--green-500),inset 0 -2px 0 var(--green-500)}
  .division-dragging{opacity:.4}
  .division-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem}
  .division-header-left{display:flex;align-items:flex-start;gap:.5rem;cursor:grab}
  .division-header-left:active{cursor:grabbing}
  .division-drag-handle{color:var(--gray-300);font-size:1.1rem;user-select:none;line-height:1.4}
  .division-header h3{font-size:1rem;font-weight:600;color:var(--green-800)}
  .division-meta{font-size:.8rem;color:var(--gray-500)}
  .division-actions{display:flex;gap:.25rem;align-items:center;opacity:0;transition:opacity .15s}
  .division-card:hover .division-actions{opacity:1}
  .btn-quick-add{background:var(--green-700);color:white;border:none;width:22px;height:22px;border-radius:50%;font-size:1rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;font-weight:600}
  .btn-quick-add:hover{background:var(--green-600)}
  .team-list{padding-left:.25rem}
  .team-row{display:flex;align-items:center;gap:.5rem;padding:.5rem .25rem .5rem 1.75rem;font-size:.9rem;border-radius:6px;transition:background .1s}
  .team-row:hover{background:var(--gray-50)}
  .team-name-text{flex:1}
  .team-color-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .team-gear-status{margin-right:.25rem}
  .btn-assign{background:none;border:1.5px dashed var(--gray-300);color:var(--gray-500);padding:.2rem .6rem;border-radius:var(--radius);font-size:.75rem;font-family:inherit;cursor:pointer;transition:all .15s;font-weight:500}
  .btn-assign:hover{border-color:var(--green-500);color:var(--green-700);background:var(--green-50)}
  .btn-gear-status{border:none;padding:.2rem .6rem;border-radius:20px;font-size:.72rem;font-weight:600;font-family:inherit;cursor:pointer;transition:opacity .15s}
  .btn-gear-status:hover{opacity:.8}
  .team-row-actions{display:flex;gap:.25rem;opacity:0;transition:opacity .15s}
  .team-row:hover .team-row-actions{opacity:1}
  .quick-add-row{display:flex;align-items:center;gap:.5rem;padding:.4rem .25rem .4rem 1.75rem}
  .quick-add-input{flex:1;padding:.35rem .6rem;border:1.5px solid var(--green-400);border-radius:var(--radius);font-size:.85rem;font-family:inherit;outline:none}
  .quick-add-input:focus{border-color:var(--green-500);box-shadow:0 0 0 2px rgba(58,157,94,.15)}
  .modal-wide{max-width:600px}
  .template-preview{background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius);padding:.75rem 1rem;margin-top:.25rem}
  .template-preview h4{font-size:.8rem;font-weight:600;color:var(--gray-600);margin-bottom:.5rem}
  .template-preview-item{display:flex;justify-content:space-between;padding:.25rem 0;font-size:.85rem;border-bottom:1px solid var(--gray-100)}
  .template-preview-item:last-child{border-bottom:none}
  .pill-tag{font-size:.65rem;text-transform:uppercase;letter-spacing:.04em;font-weight:600;padding:.1rem .4rem;border-radius:10px}
  .pill-tag.required{background:#d4edda;color:#16a34a}
  .pill-tag.optional{background:var(--gray-100);color:var(--gray-500)}
  .gear-action-bar{display:flex;justify-content:space-between;align-items:center;padding:.75rem 1rem;border-radius:var(--radius);background:var(--gray-50);border:1px solid var(--gray-200);font-size:.85rem;margin-bottom:.75rem}
  .gear-action-success{background:var(--green-50);border-color:var(--green-400);color:var(--green-800)}
  .gear-action-info{background:#dbeafe;border-color:#93bbfd;color:#1e40af}
  .checklist-section{margin-top:.5rem}
  .checklist-heading{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--gray-500);margin:.75rem 0 .35rem}
  .checklist-row{padding:.4rem 0;border-bottom:1px solid var(--gray-100);display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}
  .checklist-row.packed{opacity:.65}
  .checklist-label{display:flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.9rem;flex:1}
  .checklist-box{width:20px;height:20px;border:1.5px solid var(--gray-300);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:white;background:white;transition:all .15s;flex-shrink:0}
  .checklist-box.checked{background:var(--green-600);border-color:var(--green-600)}
  .line-through{text-decoration:line-through;color:var(--gray-400)}
  .btn-replace{background:none;border:1px solid var(--gray-200);color:var(--gray-500);padding:.1rem .45rem;border-radius:var(--radius);font-size:.7rem;font-family:inherit;cursor:pointer;transition:all .15s}
  .btn-replace:hover{border-color:var(--orange-500);color:var(--orange-500);background:#ffedd5}
  .replacements{width:100%;padding-left:2rem;margin-top:.2rem}
  .replacement-entry{font-size:.72rem;color:var(--gray-600);padding:.15rem 0}
  .replacement-reason{background:#ffedd5;color:#ea580c;padding:.1rem .35rem;border-radius:10px;font-weight:600;font-size:.65rem;text-transform:capitalize}
  .gear-footer{margin-top:1.5rem;padding-top:.75rem;border-top:1px solid var(--gray-100);display:flex;justify-content:flex-start}
  .btn-danger-text{color:var(--red-500)!important;border-color:var(--red-500)!important}
  .btn-danger-text:hover{background:var(--red-100)!important}
  .btn-icon-sm{background:none;border:none;color:var(--gray-400);cursor:pointer;font-size:.85rem;padding:.2rem .4rem;border-radius:4px;transition:color .15s,background .15s;line-height:1}
  .btn-icon-sm:hover{color:var(--green-700);background:var(--green-100)}
  .btn-icon-danger:hover{color:var(--red-500)!important;background:var(--red-100)!important}
`
