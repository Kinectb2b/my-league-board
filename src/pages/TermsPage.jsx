import { Link } from 'react-router-dom'

export default function TermsPage() {
  const sectionTitle = {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#1a472a',
    marginTop: '1.5rem',
    marginBottom: '0.5rem',
  }

  const paragraph = {
    fontSize: '0.9rem',
    lineHeight: 1.6,
    color: '#374151',
    marginBottom: '0.75rem',
  }

  const list = {
    fontSize: '0.9rem',
    lineHeight: 1.6,
    color: '#374151',
    marginBottom: '0.75rem',
    paddingLeft: '1.25rem',
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a472a 0%, #0d2818 100%)', padding: '2rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', background: 'white', borderRadius: '12px', padding: '2.5rem', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
        <Link to="/" style={{ color: '#1a472a', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 500 }}>&larr; Back to home</Link>

        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1a472a', marginTop: '1rem', marginBottom: '0.25rem' }}>Terms of Service</h1>
        <p style={{ ...paragraph, color: '#6b7280', marginBottom: '1.5rem' }}>My League Board</p>

        <h2 style={sectionTitle}>Acceptance of Terms</h2>
        <p style={paragraph}>By creating an account or using My League Board, you agree to these terms of service. If you do not agree, please do not use the platform.</p>

        <h2 style={sectionTitle}>Who May Use This Platform</h2>
        <p style={paragraph}>My League Board is designed for authorized board members, coaches, volunteers, and administrators of youth sports leagues. You must be at least 18 years old and authorized by your league organization to use this platform.</p>

        <h2 style={sectionTitle}>Acceptable Use</h2>
        <p style={paragraph}>When using My League Board, you agree not to:</p>
        <ul style={list}>
          <li>Use the platform for any illegal activity</li>
          <li>Upload malicious content, viruses, or harmful files</li>
          <li>Attempt to access data belonging to other league organizations</li>
          <li>Share login credentials with unauthorized individuals</li>
          <li>Use the platform in any way that could harm or disrupt it for other users</li>
        </ul>

        <h2 style={sectionTitle}>Account Responsibility</h2>
        <p style={paragraph}>You are responsible for keeping your login credentials secure. Do not share your password with others. If you believe your account has been compromised, notify your league administrator immediately so they can take appropriate action.</p>

        <h2 style={sectionTitle}>No Warranty</h2>
        <p style={paragraph}>My League Board is provided "as is" without warranties of any kind, whether express or implied. We do our best to keep the platform running smoothly and your data safe, but we cannot guarantee uninterrupted access or that the platform will be free of errors at all times.</p>

        <h2 style={sectionTitle}>League Data Management</h2>
        <p style={paragraph}>Each league organization is responsible for how it manages its own data within the platform. My League Board provides the tools, but individual leagues determine what information they collect and how they use it. We are not responsible for decisions made by league administrators regarding their organization's data.</p>

        <h2 style={sectionTitle}>Governing Law</h2>
        <p style={paragraph}>These terms are governed by the laws of the State of Indiana. Any disputes arising from the use of this platform shall be resolved in the courts located in Indiana.</p>

        <h2 style={sectionTitle}>Account Termination</h2>
        <p style={paragraph}>We reserve the right to suspend or terminate accounts that violate these terms of service. Your league administrator may also remove your access at any time based on your role within the organization.</p>

        <h2 style={sectionTitle}>Changes to These Terms</h2>
        <p style={paragraph}>These terms may be updated from time to time. Continued use of the platform after changes are posted constitutes your acceptance of the updated terms.</p>

        <h2 style={sectionTitle}>Contact</h2>
        <p style={paragraph}>If you have questions about these terms, you can reach us at <a href="mailto:support@myleagueboard.com" style={{ color: '#1a472a' }}>support@myleagueboard.com</a>.</p>

        <p style={{ ...paragraph, marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.85rem' }}>Effective date: April 20, 2026</p>
      </div>
    </div>
  )
}
