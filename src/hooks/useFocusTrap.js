import { useEffect, useRef, useState } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]:not([disabled])',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(',')

// A-15: module-level modal stack. Each useFocusTrap instance pushes a
// Symbol identity on mount and pops on unmount. The keydown handler
// early-returns unless this instance is the topmost (last-pushed) entry,
// so Escape and Tab only act on the active (innermost) modal. Prevents
// Escape-cascades (parent + nested both closing) and Tab-steals (parent's
// "wrap to first" stealing focus from a nested modal).
const modalStack = []

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
 *   INFO+ACTIONS modal (no inputs, but has primary action buttons
 *   beyond dismissal — e.g., a position-detail modal with "Send
 *   invitation" / "Unassign"):
 *     → ref to the primary action button. Most-affirmative-action
 *       precedence: Save > Apply > Confirm > Send > Assign > etc.
 *       NOT first-in-DOM-order — the action the user most likely came
 *       for, not whichever the layout happens to place first.
 *     → If primary action is state-conditional (button rendered only
 *       when canEdit / status === X / etc.), pass the ref to whichever
 *       button is conditionally rendered. React attaches the ref only
 *       when the button mounts; verify via modalRef.current after
 *       render that the right button received it.
 *     → If no actions render (read-only viewer / canEdit=false / no
 *       available actions for current state), the modal IS effectively
 *       INFO-ONLY for that user — close-X fallback is the correct
 *       dismiss path, not a degradation.
 *     Principle: focus the surface the user came for. Same logic as
 *     FORM, applied to action-buttons rather than inputs.
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
 *
 * v2 additive params (Cluster 5, A-14 + A-17):
 *
 *   viewKey (A-14) — primitive (string/number/boolean). When the value
 *   changes between renders, focus is re-shifted to initialFocusRef.current
 *   (or first focusable in container if the ref is null/detached). Trigger
 *   snapshot is NOT re-taken; Escape listener is NOT re-bound. Pure
 *   focus-shift, idempotent. Omit for single-view modals — provably inert
 *   on the first render via isFirstViewKeyRender guard.
 *
 *   triggerSelector (A-17) — CSS string. When provided, ALWAYS used for
 *   focus restoration on unmount, bypassing the snapshotted trigger ref
 *   entirely. Cleanup tries an immediate querySelector first; if the
 *   element is already in the DOM, focus is restored synchronously. If
 *   not, a MutationObserver waits for the trigger to (re)appear and
 *   focuses it then.
 *
 *   Why MutationObserver and not requestAnimationFrame: empirical evidence
 *   from the BulkAssignModal pilot showed that the typical
 *   onClose={() => { setX(null); fetchAll() }} pattern can transiently
 *   unmount the trigger before remounting it after the async fetch
 *   resolves — i.e., the divisions list passes through an empty/loading
 *   state in which querySelector returns null. rAF doesn't wait long
 *   enough; MutationObserver waits for the actual remount.
 *
 *   500ms safety timeout disconnects the observer if the trigger never
 *   reappears (e.g., the surrounding context navigated away during
 *   close), preventing observer leaks. Use when the parent re-renders
 *   the trigger between modal-open and modal-close. Without a selector,
 *   falls back to the original trigger-ref + body-fallback path
 *   (existing behavior for the 40+ non-opt-in consumers).
 *
 *   Note: querySelector returns the FIRST match; for repeated triggers,
 *   focus restores to *some* matching element rather than necessarily the
 *   original. Strictly better than body-fallback, which is the bar. See
 *   A-17b for the per-site refinement (data-id encoding + state-derived
 *   selector); architecture is forward-compatible — triggerSelectorRef
 *   reads the latest value, supporting state-derived selectors.
 *
 *   pendingObserverRef cancels in-flight observer + safety-timeout on
 *   subsequent mount — required for StrictMode dev double-mount
 *   (synthetic cleanup→mount race would otherwise leave a stray observer
 *   that fires later and clobbers initial focus), also defends against
 *   rapid reopen-while-pending in prod. Do not refactor away.
 *
 * A-15 modal-stack registry: each instance participates in a module-level
 * stack; only the topmost instance handles Escape and Tab. Prevents
 * Escape-cascades (parent + nested both closing) and Tab-steals (parent's
 * "wrap to first" stealing focus from a nested modal). Identity-based via
 * Symbol per useState lazy init — provably correct under StrictMode dev
 * double-mount (synthetic cleanup pops, synthetic mount re-pushes the
 * same Symbol; indexOf+splice handles double-pop benignly).
 *
 * Caveat: assumes mount order = topmost order, which holds for nested
 * modals opened by user action (parent commits, then child commits in a
 * later tick). Not robust to programmatic simultaneous-mount of nested
 * modals in the same commit — child effect fires before parent's, so
 * stack=[child, parent] would put parent on top semantically wrong. No
 * such pattern exists in this codebase.
 */
export function useFocusTrap({ onClose, initialFocusRef, viewKey, triggerSelector }) {
  const [instanceId] = useState(() => Symbol('useFocusTrap'))
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  const triggerSelectorRef = useRef(triggerSelector)
  useEffect(() => { triggerSelectorRef.current = triggerSelector })
  const pendingObserverRef = useRef(null)

  useEffect(() => {
    if (pendingObserverRef.current) {
      pendingObserverRef.current.obs.disconnect()
      clearTimeout(pendingObserverRef.current.timeoutId)
      pendingObserverRef.current = null
    }
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
      if (modalStack[modalStack.length - 1] !== instanceId) return
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

    modalStack.push(instanceId)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      const idx = modalStack.indexOf(instanceId)
      if (idx !== -1) modalStack.splice(idx, 1)
      const sel = triggerSelectorRef.current
      if (sel) {
        const tryFocus = () => {
          const el = document.querySelector(sel)
          if (el instanceof HTMLElement) {
            el.focus()
            return true
          }
          return false
        }
        if (tryFocus()) return
        const obs = new MutationObserver(() => {
          if (tryFocus()) {
            obs.disconnect()
            clearTimeout(timeoutId)
            pendingObserverRef.current = null
          }
        })
        obs.observe(document.body, { childList: true, subtree: true })
        const timeoutId = setTimeout(() => {
          obs.disconnect()
          pendingObserverRef.current = null
        }, 500)
        pendingObserverRef.current = { obs, timeoutId }
        return
      }
      const trigger = triggerRef.current
      if (trigger && document.body.contains(trigger)) trigger.focus()
    }
  }, [])

  // A-14: re-shift focus when viewKey changes. First render is skipped via
  // ref guard so this effect is a strict no-op for callers that don't pass
  // viewKey — provably inert for the 40+ existing non-opt-in consumers.
  const isFirstViewKeyRender = useRef(true)
  useEffect(() => {
    if (isFirstViewKeyRender.current) {
      isFirstViewKeyRender.current = false
      return
    }
    if (viewKey === undefined) return
    const container = containerRef.current
    if (!container) return
    const target = initialFocusRef?.current ?? getFocusableElements(container)[0]
    target?.focus()
  }, [viewKey])

  return containerRef
}
