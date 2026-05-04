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
