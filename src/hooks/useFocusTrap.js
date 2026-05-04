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
 * Per-site initial-focus decision tree (caller's choice via initialFocusRef).
 * Each rule has a Principle line — when an edge case doesn't fit neatly into
 * one bucket, reason from the principle, not the literal rule.
 *
 *   FORM modal (has text input / select / textarea):
 *     → ref to first form input.
 *     Principle: user came to fill the form; reach the data-entry surface
 *     immediately. Replaces any existing autoFocus attribute (one mechanism,
 *     not two).
 *
 *   INFO-ONLY modal (no inputs, just read-only body + dismissal):
 *     → ref to the prominent bottom Close/Done button if one exists.
 *     → Otherwise omit; first-focusable fallback lands on the close X
 *       in the modal header, which is fine.
 *     Principle: no input to make; provide the dismiss affordance
 *     immediately.
 *
 *   PURE CONFIRMATION modal (Confirm + Cancel only, no inputs — rare in
 *   this codebase; browser confirm() is used for most destructive ops):
 *     → ref to Cancel (the safer button).
 *     Principle: destructive default-Enter behavior must be guarded by an
 *     explicit step away from the safer button.
 *
 *   FORM modal with destructive primary action (e.g., RemoveModal — has
 *   form inputs AND the submit button is destructive):
 *     → treat as FORM. ref to first input.
 *     Principle: form fields gate the destructive op; user came to fill the
 *     form, not fire it. Edge case: if the form is single-field-ceremonial
 *     (e.g., type "DELETE" to confirm), the field IS the confirmation gate
 *     and Enter on it would fire the destructive submit — prefer Cancel in
 *     that case. File as a follow-up audit ID if such a pattern surfaces
 *     in the sweep.
 *
 * Why initialFocusRef exists at all: modal-header renders the close X
 * first in DOM order, so naive "first focusable" lands on Close — poor
 * experience for FORM modals (screen readers announce "Close, button"
 * before the user hears the modal's purpose; reflexive Enter dismisses).
 * Pilot verification on /bag-templates surfaced this; the ref pattern
 * is the explicit fix.
 *
 * onClose is held via ref so identity churn (inline arrow funcs) doesn't
 * tear down and rebind the keydown listener on parent re-render.
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
