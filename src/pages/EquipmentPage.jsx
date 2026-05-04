import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { logActivity } from '../lib/activity'
import { friendlyError } from '../lib/errors'
import { SkeletonList } from '../components/Skeleton'

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

// --- Tree helpers ---

function buildCategoryTree(categories, items) {
  const catMap = {}
  categories.forEach(c => { catMap[c.id] = { ...c, children: [], directCount: 0, totalCount: 0 } })

  // Count items per category
  items.forEach(item => {
    if (item.category_id && catMap[item.category_id]) {
      catMap[item.category_id].directCount++
    }
  })

  // Build parent-child relationships
  const roots = []
  Object.values(catMap).forEach(node => {
    if (node.parent_category_id && catMap[node.parent_category_id]) {
      catMap[node.parent_category_id].children.push(node)
    } else {
      roots.push(node)
    }
  })

  // Sort children by sort_order then name
  function sortChildren(nodes) {
    nodes.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name))
    nodes.forEach(n => sortChildren(n.children))
  }
  sortChildren(roots)

  // Compute totalCount (self + all descendants)
  function computeTotals(node) {
    node.totalCount = node.directCount
    node.children.forEach(child => {
      computeTotals(child)
      node.totalCount += child.totalCount
    })
  }
  roots.forEach(computeTotals)

  return { roots, catMap }
}

function getDescendantIds(node) {
  const ids = [node.id]
  node.children.forEach(child => ids.push(...getDescendantIds(child)))
  return ids
}

function getCategoryPath(catId, catMap) {
  const parts = []
  let current = catMap[catId]
  while (current) {
    parts.unshift(current.name)
    current = current.parent_category_id ? catMap[current.parent_category_id] : null
  }
  return parts
}

// --- Main component ---

