import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { getBagStatusConfig } from '../lib/bagStatus'

export default function TeamBagDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentOrg } = useOrg()
  const { user } = useAuth()
  const { addToast } = useToast()

  const [bag, setBag] = useState(null)
  const [bagItems, setBagItems] = useState([])
  const [locations, setLocations] = useState([])
  const [stockData, setStockData] = useState([])
  const [equipmentItems, setEquipmentItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal states
  const [pickingItem, setPickingItem] = useState(null)
  const [reportingItem, setReportingItem] = useState(null)
  const [showPickup, setShowPickup] = useState(false)
  const [showReturn, setShowReturn] = useState(false)

  useEffect(() => { if (currentOrg && id) fetchAll() }, [currentOrg, id])

  async function fetchAll() {
    setLoading(true)
    const orgId = currentOrg.id
    const [b, bi, l, s, ei, c] = await Promise.all([
      supabase.from('team_bags')
        .select('*, teams(name, divisions(name, sport_types(name))), kit_templates(name), seasons(name), profiles!built_by(full_name)')
        .eq('id', id).single(),
      supabase.from('team_bag_items')
        // FK disambiguator: team_bag_items has TWO FKs to equipment_items
        // (equipment_item_id + replacement_item_id); shorthand raises PGRST201.
        .select('*, equipment_categories(name), equipment_items!team_bag_items_equipment_item_id_fkey(name, brand, item_condition)')
        .eq('team_bag_id', id)
        .order('is_required', { ascending: false }),
      supabase.from('storage_locations').select('*').eq('organization_id', orgId).order('name'),
      supabase.from('location_stock').select('id, equipment_item_id, storage_location_id, quantity').eq('organization_id', orgId),
      supabase.from('equipment_items').select('id, name, brand, item_condition, category_id, case_size').eq('organization_id', orgId),
      supabase.from('equipment_categories').select('*').eq('organization_id', orgId)
    ])
    setBag(b.data)
    setBagItems(bi.data || [])
    setLocations(l.data || [])
    setStockData(s.data || [])
    setEquipmentItems(ei.data || [])
    setCategories(c.data || [])
    setLoading(false)
    if (b.data) document.title = `${b.data.teams?.name || 'Bag'} | My League Board`
  }

  if (loading) return <div className="loading-state" style={{ padding: '3rem' }}>Loading...</div>
  if (!bag) return <div className="empty-state"><p>Bag not found.</p><button className="btn-secondary" onClick={() => navigate('/team-bags')}>Back to bags</button></div>

  const requiredItems = bagItems.filter(i => i.is_required)
  const optionalItems = bagItems.filter(i => !i.is_required)
  const packedCount = bagItems.filter(i => i.is_packed).length
  const totalCount = bagItems.length
  const allRequiredPacked = requiredItems.every(i => i.is_packed)
  const sc = getBagStatusConfig(bag.status)

  function getStockForItem(itemId) {
    return stockData
      .filter(s => s.equipment_item_id === itemId && s.quantity > 0)
      .map(s => ({
        ...s,
        locationName: locations.find(l => l.id === s.storage_location_id)?.name || 'Unknown'
      }))
  }

  function suggestItem(bagItem) {
    const catId = bagItem.category_id
    // If a specific item was pinned in the template, suggest that
    if (bagItem.equipment_item_id) {
      const item = equipmentItems.find(ei => ei.id === bagItem.equipment_item_id)
      if (item) {
        const stock = getStockForItem(item.id)
        const totalAvail = stock.reduce((sum, s) => sum + s.quantity, 0)
        return { item, stock, totalAvail, topLocation: stock[0] }
      }
    }
    // Otherwise find the best available item in this category
    const candidates = equipmentItems
      .filter(ei => ei.category_id === catId)
      .map(ei => {
        const stock = getStockForItem(ei.id)
        const totalAvail = stock.reduce((sum, s) => sum + s.quantity, 0)
        return { item: ei, stock, totalAvail, topLocation: stock[0] }
      })
      .filter(c => c.totalAvail > 0)
      .sort((a, b) => b.totalAvail - a.totalAvail)
    return candidates[0] || null
  }

  async function packItem(bagItemId, equipItemId, fromLocationId) {
    // 1. Mark team_bag_item as packed
    await supabase.from('team_bag_items').update({
      equipment_item_id: equipItemId,
      is_packed: true,
      packed_at: new Date().toISOString()
    }).eq('id', bagItemId)

    // 2. Create consume stock_event (removes from location)
    const bagItem = bagItems.find(bi => bi.id === bagItemId)
    const equipItem = equipmentItems.find(ei => ei.id === equipItemId)
    await supabase.from('stock_events').insert({
      organization_id: currentOrg.id,
      equipment_item_id: equipItemId,
      event_type: 'consume',
      from_location_id: fromLocationId,
      to_location_id: null,
      quantity: 1,
      reason: `Packed into ${bag.teams?.name} bag`,
      notes: bagItem?.equipment_categories?.name || null,
      created_by: user?.id
    })

    addToast(`Packed ${equipItem?.name || 'item'}`)
    fetchAll()
  }

  async function unpackItem(bagItemId) {
    await supabase.from('team_bag_items').update({
      is_packed: false,
      packed_at: null
    }).eq('id', bagItemId)
    addToast('Item unpacked')
    fetchAll()
  }

  async function markBuilt() {
    await supabase.from('team_bags').update({
      status: 'built',
      built_by: user?.id,
      built_at: new Date().toISOString(),
    }).eq('id', bag.id)
    addToast('Bag marked as ready for pickup')
    fetchAll()
  }

  async function markPickedUp(pickedUpByName) {
    if (!pickedUpByName?.trim()) { addToast('Name is required', 'error'); return }
    await supabase.from('team_bags').update({
      status: 'picked_up',
      picked_up_by_name: pickedUpByName.trim(),
      picked_up_at: new Date().toISOString(),
    }).eq('id', bag.id)
    addToast('Pickup recorded')
    setShowPickup(false)
    fetchAll()
  }

  async function reportItem(bagItemId, action, reason) {
    const bagItem = bagItems.find(bi => bi.id === bagItemId)
    if (!bagItem?.equipment_item_id) return

    if (action === 'lost' || action === 'damaged') {
      // Create stock event (no location to deduct from since it's already consumed)
      // Just update the bag item status
      await supabase.from('team_bag_items').update({
        status: action,
        notes: reason || null
      }).eq('id', bagItemId)
      addToast(`Item marked as ${action}`)
    } else if (action === 'swapped') {
      await supabase.from('team_bag_items').update({
        status: 'swapped_out',
        swapped_out_at: new Date().toISOString(),
        swap_reason: reason || null
      }).eq('id', bagItemId)
      addToast('Item marked for swap')
    }
    setReportingItem(null)
    fetchAll()
  }

  async function returnBag(condition) {
    // Mark all active items as returned
    const activeItems = bagItems.filter(i => i.is_packed && i.status !== 'swapped_out' && i.status !== 'lost')
    for (const item of activeItems) {
      if (item.equipment_item_id) {
        // Receive the item back to the first storage location
        const firstLoc = locations[0]
        if (firstLoc) {
          await supabase.from('stock_events').insert({
            organization_id: currentOrg.id,
            equipment_item_id: item.equipment_item_id,
            event_type: 'receive',
            from_location_id: null,
            to_location_id: firstLoc.id,
            quantity: 1,
            reason: `Returned from ${bag.teams?.name} bag`,
            created_by: user?.id
          })
        }
        await supabase.from('team_bag_items').update({
          returned_at: new Date().toISOString()
        }).eq('id', item.id)
      }
    }

    await supabase.from('team_bags').update({
      status: 'returned',
      returned_at: new Date().toISOString(),
      returned_condition: condition || null
    }).eq('id', bag.id)

    addToast('Bag marked as returned')
    setShowReturn(false)
    fetchAll()
  }

  async function deleteBag() {
    if (!confirm('Delete this bag and all its items? This cannot be undone.')) return
    await supabase.from('team_bag_items').delete().eq('team_bag_id', bag.id)
    await supabase.from('team_bags').delete().eq('id', bag.id)
    addToast('Bag deleted')
    navigate('/team-bags')
  }

  return (
    <>
      <button className="btn-secondary" onClick={() => navigate('/team-bags')} style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>← Back to team bags</button>

      <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--green-900)' }}>{bag.teams?.name || 'Unknown team'}</h1>
            <p className="text-muted">{bag.kit_templates?.name} · {bag.seasons?.name}{bag.bag_tag ? ` · Tag: ${bag.bag_tag}` : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className="badge" style={{ backgroundColor: sc.bg, color: sc.color, fontSize: '0.85rem', padding: '0.25rem 0.75rem' }}>{sc.label}</span>
            {bag.status === 'building' && (
              <button className="btn-icon-sm btn-icon-danger" onClick={deleteBag} title="Delete bag">✕</button>
            )}
          </div>
        </div>

        {bag.profiles?.full_name && (
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>
            Built by {bag.profiles.full_name}{bag.built_at ? ` on ${new Date(bag.built_at).toLocaleDateString()}` : ''}
          </p>
        )}
        {bag.picked_up_by_name && (
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>
            Picked up by {bag.picked_up_by_name}{bag.picked_up_at ? ` on ${new Date(bag.picked_up_at).toLocaleDateString()}` : ''}
          </p>
        )}
        {bag.returned_at && (
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>
            Returned on {new Date(bag.returned_at).toLocaleDateString()}{bag.returned_condition ? ` · ${bag.returned_condition}` : ''}
          </p>
        )}

        {/* Progress bar */}
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
            <span className="text-muted">{packedCount} of {totalCount} items packed</span>
            <span style={{ fontWeight: 600, color: 'var(--green-700)' }}>{totalCount > 0 ? Math.round((packedCount / totalCount) * 100) : 0}%</span>
          </div>
          <div style={{ height: '6px', background: 'var(--gray-200)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${totalCount > 0 ? (packedCount / totalCount) * 100 : 0}%`, height: '100%', background: 'var(--green-500)', borderRadius: '3px', transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Action bars */}
      {bag.status === 'building' && allRequiredPacked && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius)', background: 'var(--green-50)', border: '1px solid var(--green-400)', color: 'var(--green-800)', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span>All required items packed!</span>
          <button className="btn-primary" onClick={markBuilt} style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>Mark as ready for pickup</button>
        </div>
      )}
      {bag.status === 'built' && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius)', background: 'var(--blue-100)', border: '1px solid #93bbfd', color: '#1e40af', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span>Bag is ready for pickup.</span>
          <button className="btn-primary" onClick={() => setShowPickup(true)} style={{ fontSize: '0.85rem', padding: '0.4rem 1rem' }}>Record pickup</button>
        </div>
      )}
      {bag.status === 'picked_up' && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius)', background: 'var(--blue-100)', border: '1px solid #93bbfd', color: '#1e40af', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span>Bag is out with the team.</span>
          <button className="btn-small" onClick={() => setShowReturn(true)}>Start return inspection</button>
        </div>
      )}

      {/* Assembly checklist */}
      <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
        {requiredItems.length > 0 && (
          <>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', marginBottom: '0.5rem' }}>
              Required items ({requiredItems.filter(i => i.is_packed).length}/{requiredItems.length})
            </h3>
            {requiredItems.map(bi => (
              <BagItemRow
                key={bi.id}
                bagItem={bi}
                suggestion={suggestItem(bi)}
                bagStatus={bag.status}
                onPack={packItem}
                onUnpack={unpackItem}
                onPickDifferent={() => setPickingItem(bi)}
                onReport={() => setReportingItem(bi)}
              />
            ))}
          </>
        )}
        {optionalItems.length > 0 && (
          <>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', margin: '1rem 0 0.5rem' }}>
              Optional items ({optionalItems.filter(i => i.is_packed).length}/{optionalItems.length})
            </h3>
            {optionalItems.map(bi => (
              <BagItemRow
                key={bi.id}
                bagItem={bi}
                suggestion={suggestItem(bi)}
                bagStatus={bag.status}
                onPack={packItem}
                onUnpack={unpackItem}
                onPickDifferent={() => setPickingItem(bi)}
                onReport={() => setReportingItem(bi)}
              />
            ))}
          </>
        )}
      </div>

      {/* Pick different item modal */}
      {pickingItem && (
        <PickItemModal
          bagItem={pickingItem}
          equipmentItems={equipmentItems}
          stockData={stockData}
          locations={locations}
          onPick={(equipItemId, fromLocId) => { packItem(pickingItem.id, equipItemId, fromLocId); setPickingItem(null) }}
          onClose={() => setPickingItem(null)}
        />
      )}

      {/* Report item modal */}
      {reportingItem && (
        <ReportItemModal
          bagItem={reportingItem}
          onReport={(action, reason) => reportItem(reportingItem.id, action, reason)}
          onClose={() => setReportingItem(null)}
        />
      )}

      {/* Mark assembled / pickup modal */}
      {showPickup && (
        <PickupModal
          onConfirm={markPickedUp}
          onClose={() => setShowPickup(false)}
        />
      )}

      {/* Return inspection modal */}
      {showReturn && (
        <ReturnModal
          onConfirm={returnBag}
          onClose={() => setShowReturn(false)}
        />
      )}

      <style>{detailStyles}</style>
    </>
  )
}

