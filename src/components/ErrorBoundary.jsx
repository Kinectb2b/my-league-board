import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'system-ui, sans-serif', background: '#f5f0e1' }}>
          <div style={{ maxWidth: '480px', background: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚾</div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: '#1a472a' }}>Something went wrong</h1>
            <p style={{ color: '#6b7280', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              The app ran into a problem. Try reloading the page. If it keeps happening, sign out and back in.
            </p>
            <button onClick={() => window.location.reload()} style={{ background: '#1a472a', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' }}>
              Reload page
            </button>
            {import.meta.env.DEV && (
              <details style={{ marginTop: '1.5rem', textAlign: 'left', fontSize: '0.8rem', color: '#dc2626' }}>
                <summary style={{ cursor: 'pointer' }}>Error details (dev only)</summary>
                <pre style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#fef2f2', borderRadius: '6px', overflow: 'auto' }}>
                  {this.state.error?.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
