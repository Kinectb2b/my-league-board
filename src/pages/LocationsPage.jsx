import { useState, useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import Sidebar from '../components/Sidebar'

export default function LocationsPage() {
  const { currentOrg } = useOrg()
  const [locations, setLocations] = useState([])
  const [equipment, setEquipment] = useState([])
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [activeLocation, setActiveLocation] = useState(null)
  const [showAddStock, setShowAddStock] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [editingLocation, setEditingLocation] = useState(null)
  const [localStock, setLocalStock] = useState({})
  const [hasChanges, setHasChanges] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => { if (currentOrg) fetchAll() }, [currentOrg])

  async function fetchAll() {
    setLoading(true)
    const orgId = currentOrg.id
    const [l, e, s] = await Promise.all([
      supabase.from('storage_locations').select('*').eq('organization_id', orgId).order('is_supply_room', { ascending: false }).order('name'),
      supabase.from('equipment_items').select('*, equipment_categories(name)').eq('organization_id', orgId).order('name'),
      supabase.from('location_stock').select('*, equipment_items(name, quantity, equipment_categories(name)), storage_locations(name)').eq('organization_id', orgId)
    ])
    setLocations(l.data || []); setEquipment(e.data || []); setStock(s.data || []); setLoading(false)
    if (activeLocation) {
      const updated = (l.data || []).find(loc => loc.id === activeLocation.id)
      if (updated) setActiveLocation(updated)
    }
  }

  async function addLocation(formData) {
    const { data, error } = await supabase.from('storage_locations').insert({ ...formData, organization_id: currentOrg.id }).select().single()
    if (!error && data) { setShowAdd(false); fetchAll(); setActiveLocation(data) }
    return { error }
  }

  async function updateLocation(id, updates) {
    await supabase.from('storage_locations').update(updates).eq('id', id)
    setEditingLocation(null); fetchAll()
  }

  async function toggleSupplyRoom(id, current) {
    await supabase.from('storage_locations').update({ is_supply_room: !current }).eq('id', id)
    fetchAll()
  }

  async function deleteLocation(id) {
    const locStock = stock.filter(s => s.storage_location_id === id)
    if (locStock.length > 0) {
      if (!confirm('This location has stocked items. Deleting removes all stock records. Continue?')) return
      await supabase.from('location_stock').delete().eq('storage_location_id', id)
    } else {
      if (!confirm('Delete this location?')) return
    }
    await supabase.from('storage_locations').delete().eq('id', id)
    if (activeLocation?.id === id) setActiveLocation(null)
    fetchAll()
  }

  async function addStockItem(locationId, equipmentItemId, quantity, targetQuantity) {
    const { data, error } = await supabase.from('location_stock').insert({
      organization_id: currentOrg.id, storage_location_id: locationId,
      equipment_item_id: equipmentItemId, quantity: parseInt(quantity) || 0,
      target_quantity: parseInt(targetQuantity) || null
    }).select()
    if (!error) fetchAll()
    return { error }
  }

  async function removeStockItem(stockId) {
    await supabase.from('location_stock').delete().eq('id', stockId)
    fetchAll()
  }

  async function transferItem(fromLocId, toLocId, equipItemId, qty) {
    const fromStock = stock.find(s => s.storage_location_id === fromLocId && s.equipment_item_id === equipItemId)
    const toStock = stock.find(s => s.storage_location_id === toLocId && s.equipment_item_id === equipItemId)
    if (!fromStock || fromStock.quantity < qty) return { error: { message: 'Not enough stock at source' } }
    await supabase.from('location_stock').update({ quantity: fromStock.quantity - qty }).eq('id', fromStock.id)
    if (toStock) {
      await supabase.from('location_stock').update({ quantity: toStock.quantity + qty }).eq('id', toStock.id)
    } else {
      await supabase.from('location_stock').insert({
        organization_id: currentOrg.id, storage_location_id: toLocId,
        equipment_item_id: equipItemId, quantity: qty
      })
    }
    fetchAll()
    return { error: null }
  }

  function switchLocation(loc) {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Switch anyway?')) return
    }
    setActiveLocation(loc); setLocalStock({}); setHasChanges(false); setSaveMessage('')
  }

  function getLocalQty(stockId, orig) { return localStock[stockId]?.quantity ?? orig }
  function getLocalTarget(stockId, orig) { return localStock[stockId]?.target ?? orig ?? '' }

  function updateLocalQty(stockId, value) {
    setLocalStock(prev => ({ ...prev, [stockId]: { ...prev[stockId], quantity: Math.max(0, parseInt(value) || 0) } }))
    setHasChanges(true)
  }
  function updateLocalTarget(stockId, value) {
    setLocalStock(prev => ({ ...prev, [stockId]: { ...prev[stockId], target: value } }))
    setHasChanges(true)
  }

  async function saveAllChanges() {
    const updates = Object.entries(localStock).map(([stockId, changes]) => {
      const d = {}
      if (changes.quantity !== undefined) d.quantity = changes.quantity
      if (changes.target !== undefined) d.target_quantity = parseInt(changes.target) || null
      return supabase.from('location_stock').update(d).eq('id', stockId)
    })
    await Promise.all(updates)
    setLocalStock({}); setHasChanges(false)
    setSaveMessage('Saved!'); setTimeout(() => setSaveMessage(''), 2000)
    fetchAll()
  }

  function getLocationStock(locId) { return stock.filter(s => s.storage_location_id === locId) }
  function getLocationTotalQty(locId) { return getLocationStock(locId).reduce((sum, s) => sum + s.quantity, 0) }
  function getLocationNeedsRestock(locId) { return getLocationStock(locId).filter(s => s.target_quantity && s.quantity < s.target_quantity).length }
  function getItemsNotInLocation(locId) { const ids = getLocationStock(locId).map(s => s.equipment_item_id); return equipment.filter(e => !ids.includes(e.id)) }

  function getItemTotalAcrossLocations(itemId) { return stock.filter(s => s.equipment_item_id === itemId).reduce((sum, s) => sum + s.quantity, 0) }
  function getItemInventoryQty(itemId) { const item = equipment.find(e => e.id === itemId); return item?.quantity || 0 }
  function getItemUnallocated(itemId) { return Math.max(0, getItemInventoryQty(itemId) - getItemTotalAcrossLocations(itemId)) }

  const supplyRoom = locations.find(l => l.is_supply_room)
  const totalStocked = stock.reduce((s, r) => s + r.quantity, 0)
  const totalInventory = equipment.reduce((s, e) => s + e.quantity, 0)
  const totalUnallocated = totalInventory - totalStocked

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>Storage locations</h1>
            <p className="text-muted">{locations.length} locations · {totalStocked} allocated · {totalUnallocated > 0 ? `${totalUnallocated} unallocated` : 'all allocated'}</p>
          </div>
          <div className="header-actions">
            {locations.length > 1 && <button className="btn-secondary" onClick={() => setShowTransfer(true)}>Transfer</button>}
            <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add location</button>
          </div>
        </div>

        {loading ? <div className="loading-state">Loading...</div> : (
          <div className="locations-layout">
            <div className="locations-list-panel">
              {locations.map(loc => {
                const totalQty = getLocationTotalQty(loc.id)
                const needsRestock = getLocationNeedsRestock(loc.id)
                const stockCount = getLocationStock(loc.id).length
                return (
                  <div key={loc.id} className={`loc-card ${activeLocation?.id === loc.id ? 'loc-card-active' : ''} ${loc.is_supply_room ? 'loc-card-supply' : ''}`} onClick={() => switchLocation(loc)}>
                    <div className="loc-card-top">
                      <div>
                        <strong>{loc.name}</strong>
                        {loc.is_supply_room && <span className="supply-badge">Supply room</span>}
                        {loc.location_type && !loc.is_supply_room && <span className="badge badge-neutral" style={{ marginLeft: '0.5rem' }}>{loc.location_type}</span>}
                      </div>
                      <div className="loc-card-actions">
                        <button className="btn-icon-sm" onClick={e => { e.stopPropagation(); toggleSupplyRoom(loc.id, loc.is_supply_room) }} title="Toggle supply room" style={{ color: loc.is_supply_room ? 'var(--gold-500)' : undefined }}>★</button>
                        <button className="btn-icon-sm" onClick={e => { e.stopPropagation(); setEditingLocation(loc) }} title="Edit">✎</button>
                        <button className="btn-icon-sm btn-icon-danger" onClick={e => { e.stopPropagation(); deleteLocation(loc.id) }} title="Delete">✕</button>
                      </div>
                    </div>
                    {loc.description && <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{loc.description}</p>}
                    <div className="loc-card-stats">
                      <span className="loc-stat">{stockCount} items · {totalQty} qty</span>
                      {needsRestock > 0 && <span className="loc-restock-badge">{needsRestock} need restock</span>}
                    </div>
                  </div>
                )
              })}
              {locations.length === 0 && <div className="empty-state"><p>Add your storage locations.</p></div>}
            </div>

            {activeLocation && (
              <div className="loc-detail-panel">
                <div className="loc-detail-header">
                  <div>
                    <h2>{activeLocation.name}{activeLocation.is_supply_room && <span className="supply-badge" style={{ marginLeft: '0.75rem' }}>Supply room</span>}</h2>
                    <span className="text-muted">{activeLocation.description || activeLocation.location_type || 'Storage location'}</span>
                  </div>
                  <div className="header-actions">
                    {supplyRoom && activeLocation.id !== supplyRoom.id && (
                      <button className="btn-secondary" onClick={() => setShowTransfer(true)}>Transfer from {supplyRoom.name}</button>
                    )}
                    <button className="btn-primary" onClick={() => setShowAddStock(true)}>+ Add items</button>
                  </div>
                </div>

                {getLocationStock(activeLocation.id).length === 0 ? (
                  <div className="empty-state"><p>No items stocked here yet.</p></div>
                ) : (
                  <>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Category</th>
                          <th>Stocked</th>
                          <th>Target</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {getLocationStock(activeLocation.id).map(s => {
                          const currentQty = getLocalQty(s.id, s.quantity)
                          const currentTarget = parseInt(getLocalTarget(s.id, s.target_quantity)) || null
                          const needsRestock = currentTarget && currentQty < currentTarget
                          const overstocked = currentTarget && currentQty > currentTarget
                          return (
                            <tr key={s.id}>
                              <td><strong>{s.equipment_items?.name || 'Unknown'}</strong></td>
                              <td>{s.equipment_items?.equipment_categories?.name || '—'}</td>
                              <td>
                                <div className="qty-controls">
                                  <button className="qty-btn" onClick={() => updateLocalQty(s.id, currentQty - 1)}>−</button>
                                  <input type="number" className="qty-input" value={currentQty} onChange={e => updateLocalQty(s.id, e.target.value)} min="0" />
                                  <button className="qty-btn" onClick={() => updateLocalQty(s.id, currentQty + 1)}>+</button>
                                </div>
                              </td>
                              <td>
                                <input type="number" className="target-input" value={getLocalTarget(s.id, s.target_quantity)} onChange={e => updateLocalTarget(s.id, e.target.value)} placeholder="—" min="0" />
                              </td>
                              <td>
                                {!currentTarget ? <span className="badge badge-neutral">No target</span>
                                  : needsRestock ? <span className="badge badge-restock">Need {currentTarget - currentQty} more</span>
                                  : overstocked ? <span className="badge badge-over">Over by {currentQty - currentTarget}</span>
                                  : <span className="badge badge-good">Stocked</span>}
                              </td>
                              <td><button className="btn-icon-sm btn-icon-danger" onClick={() => removeStockItem(s.id)} title="Remove">✕</button></td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    <div className="loc-summary">
                      <span>Total: {getLocationStock(activeLocation.id).reduce((sum, s) => sum + getLocalQty(s.id, s.quantity), 0)} items</span>
                      {getLocationNeedsRestock(activeLocation.id) > 0 && <span className="loc-restock-badge">{getLocationNeedsRestock(activeLocation.id)} need restocking</span>}
                    </div>

                    {hasChanges && (
                      <div className="save-bar">
                        <span className="text-muted">You have unsaved changes</span>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn-secondary" onClick={() => { setLocalStock({}); setHasChanges(false) }}>Discard</button>
                          <button className="btn-primary" onClick={saveAllChanges}>Save changes</button>
                        </div>
                      </div>
                    )}
                    {saveMessage && <div className="save-msg">{saveMessage}</div>}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {showAdd && <AddLocationModal onAdd={addLocation} onClose={() => setShowAdd(false)} />}
        {editingLocation && <EditLocationModal location={editingLocation} onSave={updateLocation} onClose={() => setEditingLocation(null)} />}
        {showAddStock && activeLocation && (
          <AddStockModal locationId={activeLocation.id} locationName={activeLocation.name} availableItems={getItemsNotInLocation(activeLocation.id)} onAdd={addStockItem} onClose={() => { setShowAddStock(false); fetchAll() }} />
        )}
        {showTransfer && (
          <TransferModal locations={locations} stock={stock} equipment={equipment} supplyRoom={supplyRoom} activeLocation={activeLocation} onTransfer={transferItem} onClose={() => { setShowTransfer(false); fetchAll() }} />
        )}
      </main>
      <style>{styles}</style>
    </div>
  )
}

function TransferModal({ locations, stock, equipment, supplyRoom, activeLocation, onTransfer, onClose }) {
  const [fromId, setFromId] = useState(supplyRoom?.id || '')
  const [toId, setToId] = useState(activeLocation?.id && activeLocation.id !== supplyRoom?.id ? activeLocation.id : '')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState(1)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')

  const fromStock = stock.filter(s => s.storage_location_id === fromId)
  const selectedStock = fromStock.find(s => s.equipment_item_id === itemId)
  const maxQty = selectedStock?.quantity || 0

  function handleItemSelect(eid) {
    setItemId(eid)
    if (eid) {
      const item = equipment.find(eq => eq.id === eid)
      if (item?.storage_location_id) {
        const hasStockThere = stock.some(s => s.equipment_item_id === eid && s.storage_location_id === item.storage_location_id)
        if (hasStockThere) setFromId(item.storage_location_id)
      }
    }
  }

  async function handleTransfer(e) {
    e.preventDefault()
    if (!fromId || !toId || !itemId || qty < 1) { setError('Fill in all fields'); return }
    if (fromId === toId) { setError('Source and destination must be different'); return }
    if (qty > maxQty) { setError(`Only ${maxQty} available at source`); return }
    setSubmitting(true); setError('')
    const { error } = await onTransfer(fromId, toId, itemId, qty)
    if (error) setError(friendlyError(error))
    else { setSuccess(`Transferred ${qty} to ${locations.find(l => l.id === toId)?.name}`); setQty(1); setItemId(''); setTimeout(() => setSuccess(''), 3000) }
    setSubmitting(false)
  }

  const uniqueStockedItems = [...new Map(stock.map(s => [s.equipment_item_id, s])).values()]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Transfer equipment</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
        <form onSubmit={handleTransfer} className="modal-form">
          <div className="form-group">
            <label>Item *</label>
            <select value={itemId} onChange={e => handleItemSelect(e.target.value)}>
              <option value="">Select item...</option>
              {uniqueStockedItems.map(s => <option key={s.equipment_item_id} value={s.equipment_item_id}>{s.equipment_items?.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>From *</label>
              <select value={fromId} onChange={e => { setFromId(e.target.value); setItemId('') }}>
                <option value="">Select source...</option>
                {locations.filter(l => !itemId || stock.some(s => s.equipment_item_id === itemId && s.storage_location_id === l.id)).map(l => <option key={l.id} value={l.id}>{l.name}{l.is_supply_room ? ' (Supply)' : ''}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>To *</label>
              <select value={toId} onChange={e => setToId(e.target.value)}>
                <option value="">Select destination...</option>
                {locations.filter(l => l.id !== fromId).map(l => <option key={l.id} value={l.id}>{l.name}{l.is_supply_room ? ' (Supply)' : ''}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Quantity * {maxQty > 0 && `(max: ${maxQty})`}</label>
            <input type="number" min="1" max={maxQty} value={qty} onChange={e => setQty(parseInt(e.target.value) || 0)} />
          </div>
          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">{success}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Done</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Transferring...' : 'Transfer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddLocationModal({ onAdd, onClose }) {
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [locationType, setLocationType] = useState(''); const [isSupply, setIsSupply] = useState(false); const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false)
  async function handleSubmit(e) { e.preventDefault(); setSubmitting(true); const { error } = await onAdd({ name, description: description || null, location_type: locationType || null, is_supply_room: isSupply }); if (error) setError(friendlyError(error)); setSubmitting(false) }
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Add location</h2><button className="btn-icon" onClick={onClose}>✕</button></div><form onSubmit={handleSubmit} className="modal-form"><div className="form-group"><label>Name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Field 3 Shed" required autoFocus /></div><div className="form-group"><label>Description</label><input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Behind field 3 dugout" /></div><div className="form-group"><label>Type</label><select value={locationType} onChange={e => setLocationType(e.target.value)}><option value="">Select type</option><option value="shed">Shed</option><option value="room">Room</option><option value="closet">Closet</option><option value="garage">Garage</option><option value="other">Other</option></select></div><label className="toggle-label"><input type="checkbox" checked={isSupply} onChange={e => setIsSupply(e.target.checked)} /> This is the main supply room</label>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Adding...' : 'Add location'}</button></div></form></div></div>)
}

function EditLocationModal({ location, onSave, onClose }) {
  const [name, setName] = useState(location.name); const [description, setDescription] = useState(location.description || ''); const [locationType, setLocationType] = useState(location.location_type || '')
  return (<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-header"><h2>Edit location</h2><button className="btn-icon" onClick={onClose}>✕</button></div><div className="modal-form"><div className="form-group"><label>Name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} required /></div><div className="form-group"><label>Description</label><input type="text" value={description} onChange={e => setDescription(e.target.value)} /></div><div className="form-group"><label>Type</label><select value={locationType} onChange={e => setLocationType(e.target.value)}><option value="">Select type</option><option value="shed">Shed</option><option value="room">Room</option><option value="closet">Closet</option><option value="garage">Garage</option><option value="other">Other</option></select></div><div className="modal-actions"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(location.id, { name, description: description || null, location_type: locationType || null })}>Save</button></div></div></div></div>)
}

function AddStockModal({ locationId, locationName, availableItems, onAdd, onClose }) {
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(null)
  const [qty, setQty] = useState(0)
  const [target, setTarget] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const filtered = availableItems.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
  const grouped = {}
  filtered.forEach(item => { const cat = item.equipment_categories?.name || 'Uncategorized'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(item) })

  async function handleAdd() {
    if (!adding) return; setSubmitting(true)
    await onAdd(locationId, adding.id, qty, target)
    setAdding(null); setQty(0); setTarget(''); setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Add items to {locationName}</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
        <div className="modal-form">
          {adding ? (
            <div>
              <h3 style={{ marginBottom: '1rem', color: 'var(--green-800)' }}>{adding.name}</h3>
              <div className="form-row">
                <div className="form-group"><label>Current quantity *</label><input type="number" min="0" value={qty} onChange={e => setQty(parseInt(e.target.value) || 0)} autoFocus /></div>
                <div className="form-group"><label>Target quantity</label><input type="number" min="0" value={target} onChange={e => setTarget(e.target.value)} placeholder="Optional" /></div>
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => { setAdding(null); setQty(0); setTarget('') }}>← Back</button>
                <button className="btn-primary" onClick={handleAdd} disabled={submitting}>{submitting ? 'Adding...' : 'Add to location'}</button>
              </div>
            </div>
          ) : (
            <>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search equipment..." className="search-input" style={{ width: '100%' }} autoFocus />
              {Object.keys(grouped).length === 0 ? (
                <p className="text-muted" style={{ textAlign: 'center', padding: '1rem' }}>{availableItems.length === 0 ? 'All items are already in this location.' : 'No items match.'}</p>
              ) : (
                <div style={{ maxHeight: '400px', overflowY: 'auto', marginTop: '0.5rem' }}>
                  {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([cat, items]) => (
                    <div key={cat}>
                      <div className="stock-cat-header">{cat}</div>
                      {items.map(item => (
                        <div key={item.id} className="stock-item-row" onClick={() => { setAdding(item); setQty(0); setTarget('') }}>
                          <span>{item.name}</span>
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>Click to add →</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <div className="modal-actions"><button className="btn-secondary" onClick={onClose}>Done</button></div>
            </>
          )}
        </div>
      </div>
      <style>{`.modal-wide{max-width:600px}.stock-cat-header{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--gray-500);padding:.75rem 0 .25rem;border-bottom:1px solid var(--gray-100)}.stock-item-row{display:flex;justify-content:space-between;align-items:center;padding:.6rem .25rem;border-bottom:1px solid var(--gray-50);cursor:pointer;border-radius:4px;transition:background .1s}.stock-item-row:hover{background:var(--green-50)}`}</style>
    </div>
  )
}

const styles = `
  .locations-layout { display: flex; gap: 1.5rem; }
  .locations-list-panel { flex: 0 0 300px; display: flex; flex-direction: column; gap: 0.5rem; max-height: calc(100vh - 200px); overflow-y: auto; }
  .loc-card { background: white; border: 1.5px solid var(--gray-200); border-radius: var(--radius-lg); padding: 1rem; cursor: pointer; transition: border-color 0.15s; }
  .loc-card:hover { border-color: var(--green-400); }
  .loc-card-active { border-color: var(--green-600) !important; box-shadow: 0 0 0 2px rgba(58,157,94,0.15); }
  .loc-card-supply { border-left: 3px solid var(--gold-500); }
  .loc-card-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .loc-card-actions { display: flex; gap: 0.25rem; opacity: 0; transition: opacity 0.15s; }
  .loc-card:hover .loc-card-actions { opacity: 1; }
  .loc-card-stats { margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; }
  .loc-stat { font-size: 0.8rem; font-weight: 500; color: var(--green-700); }
  .supply-badge { display: inline-block; background: var(--gold-100); color: #92700c; font-size: 0.7rem; font-weight: 600; padding: 0.1rem 0.45rem; border-radius: 10px; margin-left: 0.4rem; }
  .loc-restock-badge { font-size: 0.7rem; font-weight: 600; background: #ffedd5; color: #f97316; padding: 0.15rem 0.5rem; border-radius: 10px; }
  .loc-detail-panel { flex: 1; background: white; border: 1px solid var(--gray-200); border-radius: var(--radius-lg); padding: 1.5rem; max-height: calc(100vh - 200px); overflow-y: auto; overflow-x: auto; }
  .loc-detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--gray-100); flex-wrap: wrap; gap: 0.5rem; }
  .loc-detail-header h2 { font-size: 1.2rem; font-weight: 600; color: var(--green-800); }
  .qty-controls { display: flex; align-items: center; gap: 0.25rem; }
  .qty-btn { width: 26px; height: 26px; border: 1px solid var(--gray-200); background: white; border-radius: 4px; cursor: pointer; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
  .qty-btn:hover { background: var(--gray-100); border-color: var(--gray-300); }
  .qty-input { width: 50px; padding: 0.2rem; border: 1px solid var(--gray-200); border-radius: 4px; font-size: 0.9rem; font-family: inherit; text-align: center; font-weight: 600; }
  .qty-input:focus { outline: none; border-color: var(--green-500); }
  .target-input { width: 60px; padding: 0.3rem 0.4rem; border: 1px solid var(--gray-200); border-radius: 4px; font-size: 0.85rem; font-family: inherit; text-align: center; }
  .target-input:focus { outline: none; border-color: var(--green-500); }
  .badge-restock { background: #ffedd5; color: #ea580c; }
  .badge-over { background: #dbeafe; color: #2563eb; }
  .badge-good { background: #d4edda; color: #16a34a; }
  .loc-summary { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--gray-100); display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; font-weight: 500; color: var(--gray-600); }
  .save-bar { margin-top: 0.75rem; padding: 0.75rem 1rem; background: var(--green-50); border: 1px solid var(--green-400); border-radius: var(--radius); display: flex; justify-content: space-between; align-items: center; }
  .save-msg { margin-top: 0.5rem; text-align: right; color: var(--green-600); font-weight: 600; font-size: 0.85rem; }
  .btn-icon-sm { background: none; border: none; color: var(--gray-400); cursor: pointer; font-size: 0.85rem; padding: 0.2rem 0.4rem; border-radius: 4px; transition: color 0.15s, background 0.15s; line-height: 1; }
  .btn-icon-sm:hover { color: var(--green-700); background: var(--green-100); }
  .btn-icon-danger:hover { color: var(--red-500) !important; background: var(--red-100) !important; }
  @media (max-width: 768px) { .locations-layout { flex-direction: column; } .locations-list-panel { flex: none; max-height: none; } }
`
