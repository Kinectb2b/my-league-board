import { useRegisterSW } from 'virtual:pwa-register/react'

export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl) {
      console.log('[PWA] Service worker registered:', swUrl)
    },
    onRegisterError(error) {
      console.error('[PWA] Service worker registration error:', error)
    },
  })

  if (!needRefresh) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: 20,
      right: 20,
      maxWidth: 400,
      margin: '0 auto',
      padding: 16,
      background: '#16a34a',
      color: 'white',
      borderRadius: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      zIndex: 10000
    }}>
      <span style={{ fontSize: 14 }}>A new version is available</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setNeedRefresh(false)}
          style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.4)', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
        >
          Later
        </button>
        <button
          onClick={() => updateServiceWorker(true)}
          style={{ background: 'white', color: '#16a34a', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          Reload
        </button>
      </div>
    </div>
  )
}
