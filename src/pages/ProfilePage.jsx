import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import Sidebar from '../components/Sidebar'

export default function ProfilePage() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    phone: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    shirt_size: '',
    address: ''
  })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    document.title = 'Profile | My League Board'
    fetchProfile()
  }, [])

  async function fetchProfile() {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) {
      setProfile({
        full_name: data.full_name || '',
        email: data.email || user.email || '',
        phone: data.phone || '',
        emergency_contact_name: data.emergency_contact_name || '',
        emergency_contact_phone: data.emergency_contact_phone || '',
        shirt_size: data.shirt_size || '',
        address: data.address || ''
      })
    }
    setLoading(false)
  }

  async function saveProfile(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name: profile.full_name,
      phone: profile.phone,
      emergency_contact_name: profile.emergency_contact_name,
      emergency_contact_phone: profile.emergency_contact_phone,
      shirt_size: profile.shirt_size,
      address: profile.address
    }).eq('id', user.id)
    if (error) addToast('Failed to save', 'error')
    else addToast('Profile updated')
    setSaving(false)
  }

  async function changePassword(e) {
    e.preventDefault()
    if (newPassword.length < 6) { addToast('Password must be at least 6 characters', 'error'); return }
    if (newPassword !== confirmPassword) { addToast('Passwords do not match', 'error'); return }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) addToast('Failed to change password: ' + error.message, 'error')
    else { addToast('Password changed'); setNewPassword(''); setConfirmPassword('') }
    setChangingPassword(false)
  }

  if (loading) return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="loading-state"><div className="skeleton" style={{ width: '200px', height: '1rem', margin: '2rem auto' }}></div></div>
      </main>
    </div>
  )

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>Profile</h1>
        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Manage your personal information</p>

        <div style={{ maxWidth: '600px' }}>
          <form onSubmit={saveProfile}>
            <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Personal info</h2>
              <div className="form-group">
                <label>Full name</label>
                <input type="text" value={profile.full_name} onChange={e => setProfile({...profile, full_name: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={profile.email} disabled style={{ background: 'var(--gray-50)', color: 'var(--gray-500)' }} />
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>Email cannot be changed</span>
              </div>
              <div className="form-group">
                <label>Phone number</label>
                <input type="tel" value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} placeholder="(555) 123-4567" />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input type="text" value={profile.address} onChange={e => setProfile({...profile, address: e.target.value})} placeholder="123 Main St, City, IN 46310" />
              </div>
              <div className="form-group">
                <label>Shirt size</label>
                <select value={profile.shirt_size} onChange={e => setProfile({...profile, shirt_size: e.target.value})}>
                  <option value="">Select...</option>
                  <option value="YS">Youth S</option>
                  <option value="YM">Youth M</option>
                  <option value="YL">Youth L</option>
                  <option value="AS">Adult S</option>
                  <option value="AM">Adult M</option>
                  <option value="AL">Adult L</option>
                  <option value="AXL">Adult XL</option>
                  <option value="A2XL">Adult 2XL</option>
                  <option value="A3XL">Adult 3XL</option>
                </select>
              </div>
            </div>

            <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Emergency contact</h2>
              <div className="form-group">
                <label>Contact name</label>
                <input type="text" value={profile.emergency_contact_name} onChange={e => setProfile({...profile, emergency_contact_name: e.target.value})} placeholder="Jane Smith" />
              </div>
              <div className="form-group">
                <label>Contact phone</label>
                <input type="tel" value={profile.emergency_contact_phone} onChange={e => setProfile({...profile, emergency_contact_phone: e.target.value})} placeholder="(555) 987-6543" />
              </div>
            </div>

            <button type="submit" className="btn-primary" disabled={saving} style={{ marginBottom: '1.5rem' }}>{saving ? 'Saving...' : 'Save profile'}</button>
          </form>

          <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Change password</h2>
            <form onSubmit={changePassword}>
              <div className="form-group">
                <label>New password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
              </div>
              <div className="form-group">
                <label>Confirm new password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Type it again" />
              </div>
              <button type="submit" className="btn-primary" disabled={changingPassword}>{changingPassword ? 'Changing...' : 'Change password'}</button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
