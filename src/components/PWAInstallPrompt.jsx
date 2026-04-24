import { useEffect, useState } from 'react'

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('pwa-install-dismissed') === 'true'
  )

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!deferredPrompt || dismissed) return null

  const handleInstall = async () => {
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('pwa-install-dismissed', 'true')
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      padding: 16,
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      maxWidth: 300,
      zIndex: 9999
    }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Install My League Board</p>
      <p style={{ margin: '4px 0 12px', fontSize: 13, color: '#6b7280' }}>
        Add to home screen for quick access
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleInstall}
          style={{ background: '#16a34a', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          style={{ background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
        >
          Not now
        </button>
      </div>
    </div>
  )
}
