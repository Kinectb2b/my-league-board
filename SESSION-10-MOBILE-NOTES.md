# Session 10 — Mobile + iPad layout notes

Working doc. **Half-1: static analysis from CSS + JSX (Claude). Half-2: empirical viewport walks at 390x844 / 1024x768 / 1366x1024 (you in Chrome DevTools).**

Static analysis catches structural responsive gaps; empirical walks catch visual cut-offs, unreachable buttons, scroll traps, and "just doesn't feel right" deltas. The two halves are complementary — neither alone gives the full picture.

---

## Static analysis findings (no Chrome required)

### Breakpoint structure — confirms your hypothesis

The app has **a single breakpoint at 768px**: `@media (max-width: 768px)` for mobile, `@media (min-width: 769px)` for desktop. **There is no tablet/iPad-specific breakpoint.** iPad portrait (1024x768) and landscape both render the desktop layout. Audit's UX-20 already noted this for EquipmentDashboard specifically; the broader pattern is that nothing in the codebase responds to the 768–1180px range as a distinct viewport.

Implication: iPad portrait is probably "works but feels squeezed" — desktop sidebar (~280px) + main content (~744px), no breathing room. Code-reviewable but the actual feel is your call.

---

### 🔴 Likely breaks the experience (worth fixing)

**M-01. Tables hard-set `min-width: 600px`.** `.data-table` in `src/index.css:543` carries a fixed minimum width. At 390px viewport, every table ends up horizontal-scrolling inside its `.table-container` (which has `overflow-x: auto`). Functional but the UX is "swipe sideways to see status column" — easily missed by users.

11 table instances across: Tickets, Members, Safety (Incidents, Checks), Treasurer, Settings (templates), BagTemplates, TeamBags, Locations, EquipmentPage, plus orphan AssignmentsPage.

Real fix shape is table-as-cards on mobile (each row becomes a stacked card). Quick fix shape is letting tables shrink (`min-width: 0`) and accepting tighter columns. The right answer is per-table — TicketsPage has the most columns and would need card-stacking; smaller tables like Treasurer might fit at 360px columns.

**M-02. SafetyPage Incidents + Checks tables lack `.table-container` wrapper.** `SafetyPage.jsx:90` and `:121` render `<table className="data-table" style={{ marginBottom: 0 }}>` directly inside the tab's card div, no `.table-container` wrapper around them. Without the wrapper, no `overflow-x: auto` — meaning the table forces its 600px `min-width` onto the parent, which can blow past the page padding at 390px.

The Kits tab uses a grid of cards instead of a table, so it's fine. **Two-line fix per table:** wrap each `<table>` in `<div className="table-container">`. Could bundle with DEV-42's wrapper fix on the same page.

**M-03. Icon buttons below 44pt tap target.** `.btn-icon` has `padding: 0.25rem; font-size: 1rem` → ~22-24px tall. `.btn-icon-sm` is smaller. These are the row-action buttons (edit pencil, delete X, "Actions" dot menu) on Members, Equipment, BagTemplates, Locations, Fields, etc. Apple HIG minimum is 44pt; these are roughly half that.

Real fix is bumping `.btn-icon` to `padding: 0.6rem` + `min-width: 44px; min-height: 44px` on mobile. Trade-off: row spacing gets denser/taller. May want a per-table layout sweep alongside.

---

### 🟡 Degraded but functional

**M-04. Primary / secondary buttons at 38-40pt.** Under the 44pt HIG floor but in the band most modern web apps live in. `.btn-primary` is `padding: 0.65rem 1.25rem; font-size: 0.95rem` → ~38-40px tall. Defensible if you decide consistency with the existing pattern beats strict HIG conformance; defensible the other way too.

**M-05. Toast doesn't respect `env(safe-area-inset-bottom)`.** `.toast-container` is `position: fixed; bottom: 1.5rem; right: 1.5rem`. On iPhones with home indicator (iPhone 12 Pro through current), the home indicator bar sits at the bottom — toasts can overlap. Fix: `bottom: max(1.5rem, env(safe-area-inset-bottom) + 0.5rem)`. One-line.

**M-06. TicketsPage filter bar wraps to 3 rows at 390px.** 4 selects (status, type, priority) + search input + counter span. `.filters-bar` has `flex-wrap: wrap`, so they stack vertically — but that's a lot of vertical space before the actual ticket list. Real fix is collapsing all filters behind a single "Filters" button at <768px (matches what EquipmentPage does on mobile via `setShowMobileFilters`). Bigger refactor.

