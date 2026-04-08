import { useState, useEffect } from 'react'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import Sidebar from '../components/Sidebar'

export default function CategoriesPage() {
  const { currentOrg } = useOrg()
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    if (currentOrg) fetchCategories()
  }, [currentOrg])

  async function fetchCategories() {
    setLoading(true)
    const { data } = await supabase
      .from('equipment_categories')
      .select('*, sport_types(name)')
      .eq('organization_id', currentOrg.id)
      .order('sort_order')
    setCategories(data || [])
    setLoading(false)
  }

  async function addCategory(formData) {
    const { error } = await supabase
      .from('equipment_categories')
      .insert({ ...formData, organization_id: currentOrg.id })
    if (!error) { fetchCategories(); setShowAdd(false) }
    return { error }
  }

  async function deleteCategory(id) {
    if (!confirm('Delete this category? Equipment in this category must be moved first.')) return
    const { error } = await supabase.from('equipment_categories').delete().eq('id', id)
    if (error) alert('Cannot delete: equipment is still assigned to this category.')
    else fetchCategories()
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1>Equipment categories</h1>
            <p className="text-muted">{categories.length} categories</p>
          </div>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add category</button>
        </div>

        {loading ? (
          <div className="loading-state">Loading...</div>
        ) : categories.length === 0 ? (
          <div className="empty-state">
            <p>No categories yet. Add categories like Catchers Gear, Game Balls, Bats, etc.</p>
          </div>
        ) : (
          <div className="card-grid">
            {categories.map(cat => (
              <div key={cat.id} className="location-card">
                <div className="location-card-header">
                  <h3>{cat.name}</h3>
                  <button className="btn-icon" onClick={() => deleteCategory(cat.id)} title="Delete">✕</button>
                </div>
                {cat.description && <p className="text-muted">{cat.description}</p>}
                {cat.sport_types?.name && <span className="badge badge-neutral">{cat.sport_types.name}</span>}
              </div>
            ))}
          </div>
        )}

        {showAdd && (
          <AddCategoryModal orgId={currentOrg.id} onAdd={addCategory} onClose={() => setShowAdd(false)} />
        )}
      </main>
    </div>
  )
}

function AddCategoryModal({ orgId, onAdd, onClose }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sportTypes, setSportTypes] = useState([])
  const [sportTypeId, setSportTypeId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase.from('sport_types').select('*').eq('organization_id', orgId).then(({ data }) => setSportTypes(data || []))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const { error } = await onAdd({
      name,
      description: description || null,
      sport_type_id: sportTypeId || null
    })
    if (error) setError(error.message)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add category</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Category name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Catchers Gear, Game Balls, Bats..." required />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
          <div className="form-group">
            <label>Sport (leave blank if shared)</label>
            <select value={sportTypeId} onChange={e => setSportTypeId(e.target.value)}>
              <option value="">Shared across all sports</option>
              {sportTypes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Adding...' : 'Add category'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
