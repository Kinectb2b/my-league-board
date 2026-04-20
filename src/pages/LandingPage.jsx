import { useNavigate } from 'react-router-dom'

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1a472a 0%, #0d2818 100%)' }}>
      <header className="landing-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 3rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg width="36" height="36" viewBox="0 0 48 48" fill="none"><rect width="48" height="48" rx="12" fill="rgba(255,255,255,0.1)"/><path d="M14 34V18L24 12L34 18V34" stroke="#f5f0e1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="24" cy="24" r="5" stroke="#e8b931" strokeWidth="2"/><line x1="24" y1="19" x2="24" y2="14" stroke="#e8b931" strokeWidth="2" strokeLinecap="round"/></svg>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '1.2rem' }}>My League Board</span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => navigate('/auth')} style={{ background: 'none', border: '1.5px solid rgba(255,255,255,0.3)', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Sign in</button>
          <button onClick={() => navigate('/auth')} style={{ background: '#e8b931', border: 'none', color: '#1a472a', padding: '0.5rem 1.25rem', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Get started free</button>
        </div>
      </header>

      <main className="landing-main landing-hero" style={{ maxWidth: '1000px', margin: '0 auto', padding: '4rem 2rem', textAlign: 'center' }}>
        <h1 style={{ color: 'white', fontSize: '3rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '1.5rem' }}>
          Equipment management<br/>for youth sports leagues
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto 2.5rem', lineHeight: 1.6 }}>
          Track every bat, ball, and helmet. Know where everything is, who has it, and when it needs restocking. Built by equipment managers, for equipment managers.
        </p>
        <button onClick={() => navigate('/auth')} style={{ background: '#e8b931', border: 'none', color: '#1a472a', padding: '0.85rem 2.5rem', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '1.1rem' }}>Start managing your gear →</button>

        <div className="landing-features" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginTop: '5rem', textAlign: 'left' }}>
          <FeatureCard icon="📦" title="Equipment tracking" description="Smart forms for every type of gear. Bats, balls, helmets, catchers gear — all tracked with condition and status." />
          <FeatureCard icon="🏟️" title="Storage locations" description="Know where everything is stored. Board room, field sheds, base room. Transfer between locations with one click." />
          <FeatureCard icon="🎒" title="Team gear bags" description="Build kit templates, assign gear to teams, track the full lifecycle from packing to pickup to return." />
          <FeatureCard icon="📊" title="Restock reports" description="See what's running low at a glance. Print reports for restocking day. Never run out of game balls again." />
          <FeatureCard icon="👥" title="Role-based access" description="Admins manage everything. Equipment managers handle gear. Coaches see their team's bag status." />
          <FeatureCard icon="🆓" title="Free forever" description="Built for volunteer-run leagues. No per-team pricing, no hidden fees, no credit card required." />
        </div>
      </main>

      <footer style={{ textAlign: 'center', padding: '3rem 2rem', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <a href="/privacy" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>Privacy Policy</a>
          <span style={{ margin: '0 0.5rem' }}>·</span>
          <a href="/terms" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>Terms of Service</a>
        </div>
        © {new Date().getFullYear()} My League Board
      </footer>

      <style>{`
        @media (max-width: 768px) {
          .landing-hero h1 { font-size: 2rem !important; }
          .landing-hero p { font-size: 1rem !important; }
          .landing-header { padding: 1rem !important; }
          .landing-features { grid-template-columns: 1fr !important; }
          .landing-main { padding: 2rem 1rem !important; }
        }
      `}</style>
    </div>
  )
}

function FeatureCard({ icon, title, description }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1.5rem' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{icon}</div>
      <h3 style={{ color: 'white', fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{title}</h3>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', lineHeight: 1.5 }}>{description}</p>
    </div>
  )
}