**M-07. Stats-grid 2-col tight at 390px.** `.stats-grid { grid-template-columns: repeat(2, 1fr) }` at mobile. Each stat card ends up ~175px wide minus gap. Fine for compact stat-numbers; can feel cramped if the label is long ("Approved Checks" / "First Aid Kits"). Survivable, not a real fail.

---

### 🟢 Working OK (verified by code review)

**Sidebar mobile collapse.** Off-canvas drawer at <=768px. Hamburger in fixed top bar. Overlay backdrop on tap. Implementation is solid — no structural fixes needed for the collapse mechanism itself.

**Modal sizing.** `.modal` is `width: 100%; max-width: 540px` (with inline overrides up to 720px on BagTemplates). At 390px viewport with `.modal-overlay { padding: 1rem }`, modal renders at ~358px — fits cleanly. Mobile breakpoint adds `margin: 0.5rem; max-height: 90vh` overrides — also fine.

**App-layout column flow.** At <=768px, `.app-layout` flips to `flex-direction: column` so sidebar (when not in drawer mode) stacks above content. Doesn't matter much because the sidebar is fixed/absolute on mobile anyway.

**Modal `padding: 1rem` on overlay.** Gives modals a 16px page-edge gutter on every side. Decent.

---

### iPad-specific (no breakpoint exists, so most of this is "desktop layout in less space")

**M-08. EquipmentDashboard 1023/1024 boundary (already audit's UX-20).** CSS uses `@media (max-width: 1023px)` to drop side-by-side panels to single column. iPad portrait is 1024px wide — just barely on the desktop side, gets the side-by-side layout in a viewport that's too narrow for it. Move the breakpoint to `@media (max-width: 1180px)` or add a tablet-specific 2-col layout.

**M-09. Sidebar takes 280px of 1024px viewport (27%).** No iPad breakpoint to collapse it. Main content gets ~744px, which is OK but the sidebar's `Bag templates` / `Team bags` / etc. labels start to feel oversized. Two reasonable directions: (a) collapsed-icon-only sidebar at 768–1180px (saves ~200px), (b) compress sidebar typography slightly at <1180px. Or accept it and ship.

**M-10. Tables on iPad portrait are fine — fit comfortably.** `min-width: 600px` of `.data-table` fits in ~744px main-content width without horizontal scroll.

**M-11. Modals on iPad portrait are fine — `max-width: 540px` (or 720px) sits centered with breathing room.**

---

## Empirical walk — TODO (you in Chrome DevTools)

I can't drive Chrome from here. Below is the punch-list to walk through at the keyboard. Append findings inline under each route or add a new section at the bottom; either works.

**Devices to set in DevTools:**
- iPhone 12 Pro (390x844)
- iPad (1024x768 portrait)
- iPad (1366x1024 landscape) — only if you spot something different from 1024 portrait

**Routes to walk** (skip orphan / static):
- `/dashboard`
- `/equipment/dashboard`
- `/equipment` (Inventory)
- `/team-bags` (and `/team-bags/:id`)
- `/bag-templates`
- `/teams`
- `/locations`
- `/fields`
- `/tickets` (and `/tickets/new`, `/tickets/:id`)
- `/my-team` (and `/my-team/:id`)
- `/board`
- `/members`
- `/safety` (all three tabs)
- `/treasurer`
- `/settings`
- `/profile`

**For each route, look for:**
- [ ] Horizontal scroll on the page itself (page-level overflow, not inside a `.table-container`)
- [ ] Header / sidebar collision or overlap with content
- [ ] Tap targets that feel too small (icon buttons, row actions, filter chips)
- [ ] Modal: does it fit? Are buttons reachable? Does it scroll cleanly?
- [ ] Empty states (just shipped Cluster 3) — centered horizontally, CTA tappable
- [ ] Form fields too narrow / labels truncated
- [ ] Toast positioning — does it overlap home indicator? Is it cut off by safe area?
- [ ] Anything that just feels wrong

**Routes most likely to surface issues based on static analysis:**
1. `/tickets` (M-06: 4-filter wrap, M-01: wide table)
2. `/equipment` (already has mobile-aware patterns from prior work, but it's the 2110-line mega-page — verify the mobile tree + filter overlay still work)
3. `/safety` (M-02: tables likely overflow, all three tabs)
4. `/locations` (table-in-detail-panel, transfer modal complexity)
5. `/board` (16-position grid, may not collapse cleanly)

---

## After your walk: triage

Once your empirical findings land in this doc, we'll triage:
- 🔴 Real breaks → fix this session
- 🟡 Polish → defer or fix opportunistically  
- 🟢 Acceptable → leave

Static-analysis estimate: 2–4 fix clusters (tables, icon-button tap targets, toast safe-area, iPad breakpoint). Could be more once empirical findings come in.

Hand back.
