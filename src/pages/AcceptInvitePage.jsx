import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
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
      .select('*, organizations(name), board_positions:board_position_id(id, title)')
      .eq('token', token)
      .is('accepted_at', null)
      .single()
    if (error || !data) { setError('This invitation is invalid or has already been used.'); setLoading(false); return }
    if (new Date(data.expires_at) < new Date()) { setError('This invitation has expired.'); setLoading(false); return }

    // Fetch team name separately when team-scoped (scope_id has no FK to teams)
    if (data.scope_type === 'team' && data.scope_id) {
      const { data: team } = await supabase.from('teams').select('name').eq('id', data.scope_id).single()
      data._teamName = team?.name || null
    }
    setInvite(data)
    setLoading(false)
  }

  async function acceptInvite() {
    if (!user) { navigate('/auth?redirect=/accept-invite?token=' + token); return }
    setAccepting(true)

    const inviteEmail = (invite.email || '').trim().toLowerCase()
    const userEmail = (user.email || '').trim().toLowerCase()
    if (inviteEmail !== userEmail) {
      setError(`This invitation was sent to ${invite.email}. Please sign in with that account.`)
      logActivity(
        invite.organization_id,
        'invitation.accept_email_mismatch',
        'invitation',
        invite.email,
        `Authenticated user ${user.email} attempted to accept invitation sent to ${invite.email}`
      )
      setAccepting(false)
      return
    }

    // 1. Add to organization_members
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

    // 2. Assign board position if one was specified
    if (invite.board_position_id) {
      await supabase.from('board_positions').update({
        assigned_to: user.id,
        appointed_date: new Date().toISOString().split('T')[0]
      }).eq('id', invite.board_position_id)
    }

    // 3. Grant user_roles from intended_roles, preserving scope from invitation
    const rolesToGrant = invite.intended_roles && invite.intended_roles.length > 0
      ? invite.intended_roles
      : [invite.role]
    const scopeType = invite.scope_type || 'league'
    const scopeId = invite.scope_id || null
    for (const role of rolesToGrant) {
      await supabase.from('user_roles').upsert({
        user_id: user.id,
        organization_id: invite.organization_id,
        role,
        scope_type: scopeType,
        scope_id: scopeId,
      }, { onConflict: 'user_id,organization_id,role,scope_type,scope_id' })
    }

    // 4. Update profile with name/phone from invitation if profile is sparse
    if (invite.full_name || invite.phone) {
      const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).single()
      const updates = {}
      if (!profile?.full_name && invite.full_name) updates.full_name = invite.full_name
      if (!profile?.phone && invite.phone) updates.phone = invite.phone
      if (Object.keys(updates).length > 0) {
        await supabase.from('profiles').update(updates).eq('id', user.id)
      }
    }

    // 5. Mark invitation accepted
    await supabase.from('invitations').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id)

    await refreshOrgs()
    setAccepting(false)
    navigate('/dashboard')
  }

  // Build a human-readable description of what they're being invited to
  const positionTitle = invite?.board_positions?.title
  const orgName = invite?.organizations?.name
  const teamName = invite?.scope_type === 'team' ? invite?._teamName : null
  let inviteDescription = ''
  if (teamName && orgName) {
    inviteDescription = `You've been invited to join ${orgName} as an Assistant Coach for the ${teamName} team.`
  } else if (positionTitle && orgName) {
    inviteDescription = `You've been invited to join ${orgName} as ${positionTitle}.`
  } else if (orgName) {
    inviteDescription = `You've been invited to join ${orgName}.`
  }

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
              <strong>{inviteDescription}</strong>
            </p>
            {invite.welcome_message && (
              <p style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--gray-500)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                "{invite.welcome_message}"
              </p>
            )}
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
