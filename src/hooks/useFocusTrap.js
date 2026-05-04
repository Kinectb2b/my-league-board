import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]:not([disabled])',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(',')

function isVisible(el) {
  return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0
}

function getFocusableElements(container) {
  if (!container) return []
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible)
}

/**
 * Modal keyboard handling — A-05 (focus restoration) + A-11 (Escape dismiss).
 * Attach the returned ref to the modal's content container.
 *
 * Responsibilities (WAI-ARIA dialog pattern):
 *   1. Snapshot the trigger (document.activeElement) on mount
 *   2. Move focus into the modal: prefer initialFocusRef.current if provided,
 *      else first focusable inside the container. Skipped if something inside
 *      already has focus (preserves child autoFocus).
 *   3. Trap Tab / Shift+Tab to cycle within the container
 *   4. Close on Escape
 *   5. Restore focus to the trigger on unmount
 *
 * Why initialFocusRef exists: modal containers typically render the close X
 * button first in DOM order (inside .modal-header), so the naive "first
 * focusable" pick lands on Close. That's a poor experience — screen readers
 * announce "Close, button" before the user hears the modal's purpose, and
 * a reflexive Enter dismisses the modal. Callers pass a ref to the element
 * that should receive focus (typically the first form input). If omitted,
 * the hook falls back to first focusable — useful for confirmation modals
 * with no clear input-first surface.
 *
 * onClose is held via ref so its identity changes (inline arrow funcs) don't
 * tear down and rebind the keydown listener on every parent re-render.
 */
export function useFocusTrap({ onClose, initialFocusRef }) {
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    triggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    if (!container.contains(document.activeElement)) {
      const target = initialFocusRef?.current ?? getFocusableElements(container)[0]
      target?.focus()
    }

    function handleKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = getFocusableElements(container)
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      const trigger = triggerRef.current
      if (trigger && document.body.contains(trigger)) {
        trigger.focus()
      }
    }
  }, [])

  return containerRef
}
