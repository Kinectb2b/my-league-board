import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setSubmitting(true)

    if (isSignUp) {
      const { error } = await signUp(email, password, fullName)
      if (error) setError(error.message)
      else setMessage('Check your email for a confirmation link!')
    } else {
      const { error } = await signIn(email, password)
      if (error) setError(error.message)
      else navigate('/dashboard')
    }
    setSubmitting(false)
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
          <p className="auth-subtitle">Equipment & team management for youth sports</p>
        </div>

        {showReset ? (<>
          <div className="auth-header">
            <h1>Reset password</h1>
            <p className="auth-subtitle">Enter your email and we'll send you a reset link</p>
          </div>
          <form onSubmit={async (e) => {
            e.preventDefault(); setError(''); setMessage('')
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth' })
            if (error) setError(error.message)
            else setMessage('Check your email for a reset link!')
          }} className="auth-form">
            <div className="form-group">
              <label htmlFor="resetEmail">Email</label>
              <input id="resetEmail" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            {error && <div className="form-error">{error}</div>}
            {message && <div className="form-success">{message}</div>}
            <button type="submit" className="btn-primary">Send reset link</button>
          </form>
          <div className="auth-toggle">
            <p><button onClick={() => { setShowReset(false); setError(''); setMessage('') }}>&larr; Back to sign in</button></p>
          </div>
        </>) : (<>
          <form onSubmit={handleSubmit} className="auth-form">
            {isSignUp && (
              <div className="form-group">
                <label htmlFor="fullName">Full name</label>
                <input id="fullName" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Smith" required />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required />
            </div>
            {isSignUp && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', marginTop: '0.25rem' }}>
                <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} style={{ marginTop: '0.15rem' }} />
                <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#e8b931', textDecoration: 'underline' }}>Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#e8b931', textDecoration: 'underline' }}>Privacy Policy</a></span>
              </label>
            )}
            {!isSignUp && (
              <button type="button" className="forgot-link" onClick={() => { setShowReset(true); setError(''); setMessage('') }}>Forgot password?</button>
            )}
            {error && <div className="form-error">{error}</div>}
            {message && <div className="form-success">{message}</div>}
            <button type="submit" className="btn-primary" disabled={submitting || (isSignUp && !agreedToTerms)}>
              {submitting ? 'Please wait...' : (isSignUp ? 'Create account' : 'Sign in')}
            </button>
          </form>
          <div className="auth-toggle">
            {isSignUp ? (
              <p>Already have an account? <button onClick={() => { setIsSignUp(false); setError(''); setMessage('') }}>Sign in</button></p>
            ) : (
              <p>New to My League Board? <button onClick={() => { setIsSignUp(true); setError(''); setMessage('') }}>Create an account</button></p>
            )}
          </div>
        </>)}
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <a href="/" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', textDecoration: 'none' }}>← Back to home</a>
        </div>
        <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.75rem' }}>
          <a href="/privacy" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>Privacy Policy</a>
          <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 0.4rem' }}>·</span>
          <a href="/terms" style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>Terms of Service</a>
        </div>
      </div>
    </div>
  )
}
