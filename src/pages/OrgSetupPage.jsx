import { useState } from 'react'
import { useOrg } from '../contexts/OrgContext'
import { useNavigate } from 'react-router-dom'
import { friendlyError } from '../lib/errors'

export default function OrgSetupPage() {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { createOrg } = useOrg()
  const navigate = useNavigate()

  function generateSlug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const slug = generateSlug(name)
    const { error } = await createOrg(name, slug)

    if (error) {
      if (error.message.includes('duplicate')) setError('A league with that name already exists.')
      else setError(friendlyError(error))
    } else {
      navigate('/dashboard')
    }
    setSubmitting(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>Set up your league</h1>
          <p className="auth-subtitle">Create your organization to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="orgName">League name</label>
            <input
              id="orgName"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Demotte Little League"
              required
            />
          </div>

          {name && (
            <p className="slug-preview">URL: myleagueboard.com/<strong>{generateSlug(name)}</strong></p>
          )}

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create league'}
          </button>
        </form>
      </div>
    </div>
  )
}