function BagItemRow({ bagItem, suggestion, bagStatus, onPack, onUnpack, onPickDifferent, onReport }) {
  const isPacked = bagItem.is_packed
  const isBuilding = bagStatus === 'building'
  const isPickedUp = bagStatus === 'picked_up'
  const itemStatus = bagItem.status

  return (
    <div className={`bag-item-row ${isPacked ? 'bag-item-packed' : ''} ${itemStatus === 'lost' || itemStatus === 'swapped_out' ? 'bag-item-inactive' : ''}`}>
      <div className="bag-item-check">
        {isPacked ? (
          <span className="bag-check-done">✓</span>
        ) : (
          <span className="bag-check-empty" />
        )}
      </div>
      <div className="bag-item-info">
        <div className="bag-item-name">
          {bagItem.equipment_categories?.name || 'Unknown'}
          <span className={`bag-item-tag ${bagItem.is_required ? 'tag-req' : 'tag-opt'}`}>
            {bagItem.is_required ? 'req' : 'opt'}
          </span>
          {itemStatus && itemStatus !== 'active' && (
            <span className="bag-item-tag tag-status">{itemStatus.replace('_', ' ')}</span>
          )}
        </div>
        {isPacked && bagItem.equipment_items && (
          <div className="bag-item-detail">
            {bagItem.equipment_items.name}
            {bagItem.equipment_items.brand && ` (${bagItem.equipment_items.brand})`}
            {bagItem.equipment_items.item_condition && ` · ${bagItem.equipment_items.item_condition}`}
          </div>
        )}
        {!isPacked && isBuilding && suggestion && (
          <div className="bag-item-suggestion">
            Suggested: {suggestion.item.name}
            {suggestion.item.brand && `, ${suggestion.item.brand}`}
            {suggestion.item.item_condition && `, ${suggestion.item.item_condition}`}
            {suggestion.topLocation && ` · ${suggestion.topLocation.locationName} (${suggestion.totalAvail} avail)`}
          </div>
        )}
        {!isPacked && isBuilding && !suggestion && (
          <div className="bag-item-suggestion bag-item-warning">No stock available in this category</div>
        )}
        {bagItem.notes && <div className="bag-item-note">{bagItem.notes}</div>}
      </div>
      <div className="bag-item-actions">
        {isBuilding && !isPacked && suggestion && (
          <>
            <button className="btn-small" onClick={() => onPack(bagItem.id, suggestion.item.id, suggestion.topLocation?.storage_location_id)}>
              Pack this
            </button>
            <button className="btn-small bag-btn-alt" onClick={onPickDifferent}>Pick different</button>
          </>
        )}
        {isBuilding && !isPacked && !suggestion && (
          <button className="btn-small bag-btn-alt" onClick={onPickDifferent}>Pick manually</button>
        )}
        {isBuilding && isPacked && (
          <button className="btn-small bag-btn-alt" onClick={() => onUnpack(bagItem.id)}>Unpack</button>
        )}
        {isPickedUp && isPacked && !itemStatus && (
          <button className="btn-small bag-btn-alt" onClick={onReport}>Report</button>
        )}
      </div>
    </div>
  )
}

