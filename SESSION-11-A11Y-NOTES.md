# Session 11 — Accessibility audit notes

Working doc. **Half-1: static-analysis inventory (Claude). Half-2: empirical keyboard + VoiceOver walks (you).** WCAG 2.1 AA target.

Static analysis is good at finding missing aria-labels, untouched `<div onClick>`, color-only signals, and CSS focus-style gaps. It cannot tell you whether keyboard tab order matches visual order, whether VoiceOver announces a page sensibly on first visit, or whether the modal-focus story actually feels right when you tab through it. The two halves are complementary.

---

## Static-analysis findings

### 🔴 Real WCAG-AA fails worth fixing this session

**A-01. 63 icon-only `<button>` elements lacking `aria-label`.**

Two variants of the same pattern:
- ~50 modal-close X buttons: `<button className="btn-icon" onClick={onClose}>✕</button>`. Screen readers will announce "x button" or fail silently. No aria-label, no surrounding `<span className="sr-only">`.
- ~13 row-action buttons using `title="..."` only. `title` is unreliable for screen readers — tooltip-only, not an accessible name. Examples: BagTemplatesPage edit/duplicate/delete pencils (lines 179-181), TeamBagDetailPage delete-bag X (line 259).

**Highest-leverage fix:** single sweep adding `aria-label` to every `.btn-icon` modal-close button (~50 sites, all the same `aria-label="Close"`) plus per-context labels for the row-action buttons (Edit / Duplicate / Delete / Remove etc.). One commit by surface: modal closes first (mechanical), row-action labels second (judgment-light but per-call-site). This is the highest count finding by far and the clearest WCAG-AA violation.

**A-02. Toast component announces nothing to screen readers.**

`src/components/Toast.jsx` renders messages in a plain `<div className="toast-container">`. No `role="status"`, no `role="alert"`, no `aria-live`. A screen-reader user submitting a form sees the visual toast and never knows if it succeeded or failed. The EmailStatusChip in Session 5 got `aria-live="polite"` correctly; Toast itself never did.

**Fix shape:** add `role="status" aria-live="polite" aria-atomic="true"` to the `.toast-container`, OR use `aria-live="assertive"` for `type === 'error'` toasts and `polite` for success/info. Single-component fix in `Toast.jsx` — touches ~5 lines.

**A-03. 11 clickable `<div>` / `<span>` elements (should be `<button>` or `<Link>`).**

These are non-semantic elements with `onClick` handlers — keyboard-unreachable, not announced as interactive by screen readers. Per-call-site judgment:

| File:line | Element | Action | Right shape |
|---|---|---|---|
| EquipmentDashboardPage.jsx:209 | `.stat-card` div | scrolls to attention | `<button>` |
| EquipmentDashboardPage.jsx:213 | `.stat-card` div | navigates `/tickets` | `<Link>` |
| EquipmentDashboardPage.jsx:217 | `.stat-card` div | navigates `/team-bags` | `<Link>` |
| EquipmentDashboardPage.jsx:244 | `.eqd-attention-row` div | navigates `/tickets/:id` | `<Link>` |
| EquipmentDashboardPage.jsx:331 | `.eqd-loc-card` div | navigates `/equipment` | `<Link>` |
| EquipmentDashboardPage.jsx:347-349 | `.eqd-bag-chip` spans (×3) | navigate `/team-bags` | `<Link>` |
| LocationsPage.jsx:225 | `.loc-card` div | switches active location (state) | `<button>` |
| LocationsPage.jsx:549 | `.stock-item-row` div | sets adding state | `<button>` |
| **BagTemplatesPage.jsx:198** | `.bt-card` div | opens edit modal | `<button>` |

**The BagTemplatesPage `.bt-card` is my own finding — I shipped it in Session 10 Cluster 1 (M-01).** I introduced an a11y regression while fixing the table-as-cards pattern. Calling it out explicitly so the audit log records the trade-off and so the fix lands in this session.

Fix is per-element. Cards-as-buttons need `text-align: left`, `background: inherit`, and either `appearance: none` or a className-based reset to keep visual styling. Cards-as-`<Link>` need similar styling resets but get the URL-changing behavior for free.

**A-04. TicketDetailPage comment textarea has no label** (`TicketDetailPage.jsx:289`).

Just a `<textarea>` with `placeholder="Add a comment..."`. Placeholder is not a label per WCAG — it disappears on focus and is announced inconsistently. Single-line fix: add `aria-label="Comment"` or precede with a visible `<label>`.

---

### 🟡 Medium-severity (defensible to defer, but real)

**A-05. Modal focus management — partial implementation.**

What's there:
- Several modals use `autoFocus` on the first form input (good)

What's missing across all modals:
- Focus does not return to the trigger button when the modal closes
- Tab key can escape the modal to the page behind (no focus trap)
- `onClose` triggered by overlay click doesn't restore focus

**Real fix is structural** — either a custom `useFocusTrap` hook or a small library (e.g., `focus-trap-react`). Big enough to deserve its own commit; complex enough that bundling with other a11y fixes would muddy the diff. Recommend its own cluster commit, possibly its own session if other fixes consume the budget.

