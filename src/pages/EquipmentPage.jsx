import { useState, useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import Sidebar from '../components/Sidebar'
import { useToast } from '../components/Toast'
import { logActivity } from '../lib/activity'

const EQUIPMENT_TYPES = [
  { id: 'balls', label: 'Balls' },
  { id: 'bats', label: 'Bats' },
  { id: 'catchers_gear', label: 'Catchers Gear' },
  { id: 'batting_helmets', label: 'Batting Helmets' },
  { id: 'bags', label: 'Bags' },
  { id: 'field_equipment', label: 'Field Equipment' },
  { id: 'game_supplies', label: 'Game Supplies' },
  { id: 'first_aid', label: 'First Aid' },
  { id: 'umpire_gear', label: 'Umpire Gear' },
  { id: 'training', label: 'Training Equipment' },
  { id: 'apparel', label: 'Apparel' },
]

export default function EquipmentPage() {
  const { currentOrg, userRole } = useOrg()
  const { addToast } = useToast()
  const canEdit = ['admin','equipment_manager'].includes(userRole)
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [stockData, setStockData] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCondition, setFilterCondition] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)

  useEffect(() => { document.title = 'Equipment | My League Board' }, [])
  useEffect(() => { if (currentOrg) fetchAll() }, [currentOrg])
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault()
        document.querySelector('.search-input')?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function fetchAll() {
    setLoading(true)
    const orgId = currentOrg.id
    const [i, c, l, s] = await Promise.all([
      supabase.from('equipment_items').select('*, equipment_categories(name), storage_locations!storage_location_id(name)').eq('organization_id', orgId).order('created_at', { ascending: false }),
      supabase.from('equipment_categories').select('*').eq('organization_id', orgId).order('name'),
      supabase.from('storage_locations').select('*').eq('organization_id', orgId).order('name'),
      supabase.from('location_stock').select('id, equipment_item_id, storage_location_id, quantity').eq('organization_id', orgId)
    ])
    setItems(i.data || []); setCategories(c.data || []); setLocations(l.data || []); setStockData(s.data || []); setLoading(false)
  }

  async function saveItem(formData, isEdit, itemId) {
    let catId = formData.category_id
    if (formData._newCategory) {
      const { data } = await supabase.from('equipment_categories').insert({ organization_id: currentOrg.id, name: formData._newCategory }).select().single()
      if (data) catId = data.id
    }
    let locId = formData.storage_location_id || null
    if (formData._newLocation) {
      const { data } = await supabase.from('storage_locations').insert({ organization_id: currentOrg.id, name: formData._newLocation }).select().single()
      if (data) locId = data.id
    }
    const payload = {
      name: formData.name, category_id: catId || null, quantity: parseInt(formData.quantity) || 1,
      item_condition: formData.item_condition, status: formData.status,
      storage_location_id: locId || null, tag_number: formData.tag_number || null,
      brand: formData.brand || null, model: formData.model || null,
      size: formData.size || null, notes: formData.notes || null,
      organization_id: currentOrg.id
    }
    if (isEdit) {
      const oldItem = items.find(i => i.id === itemId)
      await supabase.from('equipment_items').update(payload).eq('id', itemId)
      if (oldItem && oldItem.item_condition !== formData.item_condition) {
        logActivity(currentOrg.id, 'condition changed', 'equipment', formData.name, `${oldItem.item_condition} → ${formData.item_condition}`)
      }
    } else {
      await supabase.from('equipment_items').insert(payload)
    }
    fetchAll(); setShowAddModal(false); setEditingItem(null)
    addToast(isEdit ? 'Equipment updated' : 'Equipment added')
    if (!isEdit) logActivity(currentOrg.id, 'added', 'equipment', formData.name)
  }

  async function deleteItem(id) {
    if (!confirm('Delete this equipment item?')) return
    const item = items.find(i => i.id === id)
    const itemStock = stockData.filter(s => s.equipment_item_id === id && s.quantity > 0)
    if (itemStock.length > 0) {
      if (!confirm(`This item is stocked at ${itemStock.length} location(s). Deleting will remove all stock records. Continue?`)) return
    }
    await supabase.from('equipment_items').delete().eq('id', id)
    fetchAll(); addToast('Equipment deleted')
    logActivity(currentOrg.id, 'deleted', 'equipment', item?.name)
  }

  function exportCSV() {
    const headers = ['Name', 'Category', 'Quantity', 'Condition', 'Status', 'Tag #', 'Notes']
    const rows = items.map(item => [
      item.name,
      item.equipment_categories?.name || '',
      getItemStockedQty(item.id) || item.quantity,
      item.item_condition || '',
      item.status || '',
      item.tag_number || '',
      item.notes || ''
    ])
    const csv = [headers, ...rows].map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `equipment-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast('Inventory exported')
  }

  const filtered = items.filter(item => {
    if (filterCategory && item.category_id !== filterCategory) return false
    if (filterStatus && item.status !== filterStatus) return false
    if (filterCondition && item.item_condition !== filterCondition) return false
    if (filterLocation && item.storage_location_id !== filterLocation) return false
    if (searchTerm && !item.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })

  function getItemStockedQty(itemId) {
    return stockData.filter(s => s.equipment_item_id === itemId).reduce((sum, s) => sum + s.quantity, 0)
  }

  const stockTotal = stockData.reduce((s, r) => s + r.quantity, 0)
  const totalQty = stockTotal > 0 ? stockTotal : items.reduce((s, i) => s + i.quantity, 0)
  const assignedQty = items.filter(i => i.status === 'assigned').reduce((s, i) => s + i.quantity, 0)
  const availableQty = totalQty - assignedQty
  const repairQty = items.filter(i => ['broken','damaged','needs_repair'].includes(i.item_condition)).reduce((s, i) => s + i.quantity, 0)

  const categoryCounts = {}
  items.forEach(item => {
    const cat = item.equipment_categories?.name || 'Uncategorized'
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
  })

  const cc = { 'new':'#16a34a','good':'#22c55e','fair':'#eab308','worn':'#f97316','damaged':'#ef4444','broken':'#dc2626','needs_repair':'#dc2626','retired':'#6b7280' }
  const sc = { 'available':'#16a34a','assigned':'#3b82f6','in_repair':'#f97316','lost':'#dc2626','retired':'#6b7280' }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>Equipment inventory</h1>
            <p className="text-muted">{items.length} items · {totalQty} stocked · {assignedQty} assigned{repairQty > 0 ? ` · ${repairQty} needs repair` : ''}</p>
            {Object.keys(categoryCounts).length > 0 && (
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                {Object.entries(categoryCounts).sort((a,b) => b[1] - a[1]).map(([cat, count]) => (
                  <span key={cat} style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: '10px', color: 'var(--green-700)', fontWeight: 500 }}>{cat}: {count}</span>
                ))}
              </div>
            )}
          </div>
          <div className="header-actions">
            {canEdit && <button className="btn-secondary" onClick={exportCSV}>Export CSV</button>}
            {canEdit && <button className="btn-primary" onClick={() => setShowAddModal(true)}>+ Add equipment</button>}
          </div>
        </div>

        <div className="filters-bar">
          <input type="text" placeholder="Search equipment..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" /><span className="text-muted" style={{ fontSize: '0.7rem' }}>Press / to search</span>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}><option value="">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="">All statuses</option><option value="available">Available</option><option value="assigned">Assigned</option><option value="in_repair">In repair</option><option value="lost">Lost</option><option value="retired">Retired</option></select>
          <select value={filterCondition} onChange={e => setFilterCondition(e.target.value)}><option value="">All conditions</option><option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="worn">Worn</option><option value="damaged">Damaged</option><option value="broken">Broken</option><option value="needs_repair">Needs repair</option></select>
          <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)}><option value="">All locations</option><option value="unassigned">Unassigned</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          {(searchTerm || filterCategory || filterStatus || filterCondition || filterLocation) && (
            <button onClick={() => { setSearchTerm(''); setFilterCategory(''); setFilterStatus(''); setFilterCondition(''); setFilterLocation('') }} style={{ background: 'none', border: 'none', color: 'var(--green-600)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>Clear all filters</button>
          )}
        </div>

        {loading ? <div className="loading-state"><div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }}></div></div> : filtered.length === 0 ? (
          <div className="empty-state"><p>{items.length === 0 ? 'No equipment added yet.' : 'No items match your filters.'}</p></div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Category</th><th>Qty</th><th>Condition</th><th>Status</th><th>Tag</th><th></th></tr></thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} onClick={() => setSelectedItem(item)} style={{ cursor: 'pointer' }}>
                    <td className="item-name"><strong>{item.name}</strong>{item.brand && <span className="item-detail">{item.brand} {item.model||''}</span>}{item.size && <span className="item-detail">{item.size}</span>}</td>
                    <td>{item.equipment_categories?.name || '—'}</td>
                    <td>{getItemStockedQty(item.id) || item.quantity}</td>
                    <td><span className="badge" style={{ backgroundColor:(cc[item.item_condition]||'#6b7280')+'20', color:cc[item.item_condition]||'#6b7280' }}>{item.item_condition.replace('_',' ')}</span></td>
                    <td><span className="badge" style={{ backgroundColor:(sc[item.status]||'#6b7280')+'20', color:sc[item.status]||'#6b7280' }}>{item.status.replace('_',' ')}</span></td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>{item.tag_number || '—'}</td>
                    {canEdit && <td><div style={{display:'flex',gap:'0.25rem'}}><button className="btn-icon-sm" onClick={() => setEditingItem(item)} title="Edit">✎</button><button className="btn-icon-sm btn-icon-danger" onClick={() => deleteItem(item.id)} title="Delete">✕</button></div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(showAddModal || editingItem) && (
          <SmartAddModal
            item={editingItem}
            categories={categories}
            locations={locations}
            orgId={currentOrg.id}
            onSave={saveItem}
            onClose={() => { setShowAddModal(false); setEditingItem(null) }}
          />
        )}
        {selectedItem && <ItemDetailModal item={selectedItem} locationStock={stockData} locations={locations} canEdit={canEdit} onClose={() => { setSelectedItem(null); fetchAll() }} />}
      </main>
      <style>{`
        .btn-icon-sm { background:none; border:none; color:var(--gray-400); cursor:pointer; font-size:0.85rem; padding:0.2rem 0.4rem; border-radius:4px; transition:color .15s,background .15s; line-height:1; }
        .btn-icon-sm:hover { color:var(--green-700); background:var(--green-100); }
        .btn-icon-danger:hover { color:var(--red-500)!important; background:var(--red-100)!important; }
      `}</style>
    </div>
  )
}

function ItemDetailModal({ item, locationStock, locations, canEdit, onClose }) {
  const { addToast } = useToast()
  const itemStock = locationStock.filter(s => s.equipment_item_id === item.id)
  const totalStocked = itemStock.reduce((sum, s) => sum + s.quantity, 0)
  const [showQuickStock, setShowQuickStock] = useState(false)
  const [stockLocId, setStockLocId] = useState('')
  const [stockQty, setStockQty] = useState(1)
  const [stockSubmitting, setStockSubmitting] = useState(false)
  const [history, setHistory] = useState([])

  useEffect(() => {
    supabase.from('activity_log')
      .select('action, details, created_at')
      .eq('organization_id', item.organization_id)
      .eq('entity_type', 'equipment')
      .eq('entity_name', item.name)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setHistory(data || []))
  }, [item])

  async function quickAddStock() {
    if (!stockLocId || stockQty < 1) return
    setStockSubmitting(true)
    const existing = locationStock.find(s => s.equipment_item_id === item.id && s.storage_location_id === stockLocId)
    if (existing) {
      await supabase.from('location_stock').update({ quantity: existing.quantity + stockQty }).eq('id', existing.id)
    } else {
      await supabase.from('location_stock').insert({
        organization_id: item.organization_id,
        equipment_item_id: item.id,
        storage_location_id: stockLocId,
        quantity: stockQty
      })
    }
    addToast(`Added ${stockQty} to location`)
    setStockSubmitting(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{item.name}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form">
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div><span className="text-muted" style={{ fontSize: '0.8rem' }}>Category</span><div style={{ fontWeight: 500 }}>{item.equipment_categories?.name || '—'}</div></div>
            <div><span className="text-muted" style={{ fontSize: '0.8rem' }}>Condition</span><div style={{ fontWeight: 500 }}>{item.item_condition || '—'}</div></div>
            <div><span className="text-muted" style={{ fontSize: '0.8rem' }}>Status</span><div style={{ fontWeight: 500 }}>{item.status || '—'}</div></div>
            <div><span className="text-muted" style={{ fontSize: '0.8rem' }}>Total stocked</span><div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{totalStocked}</div></div>
          </div>

          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Locations</h3>
          {itemStock.length === 0 ? (
            <p className="text-muted">Not stocked at any location yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {itemStock.map(s => {
                const loc = locations.find(l => l.id === s.storage_location_id)
                return (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', border: '1px solid var(--gray-100)' }}>
                    <span style={{ fontWeight: 500 }}>{loc?.name || 'Unknown'}</span>
                    <span style={{ fontWeight: 600 }}>{s.quantity} qty</span>
                  </div>
                )
              })}
            </div>
          )}

          {canEdit && (
            <div style={{ marginTop: '1rem' }}>
              {!showQuickStock ? (
                <button className="btn-secondary" onClick={() => setShowQuickStock(true)} style={{ fontSize: '0.85rem' }}>+ Quick stock at location</button>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Location</label>
                    <select value={stockLocId} onChange={e => setStockLocId(e.target.value)} style={{ padding: '0.35rem', fontSize: '0.85rem', fontFamily: 'inherit', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)' }}>
                      <option value="">Select...</option>
                      {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ width: '70px', marginBottom: 0 }}>
                    <label style={{ fontSize: '0.75rem' }}>Qty</label>
                    <input type="number" min="1" value={stockQty} onChange={e => setStockQty(parseInt(e.target.value) || 0)} style={{ padding: '0.35rem', fontSize: '0.85rem', fontFamily: 'inherit', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius)', width: '100%' }} />
                  </div>
                  <button className="btn-primary" onClick={quickAddStock} disabled={stockSubmitting || !stockLocId} style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>{stockSubmitting ? '...' : 'Add'}</button>
                  <button className="btn-icon-sm" onClick={() => setShowQuickStock(false)}>✕</button>
                </div>
              )}
            </div>
          )}

          {item.notes && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', border: '1px solid var(--gray-100)' }}>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>Notes</span>
              <p style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>{item.notes}</p>
            </div>
          )}

          {history.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gray-600)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>History</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {history.map((h, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--gray-100)', fontSize: '0.8rem' }}>
                    <span>{h.action}{h.details ? ': ' + h.details : ''}</span>
                    <span className="text-muted">{new Date(h.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SmartAddModal({ item, categories, locations, orgId, onSave, onClose }) {
  const [equipType, setEquipType] = useState(null)
  const [form, setForm] = useState({
    name: item?.name || '', category_id: item?.category_id || '', quantity: item?.quantity || 1,
    item_condition: item?.item_condition || 'good', status: item?.status || 'available',
    storage_location_id: item?.storage_location_id || '', tag_number: item?.tag_number || '',
    brand: item?.brand || '', model: item?.model || '', size: item?.size || '', notes: item?.notes || '',
    _newCategory: '', _newLocation: '',
    _sport: '', _level: '', _customLevel: '', _use: '',
    _softballSize: '', _compression: '',
    _batLength: '', _batWeight: '', _barrelSize: '', _certification: '', _customCert: '',
    _catcherPiece: '',
    _helmetStyle: '',
    _bagType: '', _customBagType: '',
    _fieldType: '', _customFieldType: '',
    _gameType: '', _customGameType: '',
    _firstAidType: '', _customFirstAidType: '', _expiration: '',
    _umpType: '', _customUmpType: '',
    _trainingType: '', _customTrainingType: '',
    _apparelType: '', _customApparelType: '', _color: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [showNewCat, setShowNewCat] = useState(false)
  const [showNewLoc, setShowNewLoc] = useState(false)

  function u(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  function buildName() {
    if (item) return
    let n = ''
    switch (equipType) {
      case 'balls': {
        const sport = form._sport || 'Baseball'
        if (sport === 'Baseball') n = `${form._level || 'Little League'} ${form._use || 'Game'} Baseball`
        else if (sport === 'Softball') n = `${form._softballSize || '12"'} ${form._compression ? form._compression+' comp ' : ''}${form._use || 'Game'} Softball`
        break
      }
      case 'bats': n = `${form._sport || 'Baseball'} Bat${form._batLength ? ' '+form._batLength+'"' : ''}`; break
      case 'catchers_gear': n = `${form._catcherPiece || 'Catchers Gear'}${form.size ? ' ('+form.size+')' : ''}`; break
      case 'batting_helmets': n = `Batting Helmet${form.size ? ' ('+form.size+')' : ''}${form._helmetStyle ? ' '+form._helmetStyle : ''}`; break
      case 'bags': n = form._bagType === '__other__' ? form._customBagType || 'Bag' : form._bagType || 'Gear Bag'; break
      case 'field_equipment': n = form._fieldType === '__other__' ? form._customFieldType || 'Field Equipment' : form._fieldType || 'Field Equipment'; break
      case 'game_supplies': n = form._gameType === '__other__' ? form._customGameType || 'Game Supply' : form._gameType || 'Game Supply'; break
      case 'first_aid': n = form._firstAidType === '__other__' ? form._customFirstAidType || 'First Aid' : form._firstAidType || 'First Aid Item'; break
      case 'umpire_gear': n = form._umpType === '__other__' ? form._customUmpType || 'Umpire Gear' : form._umpType || 'Umpire Gear'; break
      case 'training': n = form._trainingType === '__other__' ? form._customTrainingType || 'Training Equipment' : form._trainingType || 'Training Equipment'; break
      case 'apparel': n = form._apparelType === '__other__' ? form._customApparelType || 'Apparel' : form._apparelType || 'Apparel'; break
      default: n = ''
    }
    u('name', n.trim())
  }

  useEffect(() => { buildName() }, [equipType, form._sport, form._level, form._use, form._softballSize, form._compression, form._catcherPiece, form.size, form._helmetStyle, form._bagType, form._customBagType, form._fieldType, form._customFieldType, form._gameType, form._customGameType, form._firstAidType, form._customFirstAidType, form._umpType, form._customUmpType, form._trainingType, form._customTrainingType, form._apparelType, form._customApparelType, form._batLength])
  useEffect(() => { if (form._use === 'Game') u('item_condition', 'new') }, [form._use])

  function handleCatChange(v) { if (v === '__new__') { setShowNewCat(true); return }; u('category_id', v) }
  function handleLocChange(v) { if (v === '__new__') { setShowNewLoc(true); return }; u('storage_location_id', v) }

  async function handleSubmit(e) {
    e.preventDefault(); setSubmitting(true)
    await onSave(form, !!item, item?.id)
    setSubmitting(false)
  }

  if (!equipType && !item) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2>What are you adding?</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
          <div className="type-grid">
            {EQUIPMENT_TYPES.map(t => (
              <button key={t.id} className="type-card" onClick={() => setEquipType(t.id)}>
                <span className="type-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <style>{typeGridStyles}</style>
      </div>
    )
  }

  const typeLabel = EQUIPMENT_TYPES.find(t => t.id === equipType)?.label || 'Equipment'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{item ? 'Edit equipment' : `Add ${typeLabel}`}</h2>
          <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
            {!item && <button className="btn-secondary btn-sm" onClick={() => setEquipType(null)}>← Change type</button>}
            <button className="btn-icon" onClick={onClose}>✕</button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">

          {equipType === 'balls' && <BallsForm form={form} u={u} />}
          {equipType === 'bats' && <BatsForm form={form} u={u} />}
          {equipType === 'catchers_gear' && <CatchersForm form={form} u={u} />}
          {equipType === 'batting_helmets' && <HelmetsForm form={form} u={u} />}
          {equipType === 'bags' && <SimpleTypeForm form={form} u={u} label="Bag type" options={['Mesh Gear Bag','Bat Bag','Equipment Bag','Catchers Bag']} field="_bagType" customField="_customBagType" />}
          {equipType === 'field_equipment' && <SimpleTypeForm form={form} u={u} label="Equipment type" options={['Bases (set)','Batting Tee','Pitching Rubber','Home Plate','Field Chalk','Rake','Drag Mat','Foul Poles','Line Chalker','Batter\'s Box Template']} field="_fieldType" customField="_customFieldType" />}
          {equipType === 'game_supplies' && <SimpleTypeForm form={form} u={u} label="Supply type" options={['Score Book','Lineup Cards','Pitch Counter','Pencils','Dry Erase Board','Dry Erase Markers']} field="_gameType" customField="_customGameType" />}
          {equipType === 'first_aid' && <FirstAidForm form={form} u={u} />}
          {equipType === 'umpire_gear' && <UmpireForm form={form} u={u} />}
          {equipType === 'training' && <SimpleTypeForm form={form} u={u} label="Equipment type" options={['Cones','Hitting Net','Pitch-Back Net','Training Balls','Batting Tee','Agility Ladder','Electric Pitching Machine','Manual Pitching Machine','Soft Toss Machine','Pitching Target']} field="_trainingType" customField="_customTrainingType" showBrandModel />}
          {equipType === 'apparel' && <ApparelForm form={form} u={u} />}

          <div className="form-divider"></div>

          <div className="form-group">
            <label>Name (auto-generated, you can edit)</label>
            <input type="text" value={form.name} onChange={e => u('name', e.target.value)} required />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Category</label>
              {showNewCat ? (
                <div className="inline-add-row">
                  <input type="text" value={form._newCategory} onChange={e => u('_newCategory', e.target.value)} placeholder="New category..." autoFocus onKeyDown={e => { if (e.key==='Enter'){e.preventDefault()}; if (e.key==='Escape') setShowNewCat(false) }} />
                  <button type="button" className="btn-small" onClick={() => setShowNewCat(false)}>OK</button>
                </div>
              ) : (
                <select value={form.category_id} onChange={e => handleCatChange(e.target.value)}>
                  <option value="">Select or auto-assign</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__new__">＋ Add new category...</option>
                </select>
              )}
            </div>
            <div className="form-group">
              <label>Quantity</label>
              <input type="number" min="1" value={form.quantity} onChange={e => u('quantity', e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Condition</label>
              <select value={form.item_condition} onChange={e => u('item_condition', e.target.value)}>
                <option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option><option value="worn">Worn</option><option value="damaged">Damaged</option><option value="broken">Broken</option><option value="needs_repair">Needs repair</option>
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={e => u('status', e.target.value)}>
                <option value="available">Available</option><option value="assigned">Assigned</option><option value="in_repair">In repair</option><option value="lost">Lost</option><option value="retired">Retired</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Home location (where overflow is stored)</label>
              {showNewLoc ? (
                <div className="inline-add-row">
                  <input type="text" value={form._newLocation} onChange={e => u('_newLocation', e.target.value)} placeholder="New location..." autoFocus onKeyDown={e => { if (e.key==='Enter'){e.preventDefault()}; if (e.key==='Escape') setShowNewLoc(false) }} />
                  <button type="button" className="btn-small" onClick={() => setShowNewLoc(false)}>OK</button>
                </div>
              ) : (
                <select value={form.storage_location_id} onChange={e => handleLocChange(e.target.value)}>
                  <option value="">Not assigned</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  <option value="__new__">＋ Add new location...</option>
                </select>
              )}
              <span className="form-hint" style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Sets this item's home/supply location</span>
            </div>
            <div className="form-group">
              <label>Tag #</label>
              <input type="text" value={form.tag_number} onChange={e => u('tag_number', e.target.value)} placeholder="Optional" />
            </div>
          </div>

          {(equipType === 'bats' || equipType === 'training') && (
            <div className="form-row">
              <div className="form-group"><label>Brand</label><input type="text" value={form.brand} onChange={e => u('brand', e.target.value)} placeholder="Rawlings, Easton, etc" /></div>
              <div className="form-group"><label>Model</label><input type="text" value={form.model} onChange={e => u('model', e.target.value)} /></div>
            </div>
          )}

          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => u('notes', e.target.value)} rows={2} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : (item ? 'Save changes' : 'Add to inventory')}</button>
          </div>
        </form>
      </div>
      <style>{`
        .modal-wide { max-width: 640px; }
        .form-divider { border-top: 1px solid var(--gray-200); margin: 0.5rem 0; }
        .inline-add-row { display:flex; gap:0.5rem; align-items:center; }
        .inline-add-row input { flex:1; padding:0.5rem 0.6rem; border:1.5px solid var(--green-400); border-radius:var(--radius); font-size:0.9rem; font-family:inherit; }
        .btn-sm { padding: 0.3rem 0.75rem; font-size: 0.8rem; }
        .custom-input { margin-top: 0.5rem; }
      `}</style>
    </div>
  )
}

function BallsForm({ form, u }) {
  return (
    <>
      <div className="form-group">
        <label>Sport *</label>
        <select value={form._sport} onChange={e => u('_sport', e.target.value)}>
          <option value="">Select sport...</option>
          <option value="Baseball">Baseball</option>
          <option value="Softball">Softball</option>
        </select>
      </div>
      {form._sport === 'Baseball' && (
        <div className="form-row">
          <div className="form-group">
            <label>Level</label>
            <select value={form._level} onChange={e => u('_level', e.target.value)}>
              <option value="">Select level...</option>
              <option value="T-Ball">T-Ball</option>
              <option value="RIF">RIF (Reduced Injury Factor)</option>
              <option value="Little League">Little League</option>
              <option value="__other__">+ Add other...</option>
            </select>
            {form._level === '__other__' && <input type="text" className="custom-input" value={form._customLevel} onChange={e => u('_customLevel', e.target.value)} placeholder="Custom level..." />}
          </div>
          <div className="form-group">
            <label>Use</label>
            <select value={form._use} onChange={e => u('_use', e.target.value)}>
              <option value="">Select use...</option>
              <option value="Game">Game ball</option>
              <option value="Practice">Practice ball</option>
            </select>
          </div>
        </div>
      )}
      {form._sport === 'Softball' && (
        <div className="form-row">
          <div className="form-group">
            <label>Size</label>
            <select value={form._softballSize} onChange={e => u('_softballSize', e.target.value)}>
              <option value="">Select size...</option>
              <option value='10"'>10 inch</option>
              <option value='11"'>11 inch</option>
              <option value='12"'>12 inch</option>
            </select>
          </div>
          <div className="form-group">
            <label>Compression</label>
            <select value={form._compression} onChange={e => u('_compression', e.target.value)}>
              <option value="">Select...</option>
              <option value="375">375</option>
              <option value="525">525</option>
            </select>
          </div>
          <div className="form-group">
            <label>Use</label>
            <select value={form._use} onChange={e => u('_use', e.target.value)}>
              <option value="">Select use...</option>
              <option value="Game">Game ball</option>
              <option value="Practice">Practice ball</option>
            </select>
          </div>
        </div>
      )}
    </>
  )
}

function BatsForm({ form, u }) {
  const drop = form._batLength && form._batWeight ? (parseInt(form._batWeight) - parseInt(form._batLength)) : null
  return (
    <>
      <div className="form-group">
        <label>Sport</label>
        <select value={form._sport} onChange={e => u('_sport', e.target.value)}>
          <option value="">Select sport...</option>
          <option value="Baseball">Baseball</option>
          <option value="Softball">Softball</option>
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Length (inches)</label>
          <input type="number" value={form._batLength} onChange={e => u('_batLength', e.target.value)} placeholder="26-34" />
        </div>
        <div className="form-group">
          <label>Weight (oz)</label>
          <input type="number" value={form._batWeight} onChange={e => u('_batWeight', e.target.value)} placeholder="16-31" />
        </div>
        <div className="form-group">
          <label>Drop{drop !== null ? ` (${drop})` : ''}</label>
          <input type="text" value={drop !== null ? drop : ''} disabled placeholder="Auto" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Barrel size</label>
          <select value={form._barrelSize} onChange={e => u('_barrelSize', e.target.value)}>
            <option value="">Select...</option>
            <option value='2 1/4"'>2 1/4"</option>
            <option value='2 5/8"'>2 5/8"</option>
            <option value='2 3/4"'>2 3/4"</option>
          </select>
        </div>
        <div className="form-group">
          <label>Certification</label>
          <select value={form._certification} onChange={e => u('_certification', e.target.value)}>
            <option value="">Select...</option>
            <option value="USA Baseball">USA Baseball</option>
            <option value="USSSA">USSSA</option>
            <option value="BBCOR">BBCOR</option>
            <option value="Wood">Wood</option>
            <option value="__other__">+ Add other...</option>
          </select>
          {form._certification === '__other__' && <input type="text" className="custom-input" value={form._customCert} onChange={e => u('_customCert', e.target.value)} placeholder="Custom certification..." />}
        </div>
      </div>
    </>
  )
}

function CatchersForm({ form, u }) {
  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label>Piece *</label>
          <select value={form._catcherPiece} onChange={e => u('_catcherPiece', e.target.value)}>
            <option value="">Select piece...</option>
            <option value="Catchers Helmet">Catchers Helmet</option>
            <option value="Chest Protector">Chest Protector</option>
            <option value="Leg Guards">Leg Guards</option>
            <option value="Throat Guard">Throat Guard</option>
            <option value="Catchers Glove">Catchers Glove</option>
          </select>
        </div>
        <div className="form-group">
          <label>Sport</label>
          <select value={form._sport} onChange={e => u('_sport', e.target.value)}>
            <option value="">Select...</option>
            <option value="Baseball">Baseball</option>
            <option value="Softball">Softball</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Size</label>
        <select value={form.size} onChange={e => u('size', e.target.value)}>
          <option value="">Select size...</option>
          <option value="Youth S">Youth S</option>
          <option value="Youth M">Youth M</option>
          <option value="Youth L">Youth L</option>
          <option value="Adult S">Adult S</option>
          <option value="Adult M">Adult M</option>
          <option value="Adult L">Adult L</option>
        </select>
      </div>
    </>
  )
}

function HelmetsForm({ form, u }) {
  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label>Sport</label>
          <select value={form._sport} onChange={e => u('_sport', e.target.value)}>
            <option value="">Select...</option>
            <option value="Baseball">Baseball</option>
            <option value="Softball">Softball</option>
          </select>
        </div>
        <div className="form-group">
          <label>Style</label>
          <select value={form._helmetStyle} onChange={e => u('_helmetStyle', e.target.value)}>
            <option value="">Select...</option>
            <option value="w/ Face Guard">With face guard</option>
            <option value="No Face Guard">Without face guard</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Size</label>
        <select value={form.size} onChange={e => u('size', e.target.value)}>
          <option value="">Select size...</option>
          <option value="XS">XS</option><option value="S">S</option><option value="M">M</option><option value="L">L</option><option value="XL">XL</option><option value="One Size">One Size</option>
        </select>
      </div>
    </>
  )
}

function SimpleTypeForm({ form, u, label, options, field, customField, showBrandModel }) {
  return (
    <>
      <div className="form-group">
        <label>{label} *</label>
        <select value={form[field]} onChange={e => u(field, e.target.value)}>
          <option value="">Select type...</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="__other__">+ Add other...</option>
        </select>
        {form[field] === '__other__' && <input type="text" className="custom-input" value={form[customField]} onChange={e => u(customField, e.target.value)} placeholder="Custom type..." autoFocus />}
      </div>
      {showBrandModel && (
        <div className="form-row">
          <div className="form-group"><label>Brand</label><input type="text" value={form.brand} onChange={e => u('brand', e.target.value)} /></div>
          <div className="form-group"><label>Model</label><input type="text" value={form.model} onChange={e => u('model', e.target.value)} /></div>
        </div>
      )}
    </>
  )
}

function FirstAidForm({ form, u }) {
  return (
    <>
      <div className="form-group">
        <label>Item type *</label>
        <select value={form._firstAidType} onChange={e => u('_firstAidType', e.target.value)}>
          <option value="">Select type...</option>
          <option value="First Aid Kit">First Aid Kit</option>
          <option value="Ice Packs">Ice Packs</option>
          <option value="Athletic Tape">Athletic Tape</option>
          <option value="Instant Cold Packs">Instant Cold Packs</option>
          <option value="Band-Aids">Band-Aids</option>
          <option value="Antiseptic Wipes">Antiseptic Wipes</option>
          <option value="__other__">+ Add other...</option>
        </select>
        {form._firstAidType === '__other__' && <input type="text" className="custom-input" value={form._customFirstAidType} onChange={e => u('_customFirstAidType', e.target.value)} placeholder="Custom type..." />}
      </div>
      <div className="form-group">
        <label>Expiration date</label>
        <input type="date" value={form._expiration} onChange={e => u('_expiration', e.target.value)} />
      </div>
    </>
  )
}

function UmpireForm({ form, u }) {
  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label>Gear type *</label>
          <select value={form._umpType} onChange={e => u('_umpType', e.target.value)}>
            <option value="">Select type...</option>
            <option value="Indicator">Indicator</option>
            <option value="Brush">Brush</option>
            <option value="Ball Bag">Ball Bag</option>
            <option value="Chest Protector">Chest Protector</option>
            <option value="Mask">Mask</option>
            <option value="Plate Shoes">Plate Shoes</option>
            <option value="Shin Guards">Shin Guards</option>
            <option value="__other__">+ Add other...</option>
          </select>
          {form._umpType === '__other__' && <input type="text" className="custom-input" value={form._customUmpType} onChange={e => u('_customUmpType', e.target.value)} placeholder="Custom type..." />}
        </div>
        <div className="form-group">
          <label>Size</label>
          <select value={form.size} onChange={e => u('size', e.target.value)}>
            <option value="">N/A</option>
            <option value="S">S</option><option value="M">M</option><option value="L">L</option><option value="XL">XL</option>
          </select>
        </div>
      </div>
    </>
  )
}

function ApparelForm({ form, u }) {
  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label>Apparel type *</label>
          <select value={form._apparelType} onChange={e => u('_apparelType', e.target.value)}>
            <option value="">Select type...</option>
            <option value="Jersey">Jersey</option>
            <option value="Hat">Hat</option>
            <option value="Belt">Belt</option>
            <option value="Socks">Socks</option>
            <option value="Pants">Pants</option>
            <option value="__other__">+ Add other...</option>
          </select>
          {form._apparelType === '__other__' && <input type="text" className="custom-input" value={form._customApparelType} onChange={e => u('_customApparelType', e.target.value)} placeholder="Custom type..." />}
        </div>
        <div className="form-group">
          <label>Size</label>
          <select value={form.size} onChange={e => u('size', e.target.value)}>
            <option value="">Select...</option>
            <option value="YXS">Youth XS</option><option value="YS">Youth S</option><option value="YM">Youth M</option><option value="YL">Youth L</option><option value="YXL">Youth XL</option>
            <option value="AS">Adult S</option><option value="AM">Adult M</option><option value="AL">Adult L</option><option value="AXL">Adult XL</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Color</label>
        <input type="text" value={form._color} onChange={e => u('_color', e.target.value)} placeholder="Red, Navy, White, etc" />
      </div>
    </>
  )
}

const typeGridStyles = `
  .type-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem; padding: 1.5rem; }
  .type-card { background: white; border: 1.5px solid var(--gray-200); border-radius: var(--radius-lg); padding: 1.25rem 0.75rem; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; cursor: pointer; transition: border-color .15s, box-shadow .15s, transform .1s; font-family: inherit; }
  .type-card:hover { border-color: var(--green-400); box-shadow: var(--shadow); transform: translateY(-2px); }
  .type-label { font-size: 0.95rem; font-weight: 600; color: var(--gray-700); text-align: center; }
  .modal-wide { max-width: 640px; }
`
