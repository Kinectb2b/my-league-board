const baseStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.5rem',
  padding: '0.5rem 0.75rem',
  borderRadius: 'var(--radius)',
  fontSize: '0.8rem',
  lineHeight: 1.35,
}

const variants = {
  pending: {
    background: 'var(--gray-50)',
    border: '1px solid var(--gray-200)',
    color: 'var(--gray-600)',
  },
  sent: {
    background: 'var(--green-50)',
    border: '1px solid var(--green-500)',
    color: 'var(--green-900)',
  },
  failed: {
    background: 'var(--orange-100)',
    border: '1px solid var(--orange-500)',
    color: 'var(--gray-900)',
  },
}

export default function EmailStatusChip({ status, email, recipient }) {
  if (!status) return null
  const style = { ...baseStyle, ...variants[status] }

  if (status === 'pending') {
    return (
      <div style={style} role="status" aria-live="polite">
        <span aria-hidden="true">·</span>
        <span>Sending email to {email}…</span>
      </div>
    )
  }

  if (status === 'sent') {
    return (
      <div style={style} role="status" aria-live="polite">
        <span aria-hidden="true">✓</span>
        <span>Email on its way to {email}.</span>
      </div>
    )
  }

  return (
    <div style={style} role="status" aria-live="polite">
      <span aria-hidden="true">!</span>
      <span>
        We couldn&rsquo;t send the email. Copy the link above and share it with {recipient} directly — it works the same way.
      </span>
    </div>
  )
}
