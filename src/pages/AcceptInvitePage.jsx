import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import { useNavigate, useSearchParams } from 'react-router-dom'

export default function AcceptInvitePage() {
  const { user } = useAuth()
  const { refreshOrgs } = useOrg()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [invite, setInvite] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (token) fetchInvite()
    else setError('Invalid invitation link')
  }, [token])

  async function fetchInvite() {
    setLoading(true)
    const { data, error } = await supabase
      .from('invitations')
      .select('*, organizations(name)')
      .eq('token', token)
      .is('accepted_at', null)
      .single()
    if (error || !data) setError('This invitation is invalid or has already been used.')
    else if (new Date(data.expires_at) < new Date()) setError('This invitation has expired.')
    else setInvite(data)
    setLoading(false)
  }

  async function acceptInvite() {
    if (!user) { navigate('/auth?redirect=/accept-invite?token=' + token); return }
    setAccepting(true)
    const { error: memberError } = await supabase.from('organization_members').insert({
      organization_id: invite.organization_id,
      profile_id: user.id,
      role: invite.role
    })
    if (memberError) {
      if (memberError.message.includes('duplicate')) setError('You are already a member of this league.')
      else setError(memberError.message)
      setAccepting(false)
      return
    }
    await supabase.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id)
    await refreshOrgs()
    setAccepting(false)
    navigate('/dashboard')
  }

  const roleLabels = { admin: 'Admin', equipment_manager: 'Equipment Manager', coach: 'Coach', board_member: 'Board Member', volunteer: 'Volunteer' }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12" fill="#1a472a"/>
              <path d="M14 34V18L24 12L34 18V34" stroke="#f5f0e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="24" cy="24" r="5" stroke="#e8b931" strokeWidth="2"/>
              <line x1="24" y1="19" x2="24" y2="14" stroke="#e8b931" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1>My League Board</h1>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--gray-500)' }}>Loading invitation...</p>
        ) : error ? (
          <div>
            <div className="form-error" style={{ marginBottom: '1rem' }}>{error}</div>
            <button className="btn-primary" style={{ width: '100%' }} onClick={() => navigate('/auth')}>Go to sign in</button>
          </div>
        ) : invite ? (
          <div>
            <p style={{ textAlign: 'center', marginBottom: '1.5rem', color: 'var(--gray-600)' }}>
              You've been invited to join <strong>{invite.organizations?.name}</strong> as <strong>{roleLabels[invite.role] || invite.role}</strong>.
            </p>
            {!user ? (
              <div>
                <p className="text-muted" style={{ textAlign: 'center', marginBottom: '1rem' }}>Sign in or create an account to accept this invitation.</p>
                <button className="btn-primary" style={{ width: '100%' }} onClick={() => navigate('/auth?redirect=/accept-invite?token=' + token)}>Sign in to accept</button>
              </div>
            ) : (
              <div>
                <p className="text-muted" style={{ textAlign: 'center', marginBottom: '1rem' }}>Signed in as {user.email}</p>
                <button className="btn-primary" style={{ width: '100%' }} onClick={acceptInvite} disabled={accepting}>
                  {accepting ? 'Joining...' : 'Accept invitation'}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
