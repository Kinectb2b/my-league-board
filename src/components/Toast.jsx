import { useState, useEffect, createContext, useContext, useCallback } from 'react'

const ToastContext = createContext()

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success', { action, duration } = {}) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type, action }])
    const timeout = duration ?? (action ? 5000 : 3000)
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), timeout)
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* aria-live on the container so newly-added toasts get announced.
          aria-atomic="false" + per-toast aria-atomic="true" so each toast
          is announced as one whole message instead of as a diff against
          previous toasts. role="alert" on errors maps to aria-live="assertive"
          (interrupts whatever the screen reader is reading) — appropriate
          for failure cases; success/info stay polite via the container. */}
      <div className="toast-container" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-atomic="true"
          >
            <span aria-hidden="true">{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  try {
                    t.action.onClick()
                  } finally {
                    setToasts(prev => prev.filter(x => x.id !== t.id))
                  }
                }}
                style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: '0 0.25rem' }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
