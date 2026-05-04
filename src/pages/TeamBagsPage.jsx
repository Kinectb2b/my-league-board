import { useState, useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useNavigate } from 'react-router-dom'
import { BAG_FILTER_OPTIONS, getBagStatusConfig } from '../lib/bagStatus'
import { friendlyError } from '../lib/errors'
import { SkeletonList } from '../components/Skeleton'

export default function TeamBagsPage() {
  const { currentOrg } = useOrg()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const [bags, setBags] = useState([])
  const [teams, setTeams] = useState([])
  const [templates, setTemplates] = useState([])
  const [seasons, setSeasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeason, setFilterSeason] = useState('')

  useEffect(() => { document.title = 'Team Bags | My League Board' }, [])
  useEffect(() => { if (currentOrg) fetchAll() }, [currentOrg])
  useEffect(() => {
    if (seasons.length > 0 && !filterSeason) {
      const active = seasons.find(s => s.is_active)
      if (active) setFilterSeason(active.id)
    }
  }, [seasons])

  async function fetchAll() {
    setLoading(true)
    const orgId = currentOrg.id
    const [b, t, tmpl, s] = await Promise.all([
      supabase.from('team_bags')
        .select('*, teams(name, divisions(name, sport_types(name))), kit_templates(name), seasons(name), profiles!built_by(full_name), team_bag_items(id, is_packed, is_required)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }),
      supabase.from('teams').select('*, divisions(name, sport_types(name))').eq('organization_id', orgId),
      supabase.from('kit_templates').select('*, kit_template_items(id)').eq('organization_id', orgId),
      supabase.from('seasons').select('*').eq('organization_id', orgId).order('created_at', { ascending: false })
    ])
    setBags(b.data || [])
    setTeams(t.data || [])
    setTemplates(tmpl.data || [])
    setSeasons(s.data || [])
    setLoading(false)
  }

  async function createBag(teamId, templateId, seasonId, bagTag) {
    const template = templates.find(t => t.id === templateId)
    if (!template) return

    // Fetch full template items for creating bag items
    const { data: tmplItems } = await supabase.from('kit_template_items')
      .select('*').eq('kit_template_id', templateId)

    const { data: bag, error } = await supabase.from('team_bags').insert({
      organization_id: currentOrg.id,
      team_id: teamId,
      kit_template_id: templateId,
      season_id: seasonId,
      bag_tag: bagTag || null,
      status: 'building'
    }).select().single()

    if (error || !bag) { addToast(friendlyError(error), 'error'); return }

    if (tmplItems?.length > 0) {
      // Create one team_bag_item per quantity unit in template
      const itemInserts = []
      tmplItems.forEach(ti => {
        const qty = ti.quantity || 1
        for (let i = 0; i < qty; i++) {
          itemInserts.push({
            team_bag_id: bag.id,
            category_id: ti.category_id,
            equipment_item_id: ti.equipment_item_id || null,
            is_required: ti.is_required,
            is_packed: false,
            notes: ti.notes
          })
        }
      })
      const { error: itemsErr } = await supabase.from('team_bag_items').insert(itemInserts)
      if (itemsErr) {
        addToast("Bag was created, but the items didn't pack in. Open it and add them by hand.", 'error')
        setShowCreate(false)
        navigate(`/team-bags/${bag.id}`)
        return
      }
    }

    addToast('Bag created')
    setShowCreate(false)
    navigate(`/team-bags/${bag.id}`)
  }

  const filtered = bags.filter(b => {
    if (filterStatus && b.status !== filterStatus) return false
    if (filterSeason && b.season_id !== filterSeason) return false
    return true
  })

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Team bags</h1>
          <p className="text-muted">{bags.length} bag{bags.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New bag</button>
      </div>

      <div className="filters-bar">
        <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)}>
          <option value="">All seasons</option>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_active ? ' (active)' : ''}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {BAG_FILTER_OPTIONS.map(opt => (
            <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <span className="text-muted">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <SkeletonList rows={5} style={{ marginTop: '0.5rem' }} />
      ) : templates.length === 0 ? (
        <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No bag templates yet.</p>
          <p className="text-muted" style={{ marginBottom: '1.25rem' }}>Every team bag starts from a template. Create one in Bag templates and bags will show up here as you build them.</p>
          <button className="btn-primary" onClick={() => navigate('/bag-templates')}>Go to bag templates</button>
        </div>
      ) : filtered.length === 0 ? (
        bags.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No bags built yet.</p>
            <p className="text-muted" style={{ marginBottom: '1.25rem' }}>Bags get created automatically when you add a team that matches a template. You can also build one manually from Teams.</p>
            <button className="btn-secondary" onClick={() => navigate('/teams')}>Go to teams</button>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
            <p>No bags match your filters.</p>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Try a different season or status.</p>
          </div>
        )
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Template</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Assembled</th>
                <th>Picked up by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(bag => {
                const sc = getBagStatusConfig(bag.status)
                const total = bag.team_bag_items?.length || 0
                const packed = bag.team_bag_items?.filter(i => i.is_packed).length || 0
                return (
                  <tr key={bag.id} onClick={() => navigate(`/team-bags/${bag.id}`)} style={{ cursor: 'pointer' }}>
                    <td className="item-name">
                      <strong>{bag.teams?.name || 'Unknown'}</strong>
                      <span className="item-detail">{bag.teams?.divisions?.name} · {bag.teams?.divisions?.sport_types?.name}</span>
                    </td>
                    <td className="text-muted" style={{ fontSize: '0.85rem' }}>{bag.kit_templates?.name || '—'}</td>
                    <td><span className="badge" style={{ backgroundColor: sc.bg, color: sc.color }}>{sc.label}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '60px', height: '4px', background: 'var(--gray-200)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${total > 0 ? (packed / total) * 100 : 0}%`, height: '100%', background: 'var(--green-500)', borderRadius: '2px' }} />
                        </div>
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>{packed}/{total}</span>
                      </div>
                    </td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                      {bag.built_at ? new Date(bag.built_at).toLocaleDateString() : '—'}
                      {bag.profiles?.full_name && <span className="item-detail">{bag.profiles.full_name}</span>}
                    </td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{bag.picked_up_by_name || '—'}</td>
                    <td>
                      <button className="btn-small" onClick={e => { e.stopPropagation(); navigate(`/team-bags/${bag.id}`) }}>
                        {bag.status === 'building' ? 'Build' : 'View'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateBagModal
          teams={teams}
          templates={templates}
          seasons={seasons}
          bags={bags}
          onCreate={createBag}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  )
}

function CreateBagModal({ teams, templates, seasons, bags, onCreate, onClose }) {
  const [teamId, setTeamId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [seasonId, setSeasonId] = useState(seasons.find(s => s.is_active)?.id || '')
  const [bagTag, setBagTag] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Filter out teams that already have an active bag (building/assigned) for the selected season
  const availableTeams = teams.filter(t => {
    if (!seasonId) return true
    return !bags.some(b => b.team_id === t.id && b.season_id === seasonId && b.status !== 'returned')
  })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!teamId || !templateId || !seasonId) { setError('Select a team, template, and season.'); return }
    setSubmitting(true)
    await onCreate(teamId, templateId, seasonId, bagTag)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create team bag</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Team *</label>
            <select value={teamId} onChange={e => setTeamId(e.target.value)} required>
              <option value="">Select team...</option>
              {availableTeams.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.divisions?.name} · {t.divisions?.sport_types?.name})</option>
              ))}
            </select>
            {availableTeams.length < teams.length && (
              <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                {teams.length - availableTeams.length} team(s) hidden — already have active bags this season
              </span>
            )}
          </div>
          <div className="form-group">
            <label>Kit template *</label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} required>
              <option value="">Select template...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.kit_template_items?.length || 0} items)</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Season *</label>
              <select value={seasonId} onChange={e => setSeasonId(e.target.value)} required>
                {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Bag tag #</label>
              <input type="text" value={bagTag} onChange={e => setBagTag(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Creating...' : 'Create bag'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