**A-06. Avatar `<img>` has empty alt** (`BoardPage.jsx:208`).

`<img src={pos.profiles.avatar_url} alt="" />`. Empty alt is correct for purely decorative images, but a board member's avatar is content. Should be `alt={`Profile photo of ${pos.profiles.full_name}`}` or similar. One-line fix.

**A-07. TicketsPage priority dot is color-only** (`TicketsPage.jsx:164`).

A 10px circle whose color encodes priority (urgent/high/normal/low). `title` attribute provides hover text but not accessible name. Fix: either add a text label adjacent to the dot, or `aria-label={`Priority: ${ticket.priority}`}`, or convert the visual treatment to color + icon + text (most robust).

---

### 🟢 Acceptable / passing

- **Heading hierarchy** — clean across all routed pages. Every page has h1; h2/h3 nest properly. No skipped levels.
- **Form labels** — clean (only A-04 missing). The `.form-group > <label> + <input>` pattern is consistent across the app.
- **Outline replacements** — every `outline: none` in CSS has a corresponding `border-color` change or `box-shadow` focus indicator. Compliant.
- **Link / button semantics** — `<Link>` for navigation, `<button>` for actions. Throughout.
- **Color contrast on body text** — `--gray-500` (#6b7280) on white ≈ 6.6:1. Safe for AA. **Watch:** `--gray-400` (#9ca3af) ≈ 4.9:1 — barely passes AA for normal text. If anything depends on `--gray-400` for body content (not just disabled states), that's a future polish flag. Not in scope this session.

---

## Empirical walk — TODO (you in keyboard + VoiceOver)

Static analysis catches structural fails. Empirical pass catches the lived experience: tab order, announcement quality, what feels confusing.

**Setup (Mac):**
- VoiceOver: `Cmd+F5` to toggle
- Common VO commands: `Ctrl+Option+Right` (next item), `Ctrl+Option+U` (rotor for headings/links/forms)
- For Tab-only: keep VoiceOver off, hit Tab through every page

**Routes to walk:**
- `/dashboard`
- `/my-team`
- `/tickets`, `/tickets/new`, any `/tickets/:id`
- `/equipment`
- `/equipment/dashboard`
- `/members`
- `/treasurer`
- `/safety` (all 3 tabs)
- `/settings`
- `/profile`
- `/bag-templates`
- `/team-bags`
- `/locations`
- `/board`

**For each route, check:**

- [ ] Tab through every interactive element. Note where focus disappears or jumps unexpectedly
- [ ] Tab order matches visual order (left-to-right, top-to-bottom)
- [ ] All buttons reachable by keyboard (clickable divs from A-03 are the suspects — they're keyboard-unreachable)
- [ ] Modal flow: open a modal, can you Tab through everything inside? Can Tab escape? After close, where does focus land?
- [ ] Toast verification: trigger any save action with VoiceOver on. Does the toast announce? (A-02 says no, confirm)
- [ ] Status badges: with VoiceOver, listen to how a row's status announces. Color-only badges (TicketsPage priority dot, A-07) read as anonymous shapes
- [ ] First impression on each page with VoiceOver: does the page header announce? Does the page identity come through?

**Most likely to surface findings beyond static (based on patterns):**
- EquipmentDashboardPage — densest concentration of clickable-divs (8 of the 11 in A-03)
- Any page with a modal — A-05 modal focus story will be felt here
- TicketsPage list — priority dot (A-07) audible failure
- After form submits — toast silence (A-02)

---

## Triage suggestion

If we proceed:

**Cluster 1 — mechanical, high-count, low-risk (one or two commits):**
- A-01a: aria-label="Close" sweep across all 50 modal-close X buttons (find/replace pattern)
- A-01b: row-action button aria-labels (BagTemplates edit/duplicate/delete; TeamBagDetail delete-bag) — per-context labels

**Cluster 2 — single-component (one commit):**
- A-02: Toast `role="status" aria-live` — Toast.jsx only

**Cluster 3 — clickable-divs to semantic elements (one or two commits):**
- A-03: convert per-element to `<button>` or `<Link>`. Could split EquipmentDashboard (8 sites) from the others (3 sites including my own bt-card regression).

**Cluster 4 — small one-liners:**
- A-04: TicketDetailPage comment textarea aria-label
- A-06: BoardPage avatar alt text
- A-07: TicketsPage priority dot accessible name

**Out of scope this session (size doesn't fit):**
- A-05 modal focus trap + restore — its own cluster, possibly its own session
- `--gray-400` audit if any body text uses it — future polish

If your empirical walk surfaces more findings, they fold into the right cluster.

Hand back. Tell me which clusters land in this session vs defer.

---

## Empirical appendix (added after the keyboard-nav + DOM-inspection pass)

### Methodology disclosure

Empirical pass driven by keyboard navigation + JS `document.activeElement` tracking + accessible-name JS query (`getAttribute('aria-label') || getAttribute('aria-labelledby') || textContent`) + role/aria-live attribute inspection on the live DOM. **Not driven:** real VoiceOver / NVDA. Real screen-reader behavior (announcement quality, label-as-spoken, reading order) carries from static analysis until fix-verification time, at which point a real VoiceOver session is the right confirmation.

### Confirmations and refinements

**A-01 — CONFIRMED, severity higher than count alone suggests.** Static analysis flagged 63 sites; the empirical pass surfaced that count alone understates impact. The hamburger ☰ in the mobile header (`Sidebar.jsx`) has zero accessible-name fallback (no aria-label, no title, no SVG title) and is the most-encountered button in the entire app — every mobile route shows it. Modal close ✕ buttons announce as "X" (the literal Unicode glyph) on screen readers. Row-action pencils have `title` attribute which at least gives sighted users a tooltip but is unreliable for AT.

**Triage adjustment:** treat the hamburger as the highest-priority single fix, ahead of the broader 63-site sweep. Pair it with A-02 in Cluster 1 for the smallest highest-impact commit.

**A-02 — CONFIRMED.** `.toast-container` has `role: null, aria-live: null, aria-atomic: null`. Screen readers will not announce toasts at all. Single-component fix in `Toast.jsx`.

**A-03 — CONFIRMED with count refinement.** Static analysis flagged 11; raw "cursor-pointer non-button" count would balloon to 44+ on EquipmentDashboard alone. The truth is between the two:

- **False positives** to deduplicate:
  - Sidebar `<span class="nav-icon">` items inside `<NavLink>` parents — anchor handles keyboard activation, cursor:pointer is visual inheritance
  - `.stat-number` / `.stat-label` divs nested inside `.stat-card` parents — children inheriting cursor, not separate surfaces
  - Dashboard `.action-card` Quick actions — already `<a class="action-card">` with href, properly keyboard-reachable
- **Real A-03 candidates** after dedup:
  - `.bt-card` ×4 on `/bag-templates` (the Session 10 regression, OPS-02 lesson)
  - `.stat-card` cards on EquipmentDashboard (3, no anchor wrap)
  - `.eqd-loc-card` cards on EquipmentDashboard (7, no anchor wrap)
  - `.location-card` cards on `/locations` — needs verification on whether they're divs or anchors

**Triage adjustment:** don't fix every cursor-pointer div blindly. Audit each surface — convert to `<a>` if it navigates (Dashboard's `.action-card` is the reference pattern), convert to `<button>` if it triggers an in-page action. The bt-card regression specifically is `<button>` since it opens a modal (state change, not navigation).

**A-05 — PARTIALLY CONFIRMED.** Tested on `/locations` Add-a-location modal:
- ✅ Modal-open focus IS managed correctly. Focus moves from "+ Add location" trigger to the first `<input>` (autoFocus working).
- ❌ Modal-close focus restoration FAILS. After closing via X, focus returns to `<body>`, not the trigger button. **WCAG 2.4.3 (Focus Order) violation confirmed.**
- Focus-trap-inside-modal still untested (would need a Tab-cycling test). Static finding stands as suspected.

### Code-review-only carries

Three findings weren't reached during the empirical pass; static analysis stands without empirical confirmation:
- **A-04** TicketDetailPage comment textarea has no label (placeholder-only)
- **A-06** BoardPage avatar `alt=""` decorative-only on a content image
- **A-07** TicketsPage priority dot color-only (`title` attr, no accessible name)

### New findings (from Cluster 5 batch 2b verification — Session 12)

**A-17 (POLISH) — `useFocusTrap` focus restoration fails when trigger element is re-rendered between modal open and modal close.** Distinct from A-16 (which is about clickable-`<div>` triggers). A-17 is about `<button>` triggers that get unmounted/replaced during the modal's lifecycle — typically because the same state change that opens the modal also triggers a parent-component re-render that rebuilds the trigger's DOM node. The hook's snapshot captures the original button reference, but `document.body.contains(trigger)` correctly returns false on close (the snapshot's button has been unmounted), so restore-focus is skipped and focus falls back to body. **Not a hook bug — the guard is doing exactly what it should.**

**Empirically confirmed:** TeamsPage `BulkAssignModal` 🎒 bulk-assign trigger button (Cluster 5 batch 2b verification, Session 12). `window.__bulkTrigger` snapshot is a `<button>` but post-close `document.body.contains(trigger)` returns false. **Likely also affects:** TreasurerPage `+ Add transaction` button (the Treasurer anomaly noted in A-16's watch-item — same fingerprint, different site). Confirmation diagnostic: `console.log(triggerRef.current, document.body.contains(triggerRef.current))` in the hook's cleanup.

**Workaround (per-site):** ensure the trigger element is stable across the modal's lifecycle — extract the trigger to a memoized component, or stabilize the parent's render output so React reconciliation reuses the trigger DOM node. **Real fix (hook-level):** `useFocusTrap` could optionally accept a CSS selector for the trigger and re-resolve on close (find the current DOM element matching the selector instead of relying on the stale ref). Future-session work; pairs naturally with A-14's `viewKey` extension as a "v2 hook signature" cluster.

**Relationship to A-16:** A-16 and A-17 manifest the same symptom (focus lands on body after modal close instead of returning to trigger) but the root causes are different: A-16 is structural (trigger is non-focusable element type — fix by converting `<div>` to `<button>`); A-17 is lifecycle (trigger is a focusable element that's been unmounted during the modal cycle — fix by stabilizing the trigger or extending the hook to re-resolve at cleanup time). Same diagnostic question both times: is the trigger a `<button>` or a `<div>`? If `<button>`, A-17. If `<div>`, A-16.

Surfaced during: Cluster 5 batch 2b verification (Session 12).

**A-18 (POLISH, watch item) — Cluster 2 `aria-label` sweep gap on emoji-only buttons with `title=` only.** Surfaced during Cluster 5 batch 2b verification when probing the TeamsPage 🎒 bulk-assign button: it has `title="Assign gear to all teams"` but no `aria-label`. `title` is unreliable for AT — Cluster 2 (Session 11) explicitly fixed `title`-only buttons elsewhere but emoji-only triggers like 🎒 may have been missed because the Cluster 2 grep pattern likely targeted ✕ / ✎ / ⋯ glyph patterns rather than full Unicode emoji. **Quick diagnostic:** `grep -nE '<button[^>]*title=' src/pages/*.jsx` will surface remaining sites. **Fix:** single-line per site, add matching `aria-label`. Possibly multiple emoji-only buttons share the gap; ship as a small polish batch when a session has spare cycles. **Status:** not blocking; surfaced as a coverage gap, not a regression. Surfaced during: Cluster 5 batch 2b verification (Session 12).

---

### New finding (from Cluster 5 batch 2a verification — Session 12)

**A-16 (POLISH) — `useFocusTrap` focus restoration is a no-op for non-focusable triggers; clickable-div triggers contaminate downstream focus chains.** Surfaced during Cluster 5 batch 2a verification (Session 12). When a modal is opened by a clickable `<div>` (without `tabindex`), the hook correctly snapshots `document.activeElement` as the trigger, but the cleanup's `trigger.focus()` is a no-op because `<div>` without `tabindex` is not focusable. Focus falls to `<body>` instead.

**Affected pattern:** `BoardPage` `PositionCard` at line 168 — `<div onClick={onSelect}>` (not a `<button>`). Confirmed empirically: opening `PositionDetailModal` then pressing Escape leaves `document.activeElement === body`.

**Downstream contamination:** when a clickable-div modal flow hands off to another modal (e.g., PositionCard → PositionDetailModal → "Send invitation" button click → InviteModal), the focus chain is already polluted by the upstream `<div>` failure. InviteModal's hook snapshots `body` as its trigger (because PositionDetailModal's cleanup couldn't restore to PositionCard), so InviteModal's own close also lands on body. Not a separate hook bug; same root cause one level upstream.

**Relationship to A-03:** A-03 (Cluster 3, Session 11) closed clickable-div conversions for EquipmentDashboard / Locations / BagTemplates — 11 sites total. A-03's site list explicitly did not include BoardPage. A-16 extends the same fix-shape to BoardPage `PositionCard`. **Fix:** convert `<div>` to `<button>` with the same button-reset CSS pattern used in Cluster 3 (`background: transparent; border: none; text-align: left; font: inherit; color: inherit; cursor: pointer; width: 100%`), preserving visual styling. Same per-site shape, ~5 lines per affected site.

**Watch item — TreasurerPage `+ Add transaction` anomaly.** During the same verification round, focus-restore also failed on TreasurerPage `AddTransactionModal` close, even though the trigger IS a `<button>` (`src/pages/TreasurerPage.jsx:65`). The button is conditionally rendered: `{canEdit && tab === 'transactions' && <button>...}`. The modal's `onClose` fires `fetchAll()` which triggers a re-render. **Hypothesis:** if React briefly unmounts/remounts the button during the close cycle, the snapshotted `triggerRef.current` becomes detached and `document.body.contains(trigger)` returns false during cleanup. **Status:** needs diagnostic reproduction before filing as a separate audit ID. Recommend a `console.log(triggerRef.current, document.body.contains(triggerRef.current))` shim in the cleanup function during a debug session. If the trigger is genuinely detached at cleanup time, the hook needs a re-find mechanism (e.g., accept a `triggerSelector` arg or a callback to query the DOM at cleanup time). If the trigger is intact, this is a verification-methodology artifact (e.g., the async `fetchAll()` settling moved focus elsewhere after the cleanup ran). Either outcome is informative; the diagnostic is cheap.

Surfaced during: Cluster 5 batch 2a verification (Session 12).

---

### New findings (from Cluster 5 batch 2 read-pass — Session 12)

**A-13 (POLISH) — MembersPage assign-position is inline JSX, not a function component.** `src/pages/MembersPage.jsx:174-205` renders the assignment modal inline within MembersPage's render (gated by `{assigningPosition && ...}`). Adopting `useFocusTrap` from MembersPage's top-level fires the hook once on `/members` mount when modal isn't open; the early-return on missing container prevents listener registration. **Fix:** extract into `<AssignPositionModal>` component with normal mount/unmount lifecycle (~30-line refactor), then adopt `useFocusTrap` as standard. Skipped in Cluster 5 batch 2; refactor + adopt as standalone follow-up commit. Surfaced during: Cluster 5 batch 2 read-pass (Session 12).

**A-14 (POLISH) — `useFocusTrap` doesn't re-fire initial focus on multi-view modal switches.** The hook's `useEffect` runs once on component mount with empty deps (intentional — avoids listener churn). Components that swap views internally (form → success state, picker → form) keep the same component instance, so the effect doesn't re-run, and focus stays on body when view 2 mounts in place of view 1. Affects 6 sites in two shapes — two-overlay multi-view (separate `.modal-overlay` per branch): `BoardPage` `InviteModal`, `MyTeamPage` `InviteCoachModal`, `TeamsPage` `AssignGearModal`, `EquipmentPage` `SmartAddModal`. Single-overlay multi-view (one `.modal-overlay`, inner content swaps): `LocationsPage` `AddStockModal`, `TeamsPage` `BulkAssignModal`. Both shapes hit the same root-cause limitation. **Workaround applied in batch 2:** `modalRef` attached to both views' `.modal` divs (Tab cycling adapts to the new content correctly); initial-focus-on-view-switch documented as a known gap. **Real fix:** extend hook signature with optional `viewKey` arg whose change triggers focus-only re-fire (without tearing down listener or re-snapshotting trigger). Design questions to resolve in own halt: does `viewKey` re-fire initial focus only or also re-snapshot trigger? Future-session work. Surfaced during: Cluster 5 batch 2 read-pass (Session 12).

**A-15 (POLISH) — Modal stacking: Escape closes both nested and parent modal.** `useFocusTrap` listens on `document`. When a parent modal contains a nested modal (e.g., `TeamsPage` `GearDetailModal` opens nested `PickupModal` / `ReturnModal` / `ReplaceModal` / `AddBagItemModal`), both hooks' Escape handlers fire — closing the nested modal AND the parent. Annoying, not destructive. **Real fix:** small modal-stack registry (topmost modal handles Escape; outer ones bypass via early-return). Future-session work. Surfaced during: Cluster 5 batch 2 read-pass (Session 12).

---

### New finding (from Cluster 3 verification — application modals)

**A-11 (POLISH) — Modals throughout the app don't dismiss on Escape.** Surfaced during Cluster 3 OPS-02 keyboard-nav verification (2026-05-04). Procedure: opened Edit template modal on `/bag-templates` via Enter on focused `.bt-card-trigger`, pressed Escape — modal stayed open; had to mouse-click the X to close. Same family as A-09 (Escape dismiss missing on Equipment Actions menu) but at the **application-modal** level rather than the menu level. WAI-ARIA modal-dialog pattern requires Esc to close, and WCAG 2.1.1 (Keyboard) is failed for modal dismissal — keyboard-only users can open modals but cannot dismiss via keyboard.

**Bundling:** travels with A-05 (modal focus restoration) into Cluster 5 — both are "modal keyboard handling" structural fixes that probably want a single `useFocusTrap` hook or `<Modal>` wrapper component to address comprehensively. Splitting A-05 from A-11 would mean two passes over the same modals; bundling is cleaner. **Do NOT bundle into Cluster 4** (Cluster 4 stays scoped as A-04 + A-06 + A-07 + A-09 + A-10).

---

### New findings (from Cluster 2 verification — Equipment Actions ⋯ menu)

Surfaced while doing Layer 1B aria-expanded toggle verification on the Actions ⋯ button in `EquipmentPage`. Both POLISH; both deferred to Cluster 4 (do **not** block Cluster 3).

**A-09 (POLISH) — Equipment Actions ⋯ menu doesn't close on Escape.** The Cluster 2 commit added `aria-haspopup="menu" aria-expanded` to the trigger so screen readers announce the menu pattern. Empirically the menu opens/closes correctly via mouse and via the trigger button itself, and click-outside dismissal works. But pressing **Escape** while the menu is open does nothing. Keyboard users following the standard menu-button pattern (WAI-ARIA APG) expect Esc to dismiss; the absence is a small but real gap. **Fix shape:** `useEffect` while `openActionMenu` is non-null that adds a `keydown` listener and clears the menu on `Escape`. Single component, ~5 lines. **File:** `src/pages/EquipmentPage.jsx` (the openActionMenu state + popup region around lines 529–600).

**A-10 (POLISH) — Equipment Actions ⋯ popup items lack `role="menuitem"`.** The trigger declares `aria-haspopup="menu"` so screen readers expect a `role="menu"` container with `role="menuitem"` children. Currently the popup is a `<div>` containing plain `<button>` elements; they're keyboard-reachable and labeled, but they don't announce as "menu item 1 of 3" the way the WAI-ARIA pattern promises. Mismatch between declared role and rendered structure. **Fix shape:** add `role="menu"` to the popup container, `role="menuitem"` to each option button, and `aria-orientation="vertical"`. No state changes, no JS. **File:** same as A-09.

**Bundling:** A-09 + A-10 are the same surface (Actions ⋯ menu) and the same complexity tier as A-04 / A-06 / A-07 — bundle into Cluster 4.

---

### New finding (from Cluster 4 verification — NewTicketPage form)

**A-12 (POLISH) — `/tickets/new` `<textarea>` Description field not associated with its `<label>`.** The NewTicketPage Description field renders a `<label>Description</label>` adjacent to a `<textarea>` but the two are not associated via `for`/`id` or `aria-labelledby`. Screen reader users may pick up the label via proximity, but explicit association is the WCAG-recommended pattern. Different surface and different a11y issue than A-04 (which was the TicketDetailPage *comment* textarea, fixed via `aria-label="Comment"`). Single-line fix: add a matching `id` on the textarea + `htmlFor=` on the label, or add `aria-labelledby`. Surfaced during Session 11 Cluster 4 verification (2026-05-04). **Bundle with Cluster 5** if structurally adjacent (modal-vs-form-validation), otherwise its own small commit in Session 12.

---

### New finding (from empirical walk only)

**A-08 — DOWNGRADED from static-analysis "watch flag" to PASSING.** Static analysis flagged custom focus styles where `outline: none` is replaced by border-color or box-shadow. Empirical pass confirms: focus indicators on `/dashboard` "View teams →" link, `/dashboard` "Storage locations" Quick action card, and `/locations` location-card pencil button all show clearly visible focus rings (yellow-orange or blue, high contrast). No suppressed outlines. Move A-08 from "watch" to "passing." (Re-flag later only if a custom focus style we add ends up obscured.)

### OPS-02 confirmation

The Session 11 working-rules update (OPS-02 — keyboard-nav verification on layout work) is already paying for itself. Had OPS-02 existed at Session 10 Cluster 1 verification time, the bt-card keyboard-unreachability would have been caught at the Tab-through step rather than surfacing 8 sessions later in this audit. The rule lands in the right place; the immediate fix lives in A-03.

### Updated triage / cluster ordering

Empirically-informed cluster order:

**Cluster 1 — A-01 hamburger + A-02 toast.** Two highest-impact opacity fixes. Smallest diff, largest user-encountered surface (every mobile route + every save action). Single commit.

**Cluster 2 — A-01 broader sweep.** Remaining ~50 modal-close ✕ + row-action icon buttons get `aria-label`. Mechanical sweep, large diff but per-site simple.

**Cluster 3 — A-03 per-surface clickable-element fixes.** Cards-as-links where they navigate; cards-as-buttons where they trigger state. The bt-card regression lives here.

**Cluster 4 — A-04 + A-06 + A-07.** Three one-liners bundled.

**Cluster 5 (defer or own session) — A-05 modal focus restoration.** Structural fix (`useFocusTrap` hook or library). Big enough to deserve isolation.

Hand back to triage flow. Cluster 1 is up next.

---

## Session 11 close-out (2026-05-04)

### Shipped this session

**9 a11y findings closed across 5 polish + 4 doc commits, plus OPS-02 working-rule.**

| ID | Cluster | Surface |
|---|---|---|
| A-01 hamburger | Cluster 1 | `Sidebar.jsx` mobile hamburger `aria-label="Open menu" aria-expanded` |
| A-02 toast | Cluster 1 | `Toast.jsx` `aria-live` + per-toast `role="status"`/`role="alert"` |
| A-01 broader sweep | Cluster 2 | ~50 modal-close ✕ + row-action icon buttons across 16 routes (172 labeled / 0 unlabeled) |
| A-01 EquipmentPage extension | Cluster 2 | `/equipment` row actions + Actions ⋯ menu (138-site coverage gap closed) |
| A-03 clickable divs/spans | Cluster 3 | `bt-card` regression + 7 EquipmentDashboard surfaces + 2 LocationsPage surfaces — converted to semantic `<button>` / `<Link>` |
| A-04 textarea label | Cluster 4 | TicketDetailPage comment textarea `aria-label="Comment"` |
| A-06 avatar alt | Cluster 4 | BoardPage avatar `alt="Profile photo of {name}"` |
| A-07 priority dot | Cluster 4 | TicketsPage priority dot `role="img"` + `aria-label="Priority: {level}"` |
| A-09 menu Esc dismiss | Cluster 4 | EquipmentPage Actions ⋯ menu — `useEffect` Escape handler |
| A-10 menu role/menuitem | Cluster 4 | EquipmentPage Actions ⋯ popup — `role="menu"` + `aria-orientation="vertical"` + `role="menuitem"` × 7 + `role="separator"` |
| OPS-02 | Working rule | Keyboard-nav verification step on layout work — filed in `AUDIT_REPORT.md` |

### Verified empirically (live DOM + behavioral)

- **A-01** — DOM + VoiceOver (y/y/y), all 16 routes 0 unlabeled
- **A-02** — DOM (role/aria-live attributes) + VoiceOver (toast announcement)
- **A-03** — DOM (tagName: BUTTON / A) + keyboard nav (bt-card Tab + Enter activates modal)
- **A-09** — DOM (aria-expanded toggle) + behavioral (Esc closes) + rapid menu-switch (effect cleanup chain works)
- **A-10** — DOM (`role="menu"`, 7 × `role="menuitem"`, 1 × `role="separator"`)

### Code-review carries (data-state blocked, not empirically verified)

These three Cluster 4 fixes are committed and code-reviewed but couldn't be live-verified during the session because Demotte didn't have the data state to render them:

- **A-04** TicketDetailPage textarea `aria-label` — 0 tickets in Demotte
- **A-06** BoardPage avatar `alt` — no profile photos uploaded (only initial-letter fallbacks render)
- **A-07** TicketsPage priority dot `aria-label` — 0 tickets

The audit doc reflects this honestly. Empirical confirmation lands the next time these surfaces have data (organic encounter or test data seed).

### Deferred to Session 12

**Cluster 5 — Modal keyboard handling (A-05 + A-11) bundled.**

Architecture: `useFocusTrap` hook (Option A from Session 11 close-out architecture sketch). Pilot-then-sweep cadence.

Why hook over wrapper component:
- Purely additive — modals adopt opt-in; no risk of breaking ones that don't adopt yet
- 53 modal sites already have hand-rolled overlay/stop-propagation boilerplate; consolidating that is a *separate* refactor not load-bearing for WCAG
- Pilot-then-sweep gives natural halt-cadence checkpoints (one structural review, one mechanical sweep)

**Hook signature for Session 12 (refined):**

```js
const modalRef = useFocusTrap({ onClose })
// returns ref to attach to .modal container.
// Internally:
//   - on mount: snapshot document.activeElement, focus first focusable inside container
//   - listen for Escape (calls onClose) and Tab (cycles within container)
//   - on unmount: restore focus to snapshotted trigger
```

**`isOpen` parameter dropped.** Demotte's existing modals all unmount when closed (state-driven render), so the parameter has no current consumer. Trust callers to only invoke from inside an open modal's render tree. Cleaner API. If a future "always-rendered modal toggled via CSS" pattern arrives, add the parameter then.

**Per-site change shape (~5 lines):**

```diff
+ import { useFocusTrap } from '../hooks/useFocusTrap'
  function MyModal({ onClose }) {
+   const modalRef = useFocusTrap({ onClose })
    return (
      <div className="modal-overlay" onClick={onClose}>
-       <div className="modal" onClick={e => e.stopPropagation()}>
+       <div ref={modalRef} className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
```

**Session 12 commit plan:**
1. Pilot — new `src/hooks/useFocusTrap.js` (~70 lines) + BagTemplatesPage TemplateModal adoption (~5 lines). The bt-card regression's downstream modal is the canonical OPS-02 verification surface — best pilot site. Halt for verification.
2. Sweep — remaining ~52 modal sites across 15 files. Halt for verification.
3. Doc — A-05 + A-11 closure notes; A-12 may bundle here if structurally adjacent.

**Modal landscape inventory (from Session 11 close-out grep):**
- 53 sites total: BoardPage 3, BagTemplatesPage 1, CategoriesPage 1, AssignmentsPage 1, MembersPage 2, KitBuilderPage 5 (4 inline single-line), FieldsPage 1, LocationsPage 4, SettingsPage 1, MyTeamPage 2, EquipmentPage 8, SafetyPage 3, TeamBagDetailPage 4, TreasurerPage 2, TeamsPage 14, TeamBagsPage 1.
- All hand-rolled with the same `<div className="modal-overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>` boilerplate.
- No existing shared `<Modal>` component.

### Carry-forward to Session 12 or beyond

- **A-12** (NewTicketPage label-textarea association) — single-line fix, can bundle with Cluster 5 sweep or its own small commit.

### Methodology disclosure (transferable to Session 12)

Three-layer verification pattern used this session:
1. **DOM inspection** (driven by Claude or user via JS console) — viewport-independent, catches missing aria attrs / role values / structural shape
2. **Behavioral keyboard nav** (driven by user) — Tab order, focus visibility, Enter/Space activation, Escape dismissal, focus restoration
3. **VoiceOver/AT** (driven by user, often non-blocking) — announcement quality, name-as-spoken, reading order

Layer 1 + Layer 2 caught all five Cluster 4 failure modes that Layer 3 would catch. VO is a confirmation pass, not a gating pass. Where data-state blocks empirical verification (A-04 / A-06 / A-07 in this session), code-review carries are honest — log them in the audit doc rather than silently treating committed-as-verified.

### Final session 11 commit count

5 polish commits + 6 doc commits = **11 net commits**. 9 a11y findings closed live, OPS-02 process rule filed, A-12 carryforward filed, Cluster 5 architecture and pilot site documented in advance for Session 12.

---

## Cluster 5 close-out (Session 12 — structurally complete)

### Shipped this cluster

**40 component-adoptions of `useFocusTrap` across 15 routed page files**, plus the hook itself + decision-tree JSDoc.

| Phase | Sites | Files | Commit |
|---|---:|---:|---|
| Pilot — BagTemplatesPage `TemplateModal` | 1 | 1 | `fa2c85e` |
| Hook patch — `initialFocusRef` parameter (pre-sweep fix from pilot) | — | — | `58f0c4e` |
| Batch 1 — LocationsPage + EquipmentPage representative sites + JSDoc | 5 | 2 | `0c339e8` |
| Batch 2a — 8 medium files + INFO+ACTIONS rule extension | 17 | 10 | `5f737df` |
| Batch 2b — EquipmentPage + TeamsPage heavy-lift | 17 | 2 | `3416378` |
| **Total adopted** | **40** | **15** | |

Plus **1 deferred** (A-13 MembersPage inline modal extraction) + **7 orphan-skipped** (KitBuilderPage / AssignmentsPage / CategoriesPage per DEV-10 deletion plan).

### Empirically verified

~13 of 40 adopted sites verified via DOM + behavioral keyboard-nav across all 4 phases:
- TemplateModal (pilot, Layer 1-3 incl. VoiceOver hand-off)
- AddLocationModal, EditLocationModal, RemoveModal, HistoryModal (batch 1 sample)
- MembersPage AddMemberModal, TreasurerPage AddTransactionModal, BoardPage PositionDetailModal (both branches), BoardPage InviteModal (batch 2a sample)
- EquipmentPage ReceiveModal, TeamsPage AddSportModal, TeamsPage AssignGearModal (multi-view view-switch test), TeamsPage BulkAssignModal (batch 2b sample)

Pattern confidence is robust: every decision-tree branch (FORM, INFO+ACTIONS, multi-view two-overlay, multi-view single-overlay) has at least one empirically-verified site.

### Hook design decisions ratified

- **Empty-deps `useEffect`** + **`onCloseRef` pattern** — listener identity stable across parent re-renders (caught structurally in pilot pre-design).
- **`initialFocusRef` parameter** — added pre-sweep after pilot caught close-X-default issue. Optional; falls back to first focusable.
- **Decision tree** — FORM / INFO-ONLY / PURE CONFIRMATION / INFO+ACTIONS / FORM-with-destructive-primary, with **Principle line per rule** (so future contributors can extrapolate to edge cases).
- **Visibility filter** — `offsetWidth || offsetHeight || getClientRects().length`. Catches `display: none` reliably; doesn't catch `visibility: hidden` (gap noted but didn't surface during sweep).

### Carry-forward findings (5 audit IDs)

- **A-13** — MembersPage inline modal extraction (~30-line refactor before adoption)
- **A-14** — Multi-view modals don't re-fire initial focus on view switch (6 affected sites; documented gap; hook signature `viewKey` extension is future-session work)
- **A-15** — Modal-stacking: Esc closes both nested and parent modal (modal-stack registry future-session work)
- **A-16** — Focus restoration no-op for clickable-`<div>` triggers (BoardPage `PositionCard` primary case; extends A-03's scope)
- **A-17** (new this session) — Focus restoration no-op when trigger `<button>` re-renders during modal lifecycle (TeamsPage `BulkAssignModal` empirically confirmed; TreasurerPage `AddTransactionModal` likely; same fingerprint as A-16's Treasurer-watch-item, now confirmed as a distinct root cause)
- **A-18** (new this session, watch item) — Cluster 2 `aria-label` sweep gap on emoji-only `<button>` elements with `title=` only (TeamsPage 🎒 bulk-assign primary case; quick polish batch)

A-14 + A-17 pair naturally as a "v2 hook signature" cluster — both want hook-level extensions (`viewKey` for A-14, `triggerSelector` or trigger-ref-resolution-at-cleanup for A-17). Future session.

### Methodology refinements ratified

- **Synthetic KeyboardEvent dispatch** is the canonical verification technique for keydown listeners on modals. Chrome devtools key action doesn't deliver Esc to `document`/`window` listeners when focus is in a modal input. Use `dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))` instead.
- **Code-review the diff before believing a regression report.** Byte-identical-diff observation in the false-Escape-regression episode saved a wrong fix-forward commit.
- **File-boundary structural insurance** — splitting batch 2 into 2a/2b at file boundary added a third pre-sweep checkpoint at zero cost. Pilot-then-sweep cadence caught 3 issues this cluster (initial-focus close-X bug, Treasurer focus-restore anomaly later confirmed as A-17, JSDoc decision-tree extensions refined twice from feedback).
- **Real keyboard activation over programmatic click** — use Tab+Enter to open modals during verification, not raw `.click()`, to avoid stale-`document.activeElement` snapshot artifacts.
- **State-checking JSON dumps run BEFORE any navigate that follows them** — methodology discipline added mid-session after a phantom failure.

### Session 12 commit count (Cluster 5 + adjacent)

- 5 polish commits (pilot, hook patch, batch 1, batch 2a, batch 2b) + this commit's A-12 single-line fix = 6 polish
- 5 doc commits (A-13/14/15, A-16, A-17 + A-18 + this close-out) — JSDoc INFO+ACTIONS rule extension lived in batch 2a polish

Cluster 5 + adjacent = ~11 commits. Substantial session. Hook design + 40-site sweep + 5 audit findings filed (A-13/14/15/16/17 + A-18 watch item) + multiple methodology refinements.

### What's left after Cluster 5 close

- **A-12** (NewTicketPage label-textarea association) — single-line polish, lands in this session as the last code change.
- Future a11y sessions: A-13 (inline-modal extraction + adoption), A-14 + A-17 paired (v2 hook signature), A-15 (modal-stack registry), A-16 (clickable-div → button conversions across BoardPage), A-18 (emoji-button aria-label sweep).

After A-12 ships, **accessibility is closed for this session** modulo carry-forwards. Per the broader plan: 7 small DEV-N follow-ups (DEV-34/35/36/37/40/43/44) come next, then orphan resolution (DEV-10), then MISSING-tier features (UX-10, CSV exports, resend invitation).