function PickItemModal({ bagItem, equipmentItems, stockData, locations, onPick, onClose }) {
  const [selectedItemId, setSelectedItemId] = useState('')
  const [selectedLocId, setSelectedLocId] = useState('')

  const candidates = equipmentItems.filter(ei => ei.category_id === bagItem.category_id)
  const candidatesWithStock = candidates.map(ei => {
    const stock = stockData
      .filter(s => s.equipment_item_id === ei.id && s.quantity > 0)
      .map(s => ({ ...s, locationName: locations.find(l => l.id === s.storage_location_id)?.name || 'Unknown' }))
    return { ...ei, stock, totalAvail: stock.reduce((sum, s) => sum + s.quantity, 0) }
  }).sort((a, b) => b.totalAvail - a.totalAvail)

  const selectedItem = candidatesWithStock.find(c => c.id === selectedItemId)
  const availableStock = selectedItem?.stock || []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '540px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Pick: {bagItem.equipment_categories?.name}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form">
          <div className="form-group">
            <label>Item</label>
            <select value={selectedItemId} onChange={e => { setSelectedItemId(e.target.value); setSelectedLocId('') }}>
              <option value="">Select item...</option>
              {candidatesWithStock.map(c => (
                <option key={c.id} value={c.id} disabled={c.totalAvail === 0}>
                  {c.name}{c.brand ? ` (${c.brand})` : ''} — {c.totalAvail} avail{c.item_condition ? `, ${c.item_condition}` : ''}
                </option>
              ))}
            </select>
          </div>
          {selectedItemId && (
            <div className="form-group">
              <label>From location</label>
              <select value={selectedLocId} onChange={e => setSelectedLocId(e.target.value)} required>
                <option value="">Select location...</option>
                {availableStock.map(s => (
                  <option key={s.storage_location_id} value={s.storage_location_id}>
                    {s.locationName} ({s.quantity} available)
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onPick(selectedItemId, selectedLocId)} disabled={!selectedItemId || !selectedLocId}>Pack this item</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReportItemModal({ bagItem, onReport, onClose }) {
  const [action, setAction] = useState('')
  const [reason, setReason] = useState('')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Report: {bagItem.equipment_categories?.name}</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form">
          <div className="form-group">
            <label>Issue *</label>
            <select value={action} onChange={e => setAction(e.target.value)} required>
              <option value="">Select...</option>
              <option value="lost">Lost</option>
              <option value="damaged">Damaged</option>
              <option value="swapped">Needs swap / replacement</option>
            </select>
          </div>
          <div className="form-group">
            <label>Details</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="What happened?" />
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onReport(action, reason)} disabled={!action}>Submit report</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PickupModal({ onConfirm, onClose }) {
  const [name, setName] = useState('')
  const trimmed = name.trim()

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Record pickup</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form">
          <div className="form-group">
            <label>Picked up by *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Coach name"
              autoFocus
              required
            />
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => onConfirm(trimmed)}
              disabled={!trimmed}
            >Confirm</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReturnModal({ onConfirm, onClose }) {
  const [condition, setCondition] = useState('')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Return inspection</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-form">
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            This will mark all active packed items as returned and receive them back into inventory at your primary storage location.
          </p>
          <div className="form-group">
            <label>Overall condition</label>
            <select value={condition} onChange={e => setCondition(e.target.value)}>
              <option value="">Select...</option>
              <option value="Good - all items present">Good - all items present</option>
              <option value="Missing items">Missing items</option>
              <option value="Damaged items">Damaged items</option>
              <option value="Needs cleaning">Needs cleaning</option>
            </select>
          </div>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onConfirm(condition)}>Complete return</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const detailStyles = `
  .bag-item-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--gray-100);
  }
  .bag-item-row:last-child { border-bottom: none; }
  .bag-item-packed { opacity: 0.7; }
  .bag-item-inactive { opacity: 0.4; }
  .bag-item-check { flex-shrink: 0; margin-top: 0.1rem; }
  .bag-check-done {
    display: flex; align-items: center; justify-content: center;
    width: 22px; height: 22px;
    background: var(--green-600); color: white;
    border-radius: 4px; font-size: 0.75rem; font-weight: 700;
  }
  .bag-check-empty {
    display: block;
    width: 22px; height: 22px;
    border: 1.5px solid var(--gray-300);
    border-radius: 4px;
    background: white;
  }
  .bag-item-info { flex: 1; min-width: 0; }
  .bag-item-name {
    font-size: 0.9rem; font-weight: 500;
    display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
  }
  .bag-item-tag {
    font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 0.1rem 0.35rem; border-radius: 10px; font-weight: 600;
  }
  .tag-req { background: var(--green-100); color: var(--green-700); }
  .tag-opt { background: var(--gray-100); color: var(--gray-500); }
  .tag-status { background: var(--orange-100); color: var(--orange-500); }
  .bag-item-detail {
    font-size: 0.8rem; color: var(--gray-600); margin-top: 0.15rem;
  }
  .bag-item-suggestion {
    font-size: 0.8rem; color: var(--gray-500); margin-top: 0.15rem;
    font-style: italic;
  }
  .bag-item-warning { color: var(--orange-500); font-style: normal; }
  .bag-item-note {
    font-size: 0.75rem; color: var(--gray-400); margin-top: 0.15rem;
    font-style: italic;
  }
  .bag-item-actions {
    display: flex; gap: 0.35rem; flex-shrink: 0; align-items: flex-start;
  }
  .bag-btn-alt {
    background: white !important; color: var(--gray-600) !important;
    border: 1px solid var(--gray-200) !important;
  }
  .bag-btn-alt:hover {
    border-color: var(--green-400) !important; color: var(--green-700) !important;
  }
  .btn-icon-sm { background:none; border:none; color:var(--gray-400); cursor:pointer; font-size:0.85rem; padding:0.2rem 0.4rem; border-radius:4px; transition:color .15s,background .15s; line-height:1; }
  .btn-icon-sm:hover { color:var(--green-700); background:var(--green-100); }
  .btn-icon-danger:hover { color:var(--red-500)!important; background:var(--red-100)!important; }
  @media (max-width: 768px) {
    .bag-item-row { flex-wrap: wrap; }
    .bag-item-actions { width: 100%; margin-left: 2rem; margin-top: 0.5rem; }
  }
`
