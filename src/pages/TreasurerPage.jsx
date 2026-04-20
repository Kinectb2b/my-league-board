import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useOrg } from '../contexts/OrgContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { friendlyError } from '../lib/errors'

export default function TreasurerPage() {
  const { currentOrg, userRole } = useOrg()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [tab, setTab] = useState('overview')
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [sponsors, setSponsors] = useState([])
  const [seasons, setSeasons] = useState([])
  const [activeSeason, setActiveSeason] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [showAddSponsor, setShowAddSponsor] = useState(false)
  const canEdit = ['admin'].includes(userRole)

  useEffect(() => { document.title = 'Treasurer | My League Board' }, [])

  const fetchAll = useCallback(async () => {
    if (!currentOrg) return
    setLoading(true)
    const orgId = currentOrg.id
    const [catRes, txRes, spRes, seaRes] = await Promise.all([
      supabase.from('budget_categories').select('*').eq('organization_id', orgId).order('sort_order'),
      supabase.from('transactions').select('*, budget_categories(name), profiles:created_by(full_name)').eq('organization_id', orgId).order('date', { ascending: false }).limit(100),
      supabase.from('sponsors').select('*').eq('organization_id', orgId).order('amount', { ascending: false }),
      supabase.from('seasons').select('*').eq('organization_id', orgId).order('created_at', { ascending: false })
    ])
    setCategories(catRes.data || [])
    setTransactions(txRes.data || [])
    setSponsors(spRes.data || [])
    setSeasons(seaRes.data || [])
    setActiveSeason((seaRes.data || []).find(s => s.is_active))
    setLoading(false)
  }, [currentOrg])

  useEffect(() => { fetchAll() }, [fetchAll])

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0)
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + parseFloat(t.amount), 0)
  const balance = totalIncome - totalExpenses
  const totalSponsors = sponsors.reduce((s, sp) => s + parseFloat(sp.amount || 0), 0)
  const paidSponsors = sponsors.filter(s => s.payment_status === 'paid').reduce((s, sp) => s + parseFloat(sp.amount || 0), 0)

  const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (loading) return (
    <div className="loading-state"><div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }}></div></div>
  )

  return (
    <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Treasurer</h1>
            <p className="text-muted">League finances and sponsorships</p>
          </div>
          {canEdit && tab === 'transactions' && <button className="btn-primary" onClick={() => setShowAddTransaction(true)}>+ Add transaction</button>}
          {canEdit && tab === 'sponsors' && <button className="btn-primary" onClick={() => setShowAddSponsor(true)}>+ Add sponsor</button>}
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div className="stat-card"><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--green-600)' }}>{fmt(totalIncome)}</div><div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Total Income</div></div>
          <div className="stat-card"><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--red-500)' }}>{fmt(totalExpenses)}</div><div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Total Expenses</div></div>
          <div className="stat-card"><div style={{ fontSize: '1.5rem', fontWeight: 700, color: balance >= 0 ? 'var(--green-600)' : 'var(--red-500)' }}>{fmt(balance)}</div><div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Balance</div></div>
          <div className="stat-card"><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gold-500, #e8b931)' }}>{fmt(totalSponsors)}</div><div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-500)', marginTop: '0.25rem' }}>Sponsorships</div></div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--gray-200)', marginBottom: '1.5rem' }}>
          {['overview', 'transactions', 'sponsors'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '0.5rem 1.25rem', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--green-600)' : '2px solid transparent',
              marginBottom: '-2px', fontFamily: 'inherit', fontWeight: tab === t ? 600 : 400, color: tab === t ? 'var(--green-700)' : 'var(--gray-500)', cursor: 'pointer', fontSize: '0.9rem', textTransform: 'capitalize'
            }}>{t}</button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--green-700)' }}>Income by Category</h2>
              {categories.filter(c => c.type === 'income').map(cat => {
                const actual = transactions.filter(t => t.category_id === cat.id).reduce((s, t) => s + parseFloat(t.amount), 0)
                return (
                  <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--gray-100)' }}>
                    <span style={{ fontSize: '0.85rem' }}>{cat.name}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--green-600)' }}>{fmt(actual)}</span>
                  </div>
                )
              })}
            </div>
            <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--red-500)' }}>Expenses by Category</h2>
              {categories.filter(c => c.type === 'expense').map(cat => {
                const actual = transactions.filter(t => t.category_id === cat.id).reduce((s, t) => s + parseFloat(t.amount), 0)
                return (
                  <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--gray-100)' }}>
                    <span style={{ fontSize: '0.85rem' }}>{cat.name}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: actual > 0 ? 'var(--red-500)' : 'var(--gray-400)' }}>{fmt(actual)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Transactions tab */}
        {tab === 'transactions' && (
          <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            {transactions.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}><p>No transactions yet. {canEdit ? 'Click + Add transaction to get started.' : ''}</p></div>
            ) : (
              <table className="data-table" style={{ marginBottom: 0 }}>
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {transactions.map(tx => (
                    <tr key={tx.id}>
                      <td style={{ fontSize: '0.8rem' }}>{new Date(tx.date).toLocaleDateString()}</td>
                      <td style={{ fontWeight: 500 }}>{tx.description}{tx.vendor_or_source ? <span className="text-muted"> — {tx.vendor_or_source}</span> : ''}</td>
                      <td className="text-muted" style={{ fontSize: '0.8rem' }}>{tx.budget_categories?.name || '—'}</td>
                      <td><span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '6px', fontWeight: 500, background: tx.type === 'income' ? '#d4edda' : '#f8d7da', color: tx.type === 'income' ? '#16a34a' : '#dc3545' }}>{tx.type}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: tx.type === 'income' ? 'var(--green-600)' : 'var(--red-500)' }}>{fmt(tx.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Sponsors tab */}
        {tab === 'sponsors' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem' }}>
            {sponsors.length === 0 ? (
              <div className="empty-state"><p>No sponsors yet. {canEdit ? 'Click + Add sponsor to get started.' : ''}</p></div>
            ) : sponsors.map(sp => (
              <div key={sp.id} style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600 }}>{sp.name}</div>
                  {sp.tier && <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '6px', fontWeight: 600, textTransform: 'uppercase',
                    background: sp.tier === 'platinum' ? '#e8e8e8' : sp.tier === 'gold' ? '#fef3c7' : sp.tier === 'silver' ? '#f1f5f9' : sp.tier === 'bronze' ? '#fed7aa' : '#e0f2fe',
                    color: sp.tier === 'platinum' ? '#374151' : sp.tier === 'gold' ? '#92400e' : sp.tier === 'silver' ? '#475569' : sp.tier === 'bronze' ? '#9a3412' : '#0369a1'
                  }}>{sp.tier}</span>}
                </div>
                {sp.contact_name && <div className="text-muted" style={{ fontSize: '0.8rem' }}>{sp.contact_name}{sp.contact_phone ? ' · ' + sp.contact_phone : ''}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{fmt(sp.amount || 0)}</span>
                  <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '6px', fontWeight: 500,
                    background: sp.payment_status === 'paid' ? '#d4edda' : sp.payment_status === 'partial' ? '#fff3cd' : '#f8d7da',
                    color: sp.payment_status === 'paid' ? '#16a34a' : sp.payment_status === 'partial' ? '#856404' : '#dc3545'
                  }}>{sp.payment_status}</span>
                </div>
                {sp.placement && <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Placement: {sp.placement}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Add Transaction Modal */}
        {showAddTransaction && <AddTransactionModal categories={categories} orgId={currentOrg.id} userId={user.id} onClose={() => { setShowAddTransaction(false); fetchAll() }} addToast={addToast} />}

        {/* Add Sponsor Modal */}
        {showAddSponsor && <AddSponsorModal orgId={currentOrg.id} seasons={seasons} activeSeason={activeSeason} onClose={() => { setShowAddSponsor(false); fetchAll() }} addToast={addToast} />}
    </>
  )
}

