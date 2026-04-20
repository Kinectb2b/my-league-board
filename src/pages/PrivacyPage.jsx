import { Link } from 'react-router-dom'

export default function PrivacyPage() {
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

        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1a472a', marginTop: '1rem', marginBottom: '0.25rem' }}>Privacy Policy</h1>
        <p style={{ ...paragraph, color: '#6b7280', marginBottom: '1.5rem' }}>My League Board</p>

        <h2 style={sectionTitle}>What We Collect</h2>
        <p style={paragraph}>When you use My League Board, your league organization may store the following types of information:</p>
        <ul style={list}>
          <li>Account information (name, email, phone number, role within your league)</li>
          <li>League and organization details</li>
          <li>Equipment inventory records</li>
          <li>Member rosters and contact information</li>
          <li>Incident and injury reports</li>
          <li>Background check status for volunteers and coaches</li>
          <li>Financial transactions (dues, fees, reimbursements)</li>
          <li>Sponsor information and agreements</li>
        </ul>

        <h2 style={sectionTitle}>Why We Collect It</h2>
        <p style={paragraph}>All data is collected and stored to support the day-to-day board operations of your youth sports league. This includes managing rosters, tracking equipment, handling finances, documenting incidents, and verifying that coaches and volunteers have completed required background checks.</p>

        <h2 style={sectionTitle}>Who Can See Your Data</h2>
        <p style={paragraph}>Your data is only visible to authorized members of your specific league organization. Access is scoped by role, meaning a volunteer may see different information than a board president. No one outside your league organization can view your data.</p>

        <h2 style={sectionTitle}>Information About Minors</h2>
        <p style={paragraph}>My League Board does not collect information directly from children. Any information about minors (such as roster details or incident reports) is entered by authorized adults within the league. If you are a parent or guardian and have questions about information stored about your child, please contact your league administrator directly.</p>

        <h2 style={sectionTitle}>How Long We Keep Data</h2>
        <ul style={list}>
          <li><strong>Incident and injury reports:</strong> retained for 7 years</li>
          <li><strong>Background check records:</strong> retained until the individual's role ends, plus 1 additional year</li>
          <li><strong>Financial transactions:</strong> retained for 7 years</li>
          <li><strong>Inactive accounts:</strong> removed after 2 years of inactivity</li>
        </ul>

        <h2 style={sectionTitle}>Your Rights</h2>
        <p style={paragraph}>As a user, you may:</p>
        <ul style={list}>
          <li>Request an export of your personal data</li>
          <li>Request deletion of your account and associated data</li>
          <li>Contact your league administrator with any questions or concerns about your information</li>
        </ul>

        <h2 style={sectionTitle}>Changes to This Policy</h2>
        <p style={paragraph}>This privacy policy may be updated from time to time. If changes are made, you will be notified upon your next login to the platform.</p>

        <h2 style={sectionTitle}>Contact</h2>
        <p style={paragraph}>If you have questions about this privacy policy, you can reach us at <a href="mailto:support@myleagueboard.com" style={{ color: '#1a472a' }}>support@myleagueboard.com</a>.</p>

        <p style={{ ...paragraph, marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', color: '#6b7280', fontSize: '0.85rem' }}>Effective date: April 20, 2026</p>
      </div>
    </div>
  )
}