export default function EquipmentPage() {
  const navigate = useNavigate()
  const { currentOrg, hasAnyRole } = useOrg()
  const { user } = useAuth()
  const { addToast } = useToast()
  const canEdit = hasAnyRole(['admin', 'equipment_manager'])
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [locations, setLocations] = useState([])
  const [stockData, setStockData] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState(null) // null = ALL
  const [filterBrand, setFilterBrand] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCondition, setFilterCondition] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)
  const [expandedNodes, setExpandedNodes] = useState({})
  const [showMobileTree, setShowMobileTree] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  // Stock event action modals
  const [receiveItem, setReceiveItem] = useState(null)
  const [transferItem, setTransferItem] = useState(null)
  const [removeItem, setRemoveItem] = useState(null)
  const [auditItem, setAuditItem] = useState(null)
  const [historyItem, setHistoryItem] = useState(null)
  const [openActionMenu, setOpenActionMenu] = useState(null)

  useEffect(() => { document.title = 'Equipment | My League Board' }, [])
  useEffect(() => { if (currentOrg) fetchAll() }, [currentOrg])
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault()
        document.querySelector('.eq-search-input')?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function fetchAll() {
    setLoading(true)
    const orgId = currentOrg.id
    const [i, c, l, s] = await Promise.all([
      supabase.from('equipment_items').select('*, equipment_categories(name, parent_category_id), storage_locations!storage_location_id(name)').eq('organization_id', orgId).order('created_at', { ascending: false }),
      supabase.from('equipment_categories').select('*').eq('organization_id', orgId).order('sort_order'),
      supabase.from('storage_locations').select('*').eq('organization_id', orgId).order('name'),
      supabase.from('location_stock').select('id, equipment_item_id, storage_location_id, quantity').eq('organization_id', orgId)
    ])
    setItems(i.data || [])
    setCategories(c.data || [])
    setLocations(l.data || [])
    setStockData(s.data || [])
    setLoading(false)

    // Auto-expand first two levels
    if (c.data) {
      const expanded = {}
      c.data.forEach(cat => {
        if (!cat.parent_category_id) expanded[cat.id] = true
        // Also expand second level
        c.data.forEach(child => {
          if (child.parent_category_id === cat.id && !cat.parent_category_id) {
            expanded[child.id] = true
          }
        })
      })
      setExpandedNodes(expanded)
    }
  }

  // Build tree with memoization
  const { roots: treeRoots, catMap } = useMemo(
    () => buildCategoryTree(categories, items),
    [categories, items]
  )

  // Get all category IDs in the selected subtree
  const isUncategorized = selectedCategoryId === '__uncategorized__'
  const selectedSubtreeIds = useMemo(() => {
    if (!selectedCategoryId || isUncategorized) return null
    const node = catMap[selectedCategoryId]
    return node ? new Set(getDescendantIds(node)) : null
  }, [selectedCategoryId, catMap, isUncategorized])

  // All distinct brands
  const allBrands = useMemo(() => {
    const brands = new Set()
    items.forEach(item => { if (item.brand) brands.add(item.brand) })
    return [...brands].sort()
  }, [items])

  function getItemStockedQty(itemId) {
    return stockData.filter(s => s.equipment_item_id === itemId).reduce((sum, s) => sum + s.quantity, 0)
  }

  // Filter items
  const filtered = useMemo(() => {
    return items.filter(item => {
      if (isUncategorized && item.category_id) return false
      if (selectedSubtreeIds && (!item.category_id || !selectedSubtreeIds.has(item.category_id))) return false
      if (filterBrand && item.brand !== filterBrand) return false
      if (filterStatus && item.status !== filterStatus) return false
      if (filterCondition && item.item_condition !== filterCondition) return false
      if (filterLocation) {
        if (filterLocation === 'unassigned') {
          if (item.storage_location_id) return false
        } else if (item.storage_location_id !== filterLocation) return false
      }
      if (searchTerm && !item.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
      return true
    })
  }, [items, selectedSubtreeIds, filterBrand, filterStatus, filterCondition, filterLocation, searchTerm])

  // Summary stats for selected category
  const summary = useMemo(() => {
    const brandCounts = {}
    const locationCounts = {}
    const conditionCounts = {}
    let totalQty = 0

    filtered.forEach(item => {
      const qty = getItemStockedQty(item.id) || item.quantity
      totalQty += qty
      if (item.brand) brandCounts[item.brand] = (brandCounts[item.brand] || 0) + qty
      if (item.item_condition) conditionCounts[item.item_condition] = (conditionCounts[item.item_condition] || 0) + qty
    })

    // Location breakdown from stock data for filtered items
    const filteredItemIds = new Set(filtered.map(i => i.id))
    stockData.forEach(s => {
      if (filteredItemIds.has(s.equipment_item_id)) {
        const loc = locations.find(l => l.id === s.storage_location_id)
        const locName = loc?.name || 'Unknown'
        locationCounts[locName] = (locationCounts[locName] || 0) + s.quantity
      }
    })

    return { totalQty, brandCounts, locationCounts, conditionCounts, itemCount: filtered.length }
  }, [filtered, stockData, locations])

  const stockTotal = stockData.reduce((s, r) => s + r.quantity, 0)
  const globalTotalQty = stockTotal > 0 ? stockTotal : items.reduce((s, i) => s + i.quantity, 0)

  // Breadcrumb path for selected category
  const selectedPath = useMemo(() => {
    if (!selectedCategoryId) return ['All']
    return getCategoryPath(selectedCategoryId, catMap)
  }, [selectedCategoryId, catMap])

  function toggleExpand(nodeId) {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }))
  }

  function selectCategory(catId) {
    setSelectedCategoryId(catId)
    setShowMobileTree(false)
  }

  const hasActiveFilters = searchTerm || filterBrand || filterStatus || filterCondition || filterLocation
  const activeFilterCount = [filterBrand, filterStatus, filterCondition, filterLocation].filter(Boolean).length + (searchTerm ? 1 : 0)

  function clearFilters() {
    setSearchTerm('')
    setFilterBrand('')
    setFilterStatus('')
    setFilterCondition('')
    setFilterLocation('')
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
    const headers = ['Name', 'Path', 'Brand', 'Quantity', 'Condition', 'Status', 'Tag #', 'Notes']
    const rows = filtered.map(item => {
      const path = item.category_id && catMap[item.category_id]
        ? getCategoryPath(item.category_id, catMap).join(' / ')
        : ''
      return [
        item.name, path, item.brand || '',
        getItemStockedQty(item.id) || item.quantity,
        item.item_condition || '', item.status || '',
        item.tag_number || '', item.notes || ''
      ]
    })
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

  // Compact breadcrumb path for table — skip the top-level ancestor if it's redundant in context
  function compactPath(catId) {
    if (!catId || !catMap[catId]) return '—'
    const parts = getCategoryPath(catId, catMap)
    // If selected category is an ancestor, skip parts up to and including it
    if (selectedCategoryId) {
      const selPath = getCategoryPath(selectedCategoryId, catMap)
      if (parts.length > selPath.length) {
        const trimmed = parts.slice(selPath.length)
        if (trimmed.length > 0) return trimmed.join(' / ')
      }
    }
    // Otherwise show full but compact (skip root if > 2 levels deep)
    if (parts.length > 2) return parts.slice(1).join(' / ')
    return parts.join(' / ')
  }

  const cc = { 'new':'#16a34a','good':'#22c55e','fair':'#eab308','worn':'#f97316','damaged':'#ef4444','broken':'#dc2626','needs_repair':'#dc2626','retired':'#6b7280' }
  const sc = { 'available':'#16a34a','assigned':'#3b82f6','in_repair':'#f97316','lost':'#dc2626','retired':'#6b7280' }

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Equipment inventory</h1>
          <p className="text-muted">{items.length} items · {globalTotalQty} stocked</p>
        </div>
        <div className="header-actions">
          {canEdit && <button className="btn-secondary" onClick={exportCSV}>Export CSV</button>}
          {canEdit && <button className="btn-secondary" onClick={() => setReceiveItem({})}>+ Receive</button>}
          {canEdit && <button className="btn-primary" onClick={() => setShowAddModal(true)}>+ Add equipment</button>}
        </div>
      </div>

      {/* Mobile breadcrumb picker */}
      <div className="eq-mobile-breadcrumb">
        <button className="eq-mobile-browse-btn" onClick={() => setShowMobileTree(true)}>
          Browse: {selectedPath.join(' > ')} ▾
        </button>
        <button
          className="eq-mobile-filter-btn"
          onClick={() => setShowMobileFilters(true)}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>

      {/* Main layout: sidebar tree + content */}
      <div className="eq-layout">
        {/* Desktop sidebar tree */}
        <aside className="eq-sidebar">
          <div className="eq-tree-header">Categories</div>
          <button
            className={`eq-tree-node eq-tree-root ${selectedCategoryId === null ? 'eq-tree-selected' : ''}`}
            onClick={() => selectCategory(null)}
          >
            All ({items.length})
          </button>
          {treeRoots.map(node => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedCategoryId}
              expandedNodes={expandedNodes}
              onSelect={selectCategory}
              onToggle={toggleExpand}
            />
          ))}
          {/* Uncategorized */}
          {items.some(i => !i.category_id) && (
            <button
              className={`eq-tree-node ${selectedCategoryId === '__uncategorized__' ? 'eq-tree-selected' : ''}`}
              style={{ paddingLeft: '0.75rem' }}
              onClick={() => setSelectedCategoryId('__uncategorized__')}
            >
              Uncategorized ({items.filter(i => !i.category_id).length})
            </button>
          )}
        </aside>

        {/* Right content pane */}
        <div className="eq-content">
          {/* Summary card */}
          <div className="eq-summary-card">
            <div className="eq-summary-path">{selectedPath.join(' > ')}</div>
            <div className="eq-summary-count">{summary.itemCount} items · {summary.totalQty} stocked</div>
            {Object.keys(summary.brandCounts).length > 0 && (
              <div className="eq-summary-row">
                <span className="eq-summary-label">Brand:</span>
                <div className="eq-summary-chips">
                  {Object.entries(summary.brandCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([brand, qty]) => (
                    <span key={brand} className="eq-chip">{brand} {qty}</span>
                  ))}
                </div>
              </div>
            )}
            {Object.keys(summary.locationCounts).length > 0 && (
              <div className="eq-summary-row">
                <span className="eq-summary-label">Location:</span>
                <div className="eq-summary-chips">
                  {Object.entries(summary.locationCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([loc, qty]) => (
                    <span key={loc} className="eq-chip">{loc} {qty}</span>
                  ))}
                </div>
              </div>
            )}
            {Object.keys(summary.conditionCounts).length > 0 && (
              <div className="eq-summary-row">
                <span className="eq-summary-label">Condition:</span>
                <div className="eq-summary-chips">
                  {Object.entries(summary.conditionCounts).sort((a, b) => b[1] - a[1]).map(([cond, qty]) => (
                    <span key={cond} className="eq-chip">{cond.replace('_', ' ')} {qty}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Filters bar (desktop) */}
          <div className="eq-filters-bar">
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
              <option value="">All brands</option>
              {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
              <option value="">All locations</option>
              <option value="unassigned">Unassigned</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={filterCondition} onChange={e => setFilterCondition(e.target.value)}>
              <option value="">All conditions</option>
              <option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option>
              <option value="worn">Worn</option><option value="damaged">Damaged</option><option value="broken">Broken</option>
              <option value="needs_repair">Needs repair</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="available">Available</option><option value="assigned">Assigned</option>
              <option value="in_repair">In repair</option><option value="lost">Lost</option><option value="retired">Retired</option>
            </select>
            <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="eq-search-input" />
            {hasActiveFilters && (
              <button onClick={clearFilters} className="eq-clear-filters">Clear</button>
            )}
          </div>

          {/* Table */}
          {loading ? (
            <div className="loading-state"><div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }}></div></div>
          ) : filtered.length === 0 ? (
            items.length === 0 ? (
              <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
                <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No equipment added yet.</p>
                <p className="text-muted" style={{ marginBottom: '1.25rem' }}>Inventory is where every piece of league equipment lives — bats, helmets, first-aid supplies, anything you need to track.</p>
                {canEdit && <button className="btn-primary" onClick={() => setShowAddModal(true)}>+ Add equipment</button>}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                <p>No items match your filters.</p>
                <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Try widening your search or clearing a filter.</p>
              </div>
            )
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Path</th>
                    <th>Brand</th>
                    <th>Qty</th>
                    <th>Condition</th>
                    <th>Status</th>
                    <th>Tag</th>
                    {canEdit && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} onClick={() => setSelectedItem(item)} style={{ cursor: 'pointer' }}>
                      <td className="item-name">
                        <strong>{item.name}</strong>
                        {item.model && <span className="item-detail">{item.model}</span>}
                        {item.size && <span className="item-detail">{item.size}</span>}
                      </td>
                      <td className="text-muted" style={{ fontSize: '0.8rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {compactPath(item.category_id)}
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{item.brand || '—'}</td>
                      <td>{getItemStockedQty(item.id) || item.quantity}</td>
                      <td><span className="badge" style={{ backgroundColor: (cc[item.item_condition] || '#6b7280') + '20', color: cc[item.item_condition] || '#6b7280' }}>{(item.item_condition || '').replace('_', ' ')}</span></td>
                      <td><span className="badge" style={{ backgroundColor: (sc[item.status] || '#6b7280') + '20', color: sc[item.status] || '#6b7280' }}>{(item.status || '').replace('_', ' ')}</span></td>
                      <td className="text-muted" style={{ fontSize: '0.8rem' }}>{item.tag_number || '—'}</td>
                      {canEdit && (
                        <td>
                          <div className="eq-row-actions">
                            <button className="btn-icon-sm" onClick={e => { e.stopPropagation(); setEditingItem(item) }} title="Edit">✎</button>
                            <div className="eq-action-menu-wrap">
                              <button className="btn-icon-sm" onClick={e => { e.stopPropagation(); setOpenActionMenu(openActionMenu === item.id ? null : item.id) }} title="Actions">⋯</button>
                              {openActionMenu === item.id && (
                                <div className="eq-action-dropdown" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => { setReceiveItem(item); setOpenActionMenu(null) }}>+ Receive</button>
                                  <button onClick={() => { setTransferItem(item); setOpenActionMenu(null) }}>→ Transfer</button>
                                  <button onClick={() => { setRemoveItem(item); setOpenActionMenu(null) }}>− Remove</button>
                                  <button onClick={() => { setAuditItem(item); setOpenActionMenu(null) }}>☑ Audit</button>
                                  <button onClick={() => { setHistoryItem(item); setOpenActionMenu(null) }}>↕ History</button>
                                  <button onClick={() => { setOpenActionMenu(null); navigate(`/tickets/new?equipment_item_id=${item.id}`) }}>🎫 Report issue</button>
                                  <div className="eq-action-divider" />
                                  <button className="eq-action-danger" onClick={() => { deleteItem(item.id); setOpenActionMenu(null) }}>✕ Delete</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Mobile tree picker overlay */}
      {showMobileTree && (
        <div className="eq-mobile-overlay" onClick={() => setShowMobileTree(false)}>
          <div className="eq-mobile-sheet" onClick={e => e.stopPropagation()}>
            <div className="eq-mobile-sheet-header">
              <h3>Browse categories</h3>
              <button className="btn-icon" onClick={() => setShowMobileTree(false)} aria-label="Close categories panel">✕</button>
            </div>
            <div className="eq-mobile-sheet-body">
              <button
                className={`eq-tree-node eq-tree-root ${selectedCategoryId === null ? 'eq-tree-selected' : ''}`}
                onClick={() => selectCategory(null)}
              >
                All ({items.length})
              </button>
              {treeRoots.map(node => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedCategoryId}
                  expandedNodes={expandedNodes}
                  onSelect={selectCategory}
                  onToggle={toggleExpand}
                />
              ))}
              {items.some(i => !i.category_id) && (
                <button
                  className={`eq-tree-node ${selectedCategoryId === '__uncategorized__' ? 'eq-tree-selected' : ''}`}
                  style={{ paddingLeft: '0.75rem' }}
                  onClick={() => { setSelectedCategoryId('__uncategorized__'); setShowMobileTree(false) }}
                >
                  Uncategorized ({items.filter(i => !i.category_id).length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile filters bottom sheet */}
      {showMobileFilters && (
        <div className="eq-mobile-overlay" onClick={() => setShowMobileFilters(false)}>
          <div className="eq-mobile-sheet" onClick={e => e.stopPropagation()}>
            <div className="eq-mobile-sheet-header">
              <h3>Filters</h3>
              <button className="btn-icon" onClick={() => setShowMobileFilters(false)} aria-label="Close filters panel">✕</button>
            </div>
            <div className="eq-mobile-sheet-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Brand</label>
                <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
                  <option value="">All brands</option>
                  {allBrands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Location</label>
                <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
                  <option value="">All locations</option>
                  <option value="unassigned">Unassigned</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Condition</label>
                <select value={filterCondition} onChange={e => setFilterCondition(e.target.value)}>
                  <option value="">All conditions</option>
                  <option value="new">New</option><option value="good">Good</option><option value="fair">Fair</option>
                  <option value="worn">Worn</option><option value="damaged">Damaged</option><option value="broken">Broken</option>
                  <option value="needs_repair">Needs repair</option>
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="available">Available</option><option value="assigned">Assigned</option>
                  <option value="in_repair">In repair</option><option value="lost">Lost</option><option value="retired">Retired</option>
                </select>
              </div>
              <div className="form-group">
                <label>Search</label>
                <input type="text" placeholder="Search equipment..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                {hasActiveFilters && <button className="btn-secondary" onClick={clearFilters} style={{ flex: 1 }}>Clear all</button>}
                <button className="btn-primary" onClick={() => setShowMobileFilters(false)} style={{ flex: 1 }}>Apply</button>
              </div>
            </div>
          </div>
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

      {receiveItem && (
        <ReceiveModal
          item={receiveItem.id ? receiveItem : null}
          items={items}
          locations={locations}
          orgId={currentOrg.id}
          userId={user?.id}
          onDone={() => { setReceiveItem(null); fetchAll() }}
          onClose={() => setReceiveItem(null)}
          addToast={addToast}
        />
      )}
      {transferItem && (
        <TransferModal
          item={transferItem}
          locations={locations}
          stockData={stockData}
          orgId={currentOrg.id}
          userId={user?.id}
          onDone={() => { setTransferItem(null); fetchAll() }}
          onClose={() => setTransferItem(null)}
          addToast={addToast}
        />
      )}
      {removeItem && (
        <RemoveModal
          item={removeItem}
          locations={locations}
          stockData={stockData}
          orgId={currentOrg.id}
          userId={user?.id}
          onDone={() => { setRemoveItem(null); fetchAll() }}
          onClose={() => setRemoveItem(null)}
          addToast={addToast}
        />
      )}
      {auditItem && (
        <AuditModal
          item={auditItem}
          locations={locations}
          stockData={stockData}
          orgId={currentOrg.id}
          userId={user?.id}
          onDone={() => { setAuditItem(null); fetchAll() }}
          onClose={() => setAuditItem(null)}
          addToast={addToast}
        />
      )}
      {historyItem && (
        <HistoryModal
          item={historyItem}
          locations={locations}
          orgId={currentOrg.id}
          onClose={() => setHistoryItem(null)}
        />
      )}

      {/* Close action menu on outside click */}
      {openActionMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpenActionMenu(null)} />}

      <style>{equipmentStyles}</style>
    </>
  )
}

// --- Tree node component ---

function TreeNode({ node, depth, selectedId, expandedNodes, onSelect, onToggle }) {
  const hasChildren = node.children.length > 0
  const isExpanded = expandedNodes[node.id]
  const isSelected = selectedId === node.id

  return (
    <>
      <div className={`eq-tree-node ${isSelected ? 'eq-tree-selected' : ''}`} style={{ paddingLeft: `${0.75 + depth * 1}rem` }}>
        {hasChildren ? (
          <button className="eq-tree-toggle" onClick={() => onToggle(node.id)}>
            {isExpanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="eq-tree-toggle-spacer" />
        )}
        <button className="eq-tree-label" onClick={() => onSelect(node.id)}>
          {node.name} <span className="eq-tree-count">({node.totalCount})</span>
        </button>
      </div>
      {hasChildren && isExpanded && node.children.map(child => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expandedNodes={expandedNodes}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </>
  )
}

// --- Styles ---

const equipmentStyles = `
  .eq-layout {
    display: flex;
    gap: 1.25rem;
    align-items: flex-start;
  }
  .eq-sidebar {
    width: 220px;
    flex-shrink: 0;
    background: white;
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-lg);
    padding: 0.5rem 0;
    position: sticky;
    top: 1rem;
    max-height: calc(100vh - 8rem);
    overflow-y: auto;
  }
  .eq-tree-header {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--gray-500);
    padding: 0.5rem 0.75rem 0.25rem;
  }
  .eq-tree-node {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 32px;
    padding: 0.2rem 0.75rem;
    font-size: 0.8rem;
    color: var(--gray-700);
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.1s;
    text-align: left;
  }
  .eq-tree-node:hover {
    background: var(--green-50);
  }
  .eq-tree-root {
    font-weight: 600;
    font-size: 0.85rem;
  }
  .eq-tree-selected {
    background: var(--green-100) !important;
    color: var(--green-800);
    font-weight: 600;
  }
  .eq-tree-toggle {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.55rem;
    color: var(--gray-400);
    width: 16px;
    flex-shrink: 0;
    padding: 0;
    line-height: 1;
    font-family: inherit;
  }
  .eq-tree-toggle:hover {
    color: var(--green-600);
  }
  .eq-tree-toggle-spacer {
    width: 16px;
    flex-shrink: 0;
  }
  .eq-tree-label {
    background: none;
    border: none;
    cursor: pointer;
    font: inherit;
    color: inherit;
    padding: 0.1rem 0;
    text-align: left;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .eq-tree-count {
    color: var(--gray-400);
    font-weight: 400;
    font-size: 0.75rem;
  }
  .eq-content {
    flex: 1;
    min-width: 0;
  }
  .eq-summary-card {
    background: white;
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-lg);
    padding: 1rem 1.25rem;
    margin-bottom: 1rem;
  }
  .eq-summary-path {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--green-800);
    margin-bottom: 0.15rem;
  }
  .eq-summary-count {
    font-size: 0.85rem;
    color: var(--gray-600);
    margin-bottom: 0.5rem;
  }
  .eq-summary-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-top: 0.35rem;
  }
  .eq-summary-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--gray-500);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    min-width: 60px;
    padding-top: 0.15rem;
  }
  .eq-summary-chips {
    display: flex;
    gap: 0.3rem;
    flex-wrap: wrap;
  }
  .eq-chip {
    font-size: 0.7rem;
    padding: 0.1rem 0.45rem;
    background: var(--green-50);
    border: 1px solid var(--green-200);
    border-radius: 10px;
    color: var(--green-700);
    font-weight: 500;
    white-space: nowrap;
  }
  .eq-filters-bar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .eq-filters-bar select {
    padding: 0.4rem 0.6rem;
    border: 1.5px solid var(--gray-200);
    border-radius: var(--radius);
    font-size: 0.8rem;
    font-family: inherit;
    color: var(--gray-700);
    background: white;
  }
  .eq-search-input {
    padding: 0.4rem 0.6rem;
    border: 1.5px solid var(--gray-200);
    border-radius: var(--radius);
    font-size: 0.8rem;
    font-family: inherit;
    min-width: 140px;
  }
  .eq-search-input:focus {
    outline: none;
    border-color: var(--green-500);
  }
  .eq-clear-filters {
    background: none;
    border: none;
    color: var(--green-600);
    cursor: pointer;
    font-size: 0.8rem;
    font-family: inherit;
    font-weight: 500;
  }
  .eq-clear-filters:hover { color: var(--green-800); }

  /* Mobile tree/filter controls */
  .eq-mobile-breadcrumb {
    display: none;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .eq-mobile-browse-btn, .eq-mobile-filter-btn {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1.5px solid var(--gray-200);
    border-radius: var(--radius);
    background: white;
    font-size: 0.8rem;
    font-family: inherit;
    color: var(--gray-700);
    cursor: pointer;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .eq-mobile-filter-btn { flex: none; }
  .eq-mobile-browse-btn:hover, .eq-mobile-filter-btn:hover {
    border-color: var(--green-400);
  }

  .eq-mobile-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .eq-mobile-sheet {
    background: white;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    width: 100%;
    max-width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }
  .eq-mobile-sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--gray-200);
  }
  .eq-mobile-sheet-header h3 {
    font-size: 1rem;
    font-weight: 600;
  }
  .eq-mobile-sheet-body {
    overflow-y: auto;
    padding: 0.5rem 0.5rem 1.5rem;
  }

  .btn-icon-sm { background:none; border:none; color:var(--gray-400); cursor:pointer; font-size:0.85rem; padding:0.2rem 0.4rem; border-radius:4px; transition:color .15s,background .15s; line-height:1; }
  .btn-icon-sm:hover { color:var(--green-700); background:var(--green-100); }
  .btn-icon-danger:hover { color:var(--red-500)!important; background:var(--red-100)!important; }

  .eq-row-actions { display:flex; gap:0.25rem; align-items:center; }
  .eq-action-menu-wrap { position:relative; }
  .eq-action-dropdown {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 50;
    background: white;
    border: 1px solid var(--gray-200);
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    min-width: 150px;
    padding: 0.25rem 0;
  }
  .eq-action-dropdown button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.45rem 0.75rem;
    border: none;
    background: none;
    font-size: 0.8rem;
    font-family: inherit;
    color: var(--gray-700);
    cursor: pointer;
  }
  .eq-action-dropdown button:hover { background: var(--green-50); color: var(--green-800); }
  .eq-action-divider { height: 1px; background: var(--gray-200); margin: 0.25rem 0; }
  .eq-action-danger { color: var(--red-500) !important; }
  .eq-action-danger:hover { background: var(--red-100) !important; color: var(--red-500) !important; }

  @media (max-width: 1023px) {
    .eq-sidebar { display: none; }
    .eq-mobile-breadcrumb { display: flex; }
    .eq-filters-bar { display: none; }
    .eq-tree-node { min-height: 44px; }
  }
`

// =================================================================
// Stock event action modals
// =================================================================

function ReceiveModal({ item, items, locations, orgId, userId, onDone, onClose, addToast }) {
  const [selectedItemId, setSelectedItemId] = useState(item?.id || '')
  const [toLocationId, setToLocationId] = useState('')
  const [cases, setCases] = useState(0)
  const [loose, setLoose] = useState(0)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const selectedItem = items.find(i => i.id === selectedItemId)
  const caseSize = selectedItem?.case_size || 1
  const total = (cases * caseSize) + loose

  const filteredItems = searchTerm
    ? items.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : items

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedItemId || !toLocationId || total < 1) return
    setSubmitting(true)
    const { error } = await supabase.from('stock_events').insert({
      organization_id: orgId,
      equipment_item_id: selectedItemId,
      event_type: 'receive',
      to_location_id: toLocationId,
      from_location_id: null,
      quantity: total,
      notes: notes || null,
      created_by: userId
    })
    setSubmitting(false)
    if (error) { addToast(friendlyError(error), 'error'); return }
    addToast(`Received ${total} units`)
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Receive stock</h2><button className="btn-icon" onClick={onClose} aria-label="Close">✕</button></div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Item</label>
            {item ? (
              <input type="text" value={item.name} disabled />
            ) : (
              <>
                <input type="text" placeholder="Search items..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                <select value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}>
                  <option value="">Select item...</option>
                  {filteredItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </>
            )}
          </div>
          <div className="form-group">
            <label>To location</label>
            <select value={toLocationId} onChange={e => setToLocationId(e.target.value)} required>
              <option value="">Select location...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Cases{caseSize > 1 ? ` (${caseSize}/case)` : ''}</label>
              <input type="number" min="0" value={cases} onChange={e => setCases(parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-group">
              <label>Loose</label>
              <input type="number" min="0" value={loose} onChange={e => setLoose(parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-group">
              <label>Total</label>
              <input type="text" value={`= ${total} units`} disabled />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting || !selectedItemId || !toLocationId || total < 1}>{submitting ? 'Saving...' : `Receive ${total} units`}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TransferModal({ item, locations, stockData, orgId, userId, onDone, onClose, addToast }) {
  const itemStock = stockData.filter(s => s.equipment_item_id === item.id && s.quantity > 0)
  const [fromLocationId, setFromLocationId] = useState('')
  const [toLocationId, setToLocationId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fromStock = itemStock.find(s => s.storage_location_id === fromLocationId)
  const maxQty = fromStock?.quantity || 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fromLocationId || !toLocationId || quantity < 1 || quantity > maxQty) return
    setSubmitting(true)
    const { error } = await supabase.from('stock_events').insert({
      organization_id: orgId,
      equipment_item_id: item.id,
      event_type: 'transfer',
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      quantity,
      reason: reason || null,
      notes: notes || null,
      created_by: userId
    })
    setSubmitting(false)
    if (error) { addToast(friendlyError(error), 'error'); return }
    addToast(`Transferred ${quantity} units`)
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Transfer: {item.name}</h2><button className="btn-icon" onClick={onClose} aria-label="Close">✕</button></div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>From location</label>
            <select value={fromLocationId} onChange={e => { setFromLocationId(e.target.value); setQuantity(1) }} required>
              <option value="">Select...</option>
              {itemStock.map(s => {
                const loc = locations.find(l => l.id === s.storage_location_id)
                return <option key={s.storage_location_id} value={s.storage_location_id}>{loc?.name || 'Unknown'} ({s.quantity} available)</option>
              })}
            </select>
          </div>
          <div className="form-group">
            <label>To location</label>
            <select value={toLocationId} onChange={e => setToLocationId(e.target.value)} required>
              <option value="">Select...</option>
              {locations.filter(l => l.id !== fromLocationId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Quantity (max {maxQty})</label>
            <input type="number" min="1" max={maxQty} value={quantity} onChange={e => setQuantity(Math.min(parseInt(e.target.value) || 1, maxQty))} required />
          </div>
          <div className="form-group">
            <label>Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)}>
              <option value="">Optional...</option>
              <option value="Restock baseroom">Restock baseroom</option>
              <option value="Game prep">Game prep</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting || !fromLocationId || !toLocationId || quantity < 1}>{submitting ? 'Saving...' : 'Transfer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const REMOVE_REASONS = [
  { label: 'Used in game', eventType: 'consume' },
  { label: 'Lost', eventType: 'consume' },
  { label: 'Damaged', eventType: 'damage' },
  { label: 'Retired / end of life', eventType: 'retire' },
  { label: 'Other', eventType: 'consume' },
]

function RemoveModal({ item, locations, stockData, orgId, userId, onDone, onClose, addToast }) {
  const itemStock = stockData.filter(s => s.equipment_item_id === item.id && s.quantity > 0)
  const [fromLocationId, setFromLocationId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [reasonIdx, setReasonIdx] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fromStock = itemStock.find(s => s.storage_location_id === fromLocationId)
  const maxQty = fromStock?.quantity || 0
  const selectedReason = reasonIdx !== '' ? REMOVE_REASONS[parseInt(reasonIdx)] : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fromLocationId || !selectedReason || quantity < 1 || quantity > maxQty) return
    setSubmitting(true)
    const { error } = await supabase.from('stock_events').insert({
      organization_id: orgId,
      equipment_item_id: item.id,
      event_type: selectedReason.eventType,
      from_location_id: fromLocationId,
      to_location_id: null,
      quantity,
      reason: selectedReason.label,
      notes: notes || null,
      created_by: userId
    })
    setSubmitting(false)
    if (error) { addToast(friendlyError(error), 'error'); return }
    addToast(`Removed ${quantity} units (${selectedReason.label.toLowerCase()})`)
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Remove: {item.name}</h2><button className="btn-icon" onClick={onClose} aria-label="Close">✕</button></div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>From location</label>
            <select value={fromLocationId} onChange={e => { setFromLocationId(e.target.value); setQuantity(1) }} required>
              <option value="">Select...</option>
              {itemStock.map(s => {
                const loc = locations.find(l => l.id === s.storage_location_id)
                return <option key={s.storage_location_id} value={s.storage_location_id}>{loc?.name || 'Unknown'} ({s.quantity} available)</option>
              })}
            </select>
          </div>
          <div className="form-group">
            <label>Quantity (max {maxQty})</label>
            <input type="number" min="1" max={maxQty} value={quantity} onChange={e => setQuantity(Math.min(parseInt(e.target.value) || 1, maxQty))} required />
          </div>
          <div className="form-group">
            <label>Reason *</label>
            <select value={reasonIdx} onChange={e => setReasonIdx(e.target.value)} required>
              <option value="">Select reason...</option>
              {REMOVE_REASONS.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting || !fromLocationId || reasonIdx === '' || quantity < 1}>{submitting ? 'Saving...' : 'Remove'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AuditModal({ item, locations, stockData, orgId, userId, onDone, onClose, addToast }) {
  const itemStock = stockData.filter(s => s.equipment_item_id === item.id)
  const [fromLocationId, setFromLocationId] = useState('')
  const [actualCount, setActualCount] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fromStock = itemStock.find(s => s.storage_location_id === fromLocationId)
  const systemCount = fromStock?.quantity ?? 0
  const delta = actualCount !== '' ? parseInt(actualCount) - systemCount : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!fromLocationId || actualCount === '' || delta === null || delta === 0) return
    setSubmitting(true)
    const { error } = await supabase.from('stock_events').insert({
      organization_id: orgId,
      equipment_item_id: item.id,
      event_type: 'audit',
      from_location_id: fromLocationId,
      to_location_id: null,
      quantity: delta,
      reason: `Physical count: ${actualCount} (was ${systemCount})`,
      notes: notes || null,
      created_by: userId
    })
    setSubmitting(false)
    if (error) { addToast(friendlyError(error), 'error'); return }
    addToast(`Audit recorded: ${delta > 0 ? '+' : ''}${delta}`)
    onDone()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Audit: {item.name}</h2><button className="btn-icon" onClick={onClose} aria-label="Close">✕</button></div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Location</label>
            <select value={fromLocationId} onChange={e => { setFromLocationId(e.target.value); setActualCount('') }} required>
              <option value="">Select...</option>
              {itemStock.map(s => {
                const loc = locations.find(l => l.id === s.storage_location_id)
                return <option key={s.storage_location_id} value={s.storage_location_id}>{loc?.name || 'Unknown'} (system: {s.quantity})</option>
              })}
              {locations.filter(l => !itemStock.some(s => s.storage_location_id === l.id)).map(l => (
                <option key={l.id} value={l.id}>{l.name} (system: 0)</option>
              ))}
            </select>
          </div>
          {fromLocationId && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>System count</label>
                  <input type="text" value={systemCount} disabled />
                </div>
                <div className="form-group">
                  <label>Actual count</label>
                  <input type="number" min="0" value={actualCount} onChange={e => setActualCount(e.target.value)} placeholder="Enter physical count" required />
                </div>
              </div>
              {delta !== null && delta !== 0 && (
                <div style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)', background: delta > 0 ? 'var(--green-50)' : 'var(--red-100)', color: delta > 0 ? 'var(--green-700)' : 'var(--red-500)', fontSize: '0.85rem', fontWeight: 600 }}>
                  Delta: {delta > 0 ? '+' : ''}{delta} units
                </div>
              )}
              {delta === 0 && actualCount !== '' && (
                <div style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--radius)', background: 'var(--gray-100)', color: 'var(--gray-600)', fontSize: '0.85rem' }}>
                  Counts match — no adjustment needed
                </div>
              )}
            </>
          )}
          <div className="form-group">
            <label>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="E.g., Found 2 extra behind catchers gear" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting || !fromLocationId || delta === null || delta === 0}>{submitting ? 'Saving...' : 'Record audit'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function HistoryModal({ item, locations, orgId, onClose }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('stock_events')
      .select('*, profiles:created_by(full_name)')
      .eq('equipment_item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) {
          // profiles join may fail — retry without it
          supabase.from('stock_events')
            .select('*')
            .eq('equipment_item_id', item.id)
            .order('created_at', { ascending: false })
            .limit(20)
            .then(({ data: d2 }) => { setEvents(d2 || []); setLoading(false) })
        } else {
          setEvents(data || [])
          setLoading(false)
        }
      })
  }, [item.id])

  function locName(id) {
    if (!id) return '—'
    const l = locations.find(loc => loc.id === id)
    return l?.name || 'Unknown'
  }

  const typeColors = {
    receive: '#16a34a', transfer: '#3b82f6', consume: '#f97316',
    damage: '#ef4444', retire: '#6b7280', audit: '#8b5cf6'
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>History: {item.name}</h2><button className="btn-icon" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="modal-form">
          {loading ? (
            <SkeletonList rows={4} rowHeight="2rem" />
          ) : events.length === 0 ? (
            <p className="text-muted">No stock events recorded yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {events.map(ev => (
                <div key={ev.id} style={{ padding: '0.6rem 0.75rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', border: '1px solid var(--gray-100)', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span className="badge" style={{ backgroundColor: (typeColors[ev.event_type] || '#6b7280') + '20', color: typeColors[ev.event_type] || '#6b7280' }}>{ev.event_type}</span>
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>{new Date(ev.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {ev.event_type === 'transfer' ? (
                      <span>{locName(ev.from_location_id)} → {locName(ev.to_location_id)}</span>
                    ) : ev.event_type === 'receive' ? (
                      <span>→ {locName(ev.to_location_id)}</span>
                    ) : (
                      <span>{locName(ev.from_location_id)}</span>
                    )}
                    <span style={{ fontWeight: 600 }}>
                      {ev.event_type === 'audit' ? (ev.quantity > 0 ? '+' : '') + ev.quantity : ev.quantity} units
                    </span>
                  </div>
                  {ev.reason && <div className="text-muted" style={{ marginTop: '0.15rem' }}>{ev.reason}</div>}
                  {ev.notes && <div style={{ marginTop: '0.15rem', fontStyle: 'italic', color: 'var(--gray-500)' }}>{ev.notes}</div>}
                  {ev.profiles?.full_name && <div className="text-muted" style={{ marginTop: '0.15rem', fontSize: '0.75rem' }}>by {ev.profiles.full_name}</div>}
                </div>
              ))}
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

// =================================================================
// Below: existing modals (ItemDetailModal, SmartAddModal, sub-forms)
// kept intact per spec — KEEP existing Add/Edit/Delete modals
// =================================================================

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
          <button className="btn-icon" onClick={onClose} aria-label="Close">✕</button>
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
          <div className="modal-header"><h2>What are you adding?</h2><button className="btn-icon" onClick={onClose} aria-label="Close">✕</button></div>
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
          <h2>{item ? 'Edit equipment' : 'Add equipment'}</h2>
          <div style={{display:'flex',gap:'0.5rem',alignItems:'center'}}>
            {!item && <button className="btn-secondary btn-sm" onClick={() => setEquipType(null)}>← Change type</button>}
            <button className="btn-icon" onClick={onClose} aria-label="Close">✕</button>
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
                  <option value="__new__">+ Add new category...</option>
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
                  <option value="__new__">+ Add new location...</option>
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