function AddTransactionModal({ categories, orgId, userId, onClose, addToast }) {
  const [type, setType] = useState('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [vendor, setVendor] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const { error } = await supabase.from('transactions').insert({
      organization_id: orgId, type, amount: parseFloat(amount), description,
      category_id: categoryId || null, date, vendor_or_source: vendor || null,
      notes: notes || null, created_by: userId
    })
    if (error) addToast(friendlyError(error), 'error')
    else addToast(`${type === 'income' ? 'Income' : 'Expense'} recorded: $${amount}`)
    setSubmitting(false)
    onClose()
  }

  const filteredCats = categories.filter(c => c.type === type)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Add transaction</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Type *</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={() => setType('income')} style={{ flex: 1, padding: '0.5rem', border: type === 'income' ? '2px solid var(--green-600)' : '1px solid var(--gray-200)', borderRadius: 'var(--radius)', background: type === 'income' ? 'var(--green-50)' : 'white', fontFamily: 'inherit', fontWeight: 600, color: type === 'income' ? 'var(--green-700)' : 'var(--gray-500)', cursor: 'pointer' }}>Income</button>
              <button type="button" onClick={() => setType('expense')} style={{ flex: 1, padding: '0.5rem', border: type === 'expense' ? '2px solid var(--red-500)' : '1px solid var(--gray-200)', borderRadius: 'var(--radius)', background: type === 'expense' ? '#fef2f2' : 'white', fontFamily: 'inherit', fontWeight: 600, color: type === 'expense' ? 'var(--red-500)' : 'var(--gray-500)', cursor: 'pointer' }}>Expense</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="form-group" style={{ flex: 1 }}><label>Amount *</label><input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Date *</label><input type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
          </div>
          <div className="form-group"><label>Description *</label><input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What was this for?" required /></div>
          <div className="form-group"><label>Category</label><select value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">Select category...</option>{filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="form-group"><label>{type === 'income' ? 'Source' : 'Vendor'}</label><input type="text" value={vendor} onChange={e => setVendor(e.target.value)} placeholder={type === 'income' ? 'Where did it come from?' : 'Who did you pay?'} /></div>
          <div className="form-group"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Additional details..." style={{ fontFamily: 'inherit', resize: 'vertical' }} /></div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Save transaction'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AddSponsorModal({ orgId, seasons, activeSeason, onClose, addToast }) {
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [tier, setTier] = useState('supporter')
  const [amount, setAmount] = useState('')
  const [placement, setPlacement] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const { error } = await supabase.from('sponsors').insert({
      organization_id: orgId, name, contact_name: contactName || null,
      contact_email: contactEmail || null, contact_phone: contactPhone || null,
      tier, amount: parseFloat(amount) || 0, placement: placement || null,
      notes: notes || null, season_id: activeSeason?.id || null, payment_status: 'pending'
    })
    if (error) addToast(friendlyError(error), 'error')
    else addToast(`Sponsor "${name}" added`)
    setSubmitting(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h2>Add sponsor</h2><button className="btn-icon" onClick={onClose}>✕</button></div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group"><label>Business name *</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" required /></div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="form-group" style={{ flex: 1 }}><label>Contact name</label><input type="text" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="John Smith" /></div>
            <div className="form-group" style={{ flex: 1 }}><label>Phone</label><input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="(555) 123-4567" /></div>
          </div>
          <div className="form-group"><label>Email</label><input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="john@acme.com" /></div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Tier *</label>
              <select value={tier} onChange={e => setTier(e.target.value)}>
                <option value="platinum">Platinum</option>
                <option value="gold">Gold</option>
                <option value="silver">Silver</option>
                <option value="bronze">Bronze</option>
                <option value="supporter">Supporter</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}><label>Amount ($) *</label><input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="500.00" required /></div>
          </div>
          <div className="form-group"><label>Placement</label><input type="text" value={placement} onChange={e => setPlacement(e.target.value)} placeholder="Outfield banner, scoreboard, etc." /></div>
          <div className="form-group"><label>Notes</label><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ fontFamily: 'inherit', resize: 'vertical' }} /></div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving...' : 'Add sponsor'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
