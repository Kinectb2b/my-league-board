# MLB Audit — 2026-04-28

> **Updated 2026-04-28 evening** with live-DB verification results from the human (see "Live DB verification update" below). Three "verify with human" items are now closed; one new finding (silent enum violation in `TeamBagDetailPage.markAssigned`) and one missed status (`incomplete`) shift the recommended first batch.

## Executive summary

The product is closer to ship-ready than it might feel: routing, RBAC, equipment tracking, ticketing, and the auto-bag flow are coherent and largely working. The biggest fire is **bag-status fragmentation**: live DB `bag_status` enum is `(building, built, picked_up, returned, incomplete)`, but `TeamBagsPage.STATUS_CONFIG` only knows three of those, the filter dropdown only offers two of those, and `TeamBagDetailPage.markAssigned` writes `status: 'assigned'` to `team_bags` — a value that exists in a *different* enum (`item_status` for `equipment_items`) and produces a silent Postgres enum-violation error because the result isn't destructured and the caller toasts success regardless. So all 17 production bags are `picked_up`, the admin's Team Bags table mislabels them all as "Building", and the "Mark as assembled" button in detail view appears to do nothing. Coach-facing My Team is in flight (uncommitted) and will land cleanly once committed — the `bag_summary` view it depends on is verified to exist with the right columns. There is real but containable security drift: token-only invitation acceptance with no email match, an `activity_log` insert policy that doesn't pin `actor_id`, a `tickets` UPDATE policy with no `WITH CHECK`, and a `transfer_stock` RPC that doesn't verify locations belong to the caller's org. The initial-schema migration is a TODO stub — the live DB has the canonical schema but no migration captures it; this is the highest-leverage non-functional fix. Surprisingly clean: ticket lifecycle + audit log via DB triggers, `apply_stock_event` invariant maintenance, RLS on the sensitive tables (incident reports, background checks), and the per-page `friendlyError` translator. Polish is largely typography drift, status-config inconsistency, and inline styles instead of CSS classes — fixable in a single design pass.

## Confidence statement

**Verified directly in this session:**
- Repo state, branches, and uncommitted diff (`git status`, `git log -30`, `git diff src/pages/MyTeamPage.jsx`).
- Every file under `src/` (49 files): every page, every context, every lib, every component.
- Every migration in `supabase/migrations/` (17 files) — read in full.
- The Edge Function source `supabase/functions/send-invitation-email/index.ts`.
- Whether each page is wired into routing (App.jsx) and the sidebar.
- Code-side references to tables, views, columns, statuses (via grep across `src/`).

**Could NOT verify in this session:**
- Live DB schema. The Supabase CLI on this machine is logged into a different account/orgs and does not have access to MLB's project (`crfccsmymyzdbtlwwrzf`); the `.env` only has the anon key, which can't query `information_schema`/`pg_policy`. Anything Phase B says about "live DB" is **inferred** from migrations + code references and clearly marked.
- Whether `bag_summary` and `equipment_totals` views currently exist in the live DB. Code references them (MyTeamPage uncommitted; brief mentions both); no migration creates them; the brief says they were "recently added." I have to assume they exist but cannot confirm column names.
- Actual RLS policy text for tables not created by tracked migrations (the unrecorded baseline). I can only see the policies created/altered in the 17 tracked migrations; the rest are inferred from code behavior.
- Whether the deployed Edge Function matches the file in repo. No way to compare without project access.
- Live behavior in a browser. The dev server was not started, no Playwright/Puppeteer.

**Where I'm guessing and saying so:** when a page references a column that no migration creates (e.g., `team_bag_items.is_packed`, `team_bags.bag_tag`, `equipment_items.size`), it must exist in the live DB because production runs, but I cannot enumerate every column. Findings labeled "verify with human" are exactly these cases.

### Live DB verification update (2026-04-28 evening)

The human ran a SQL-editor pass against `crfccsmymyzdbtlwwrzf` and reported back. Closed items:

- **`bag_summary` view exists** with columns `bag_id, organization_id, team_id, team_name, division_name, sport_name, template_id, template_name, status, picked_up_by_name, picked_up_at, built_at, bag_notes, item_count, items_missing`. The uncommitted `MyTeamPage.jsx` selects `item_count, items_missing, bag_id` — matches.
- **`equipment_totals` view exists** (`organization_id, equipment_item_id, item_name, brand, size, location_count, total_quantity, by_location`) but no code reads it. Dead-or-pending.
- **`team_bag_items.category_id` FK exists** as `team_bag_items_category_id_fkey → equipment_categories(id)`. Both BUG 1 hypotheses (wrong column name; missing FK) are now disproven. Whatever broke the coach items list is somewhere else — RLS, query shape, or already fixed by the uncommitted refactor as a side-effect.
- **All 17 production bags are `picked_up`**. Confirmed.
- **No CHECK constraints on `team_bags`**; the `bag_status` enum is the only gate.

New findings from the verification:

- **`bag_status` has FIVE values, not four:** `building, built, picked_up, returned, incomplete`. The original Recommended First Batch assumed a 4-status lifecycle and missed `incomplete` (likely a "handed off with items missing" side-state). Updated below.
- **The audit conflated three status enums.** `'assigned'` is a value in `item_status` (for `equipment_items`), not `bag_status` (for `team_bags`). So `TeamBagDetailPage.markAssigned` writing `status: 'assigned'` to `team_bags` is not a "model fragmentation" — it's a **silent enum-violation error** in production: the call returns an error, but the code doesn't destructure `{ error }`, the toast fires regardless, `fetchAll()` re-renders the bag in its old status, and the user sees success-text + no change. Reproduced this read in `src/pages/TeamBagDetailPage.jsx:142-153`. Severity unchanged (still MUST-FIX) but the failure mode is sharper than originally described.

Three enums in play, for the record:

| Enum | Values | Used by |
|---|---|---|
| `bag_status` | `building, built, picked_up, returned, incomplete` | `team_bags.status` |
| `team_bag_item_status` | `active, swapped_out, lost, damaged, returned` | `team_bag_items.status` |
| `item_status` | `available, assigned, in_repair, lost, retired` | `equipment_items.status` |

`AssignmentsPage.jsx` writes `equipment_items.status='assigned'` — semantically valid against `item_status`. Just orphaned from routing.

Still to verify (deferred to schema-dump session):
- `transfer_stock` RPC + `apply_stock_event` trigger source vs. migrations 16 and 6.
- RLS policies for the unrecorded-baseline tables listed in Phase B below.
- Full column listing for `team_bag_items` (specifically `is_packed`, `packed_at`, `notes`).

These will all fall out of `pg_dump --schema-only` in Session 1 (DEV-02) — not worth piecemeal SQL-editor work.

---

## Phase A — Repo state

### Stack
- React 19.2, Vite 7.3, vite-plugin-pwa 1.2 (autoUpdate, NetworkFirst Supabase cache, CacheFirst images).
- `@supabase/supabase-js` 2.102, `@sentry/react` 10.49, `react-router-dom` 7.14.
- ESLint flat config with `react-hooks` and `jsx-a11y` recommended.
- No tests configured. No TypeScript.
- Vercel static hosting; `vercel.json` rewrites everything to `/index.html` (SPA fallback). 

### Git
- Branch: `main`, up to date with `origin/main`, head `e91c70b feat(locations): batch transfer UI + transfer_stock RPC`.
- Sibling branch `phase-1-hardening` (`bfba9ec`) — local-only, last touched contact email + Privacy/Terms links. Not active in this audit.
- **Uncommitted:** `src/pages/MyTeamPage.jsx` (in-progress coach-facing fix described below).
- **Untracked:** `supabase/.temp/` (CLI cache, gitignorable).

### `src/` tree (one-line notes)

```
src/
├── App.jsx                              26 routes wired; `/kit-builder` and `/assignments` not routed
├── main.jsx                             Sentry init (DSN-gated), StrictMode, ErrorBoundary
├── index.css                            (not read; design tokens live here per inline style refs)
├── components/
│   ├── AppLayout.jsx                    sidebar + main shell
│   ├── EquipmentIcon.jsx                12 SVG glyphs, no a11y label
│   ├── ErrorBoundary.jsx                catches → Sentry, prod-friendly UI
│   ├── PWAInstallPrompt.jsx             beforeinstallprompt + dismiss persistence
│   ├── PWAUpdatePrompt.jsx              new-version banner via vite-plugin-pwa hook
│   ├── Sidebar.jsx                      role-gated nav; "My Team" + "Board" not gated
│   └── Toast.jsx                        3-second timer toast, no manual dismiss
├── contexts/
│   ├── AuthContext.jsx                  signUp/signIn/signOut + profile fetch
│   └── OrgContext.jsx                   memberships + currentOrg + role helpers (uses useUserRoles)
├── hooks/
│   └── useUserRoles.js                  fetches user_roles for (user, org)
├── lib/
│   ├── activity.js                      logActivity helper
│   ├── autoAssignBag.js                 team-creation auto-bag flow with division match
│   ├── boardPositionRoles.js            POSITION_TO_ROLES + grouping
│   ├── coachTeams.js                    union of head-coach teams + role-scoped coach teams
│   ├── errors.js                        friendlyError translator (Postgres SQLSTATE-aware)
│   ├── permissions.js                   hasRole / hasAnyRole / hasAllRoles
│   ├── supabase.js                      anon-key client (throws if env missing)
│   ├── ticketAttachments.js             upload + signed URL (10MB cap, image/PDF)
│   └── ticketRouting.js                 TICKET_TYPES table + status/priority colors
└── pages/
    ├── AcceptInvitePage.jsx             token-based; **does not check email match**
    ├── AssignmentsPage.jsx              ORPHAN — not in App.jsx; uses obsolete `equipment_items.status='assigned'`
    ├── AuthPage.jsx                     signin/signup/reset; ToS gate on signup only
    ├── BagTemplatesPage.jsx             template editor (379 lines)
    ├── BoardPage.jsx                    board directory; overlaps MembersPage (576 lines)
    ├── CategoriesPage.jsx               ORPHAN — not routed
    ├── Dashboard.jsx                    KPIs + alerts; uses 4-status bag model
    ├── EquipmentDashboardPage.jsx       EM dashboard (453 lines); /equipment/dashboard
    ├── EquipmentPage.jsx                **2110 lines** — single-file mega-page; inventory CRUD + tree
    ├── FieldsPage.jsx                   fields CRUD + status filter
    ├── KitBuilderPage.jsx               ORPHAN — not in App.jsx; uses 4-status bag model
    ├── LandingPage.jsx                  marketing/feature grid
    ├── LocationsPage.jsx                location CRUD + stock + transfer modal
    ├── MembersPage.jsx                  also "Board Directory"; overlaps BoardPage (344 lines)
    ├── MyTeamPage.jsx                   coach landing + per-team detail (uncommitted edits)
    ├── NewTicketPage.jsx                ticket creator with attachment upload
    ├── OrgSetupPage.jsx                 (not read; org-creation gate)
    ├── PrivacyPage.jsx                  static; mentions COPPA-relevant content (good)
    ├── ProfilePage.jsx                  (not read)
    ├── SafetyPage.jsx                   incidents/checks/kits, role-gated
    ├── SettingsPage.jsx                 templates + categories + equipment + org info
    ├── TeamBagDetailPage.jsx            **uses 3-status flow with `assigned` write**
    ├── TeamBagsPage.jsx                 **same 3-status flow; STATUS_CONFIG missing built/picked_up**
    ├── TeamsPage.jsx                    teams + divisions + bags, **uses 4-status flow** (884 lines)
    ├── TermsPage.jsx                    static
    ├── TicketDetailPage.jsx             single-ticket view + comments
    └── TicketsPage.jsx                  ticket list with my/assigned/all tabs
```

### Migrations (in order)
1. `20260407_initial_schema.sql` — **stub TODO**; no recorded baseline. ⚠️
2. `20260408_activity_log.sql` — table + indexes + RLS (members read/write).
3. `20260408_invitations.sql` — table + token + 7-day expiry + RLS.
4. `20260420_safety_officer_role.sql` — enum value + tighter RLS on incidents/checks/kits.
5. `20260422_multi_role_system.sql` — enum values + `user_roles` + `has_role`/`has_any_role` helpers.
6. `20260422_stock_events.sql` — event-log + `apply_stock_event` trigger + RLS; appends `case_size` to `equipment_items`.
7. `20260422_tickets.sql` — tickets + comments + attachments + events + `team_bag_items` swap fields + `auto_assign_on_team_create`; RLS via `can_view_ticket`. **`tickets_update` lacks `WITH CHECK`.**
8. `20260423_category_hierarchy.sql` — `equipment_categories.parent_category_id`.
9. `20260423_invitation_board_fields.sql` — `full_name`, `phone`, `board_position_id`, `intended_roles`, `welcome_message` on invitations.
10. `20260423_invitation_email_tracking.sql` — `email_sent_at` on invitations.
11. `20260424_backfill_minor_a_baseball_bags.sql` — DO-block backfill for Demotte Minor A.
12. `20260424_fields.sql` — fields table + RLS.
13. `20260424_invitation_scope_columns.sql` — `scope_type`, `scope_id` on invitations.
14. `20260424_invitation_scope_unique.sql` — partial unique index, allows re-scoped invites for same email; coach insert policy.
15. `20260424_kit_templates_rls.sql` — RLS on `kit_templates` + `kit_template_items`.
16. `20260427_transfer_stock_rpc.sql` — atomic batch transfer RPC. **Does not check from/to-location org membership.**

### Edge Function
- `send-invitation-email/index.ts`: takes `invitation_id`, fetches via service-role, builds HTML+text, sends via Resend, marks `email_sent_at`. **Does not authorize the caller** — any client with the function URL and a valid `invitation_id` can trigger an email. CORS is `*`.

---

## Phase B — Schema reconciliation

> ⚠️ **Could not query live DB.** The notes below combine: (a) what the 17 tracked migrations create or alter, (b) what the code references. Any column referenced by code but absent from migrations *must* exist in the live DB (production runs), but I cannot enumerate them precisely. Items marked "verify with human" need a SQL Editor pass.

### Tables referenced from code (34)

`activity_log`, `background_checks`, `bag_item_replacements`, `bag_summary` (view), `board_positions`, `budget_categories`, `divisions`, `equipment_assignments`, `equipment_categories`, `equipment_items`, `fields`, `first_aid_kits`, `incident_reports`, `invitations`, `kit_template_items`, `kit_templates`, `location_stock`, `organization_members`, `organizations`, `profiles`, `seasons`, `sponsors`, `sport_types`, `stock_events`, `storage_locations`, `team_bag_items`, `team_bags`, `teams`, `ticket_attachments`, `ticket_comments`, `ticket_events`, `tickets`, `transactions`, `user_roles`.

### Reconciliation by table

**`team_bags`** — referenced columns: `id`, `organization_id`, `team_id`, `kit_template_id`, `season_id`, `status`, `bag_tag`, `built_by`, `built_at`, `picked_up_by_name`, `picked_up_at`, `returned_at`, `returned_condition`, `created_at`. Migration 7 only adds `auto_assign_on_team_create` to `kit_templates` (not `team_bags`). All other columns must be in the unrecorded baseline. **Verified live (2026-04-28):** `bag_status` enum is `(building, built, picked_up, returned, incomplete)` — five values, not four. No CHECK constraint. Code writing `status: 'assigned'` (TeamBagDetailPage.jsx:144) is invalid against this enum and silently errors in production.

**`team_bag_items`** — referenced columns: `id`, `team_bag_id`, `category_id`, `equipment_item_id`, `is_required`, `is_packed`, `notes`, `packed_at`, `status`, `swapped_out_at`, `swap_reason`, `replacement_item_id`, `returned_at`. Migration 7 adds the swap-related columns and `status`. **Verified live (2026-04-28):** FK `team_bag_items_category_id_fkey` on `category_id → equipment_categories(id)` exists and is conventionally named. Both BUG 1 hypotheses (wrong column name; missing FK) are disproven. Where the empty-items-list bug actually came from is now an open question — could be RLS, could be a different query shape, could already be incidentally fixed by the uncommitted refactor. **Verify on next run:** open `/my-team` as a coach against current `main` (without uncommitted edits) and confirm whether the bug still reproduces.

**`bag_summary` (view)** — **Verified live (2026-04-28).** Exists with columns `bag_id, organization_id, team_id, team_name, division_name, sport_name, template_id, template_name, status, picked_up_by_name, picked_up_at, built_at, bag_notes, item_count, items_missing`. Uncommitted `MyTeamPage.jsx:227-230` selects `item_count, items_missing, bag_id` — matches. No graceful-fallback shim needed. Capture in a migration during Session 1.

**`equipment_totals` (view)** — **Verified live (2026-04-28).** Exists (`organization_id, equipment_item_id, item_name, brand, size, location_count, total_quantity, by_location`). No code reads it. Either dead or pending wire-up; decide in a future session.

**`stock_events` + `apply_stock_event`** — fully captured by migration 6. Code-side `transfer_stock` RPC matches migration 16. Trigger on AFTER INSERT is correct.

**`tickets`** — migration 7 covers schema. Code-side: `tickets_update` policy lacks `WITH CHECK`, so a permitted updater (admin/opener/assignee) could in principle change `organization_id`. Likely dormant because no UI sends `organization_id`; still a hardening gap.

**`activity_log`** — migration 2 captures schema and policies. Insert policy is `is_org_member(organization_id)` — does **not** require `actor_id = auth.uid()`. Anyone in the org can write a row attributed to anyone else. Audit-log integrity hole.

**`invitations`** — migrations 3, 9, 10, 13, 14 cover the columns. The **token+expires_at** is the only gate; `accepted_at IS NULL` is the only uniqueness handle. **`AcceptInvitePage` does not check `invitation.email == auth user email`.** Anyone with the URL can claim it on any account.

**`fields`** — migration 12. Code matches.

**`kit_templates` / `kit_template_items`** — migration 15 creates RLS. Code references `kit_templates.sport_type_id`, `division_name`, `auto_assign_on_team_create`. Code-side bug: `TeamsPage` AssignGearModal `createTemplate` (lines 374–377) inserts `kit_template_items` rows with **`equipment_item_id: i.category_id`** — stuffs a category id into the equipment_item_id column. This wrong-column write would silently corrupt template data; verify how impactful it is in practice (this modal may rarely be used since /settings has its own template editor).

**`user_roles`** — migration 5. Helper `has_role` is league-OR-scope; `has_any_role` is org-only. Both are SECURITY DEFINER STABLE — fine.

**RLS we know nothing about** (created in unrecorded baseline): `equipment_items`, `equipment_categories`, `equipment_assignments`, `location_stock`, `storage_locations`, `teams`, `divisions`, `seasons`, `sport_types`, `organizations`, `organization_members`, `profiles`, `team_bags`, `team_bag_items`, `bag_item_replacements`, `transactions`, `budget_categories`, `sponsors`, `board_positions`. **Verify with human:** dump `pg_policy` for each of these.

### Code references that do not match any migration (all "verify with human")

- `equipment_items` columns: `name`, `brand`, `size`, `quantity`, `status`, `item_condition`, `category_id`, `case_size` (only `case_size` is in a tracked migration).
- `location_stock` columns: `quantity`, `target_quantity`, `updated_at` (none recorded).
- `storage_locations` columns: `name`, `is_supply_room` (none recorded).
- `teams.head_coach_id`, `teams.color`, `teams.division_id`.
- `divisions.sort_order`, `season_id`, `sport_type_id`, `name`, `age_range`.
- `seasons.is_active`, `name`.
- `board_positions.title`, `assigned_to`, `appointed_date`, `is_required`, `description`, `sort_order`.
- `profiles.full_name`, `email`, `phone`, `avatar_url`.

---

## Phase C — Routes × viewport matrix

> ⚠️ Could not exercise the running app. Notes below are static analysis from JSX: structural mobile fit, role gates, empty/loading/error coverage. **Live walk required before ship.**

| Route | Mobile fit | iPad fit | Desktop fit | Empty / loading / error | Notes |
|---|---|---|---|---|---|
| `/dashboard` | OK; `stats-grid` likely 2-col on phone, but one-line bag chips line-wrap | OK | 6-stat horizontal row could squeeze on 1280 | Loading skeleton ✓; activity empty state ✓; checklist for new orgs ✓; **no error state** if any of 9 parallel queries fails | Has `Updated <time>` + manual refresh — good. |
| `/equipment` | 2110-line single-component page; tree + filters likely heavy on small screens | likely OK | OK | Have not verified | Top maintenance risk; split warranted but **out of scope for this audit's MUST-FIX**. |
| `/equipment/dashboard` | Has explicit mobile breakpoints (`@media 1023/640`) ✓ | ✓ | ✓ | Per-panel skeletons ✓; "Everything looks good" empty ✓ | Cleanest dashboard surface. |
| `/teams` | Drag-to-reorder relies on HTML5 DnD — **non-functional on touch**. | OK with sidebar | OK | Skeleton ✓; sport/season empty states ✓ | "Teams" is the admin's bag-management entry point; uses 4-status. |
| `/locations` | `beforeunload` guard for unsaved changes ✓ | OK | OK | Have not verified | Not deeply audited. |
| `/treasurer` | 4-col stats may stack ungracefully | OK | OK | Skeleton ✓ | Role-gated to `admin` only. |
| `/safety` | 4-col stats | OK | OK | Skeleton ✓; tab counters ✓ | Role-gated to `admin` + `safety_officer`. |
| `/board` | 576 lines; cards in `auto-fill 320px` — works | OK | OK | Skeleton ✓ | **Overlaps `/members`** — same heading "Board of Directors". |
| `/members` | Same heading | OK | OK | Skeleton ✓ | See `[UX-04]`. |
| `/settings` | OK | OK | OK | Have not verified | Template + category editors. |
| `/tickets` | 4 filter selects in `filters-bar` likely wrap on phone | OK | OK | Spinner only, no skeleton | "My/Assigned/All" tabs — need to verify role gates on Assigned tab. |
| `/tickets/new` | OK | OK | OK | "File too large" inline error ✓ | Pre-fills from query params nicely. |
| `/tickets/:id` | Comment thread layout — not verified | OK | OK | Have not verified | |
| `/bag-templates` | Long forms on phone — likely cramped | OK | OK | Have not verified | |
| `/team-bags` | Table doesn't collapse on small screens — likely horizontal scroll | OK | OK | Empty/no-templates ✓ | **Status badges show "Building" for `picked_up` bags — BUG 2 confirmed.** |
| `/team-bags/:id` | Item list responsive at 768; bag-item-actions stack | OK | OK | Have not verified | Writes `status='assigned'` on pickup — fragmenting status. |
| `/fields` | Card grid OK | OK | OK | Have not verified | URL `?status=` accepted but only `'all'` in dropdown. |
| `/my-team` | **Mobile-first by intent**; checkbox row + stacked actions | OK | OK | "No teams" empty ✓; loading ✓ | Uncommitted edits add packed-toggle + missing-note flow. Depends on `bag_summary` view. |
| `/profile` | Have not read | | | | |
| `/privacy` `/terms` | Static, max-width 720, bg gradient | OK | OK | n/a | Linked from sidebar footer + signup gate. |
| `/auth` | Form-only, narrow | OK | OK | Inline error ✓; reset flow ✓ | ToS gate on signup ✓. |
| `/accept-invite` | Narrow form | OK | OK | "Invalid/expired" branch ✓ | **Email-match check missing.** |
| `/setup` | Have not read | | | | |

**Cross-cutting:**
- `ProtectedRoute` returns plain `<div className="loading-page">Loading...</div>` during auth+org load. Every navigation flashes this. No skeleton.
- Most pages re-fetch on `currentOrg` change with no caching — switching orgs triggers full refetch on every page.
- `useUserRoles` runs once per page that calls it via `OrgContext`; `Sidebar` calls `hasAnyRole` which triggers re-renders across the tree on role updates.
- N+1 patterns: TicketsPage fetches tickets, then a second query for profiles by id list — already optimized with `.in()`. Acceptable.

---

## Phase D — Three-lens findings

### Developer findings

- **[DEV-01] Bag-status fragmentation + silent enum violation — MUST-FIX.** Live `bag_status` enum is `(building, built, picked_up, returned, incomplete)`. `TeamsPage`/`Dashboard`/`MyTeamPage(uncommitted)`/`KitBuilderPage` use the right vocabulary (minus `incomplete`); `TeamBagsPage` and `TeamBagDetailPage` use `building/assigned/returned`, none of which match the enum cleanly — `'assigned'` is a value in `item_status` (a different enum, for `equipment_items`), and writing it to `team_bags.status` produces a Postgres enum-violation error. The error is **silently swallowed**: `TeamBagDetailPage.markAssigned` (`src/pages/TeamBagDetailPage.jsx:142-153`) doesn't destructure `{ error }`, fires `addToast('Bag marked as assigned')` regardless, and `fetchAll()` re-renders the bag in its old status. The user sees a green toast and no change. All 17 production bags are `picked_up`, so admin's `/team-bags` mislabels them all "Building" via the missing-key fallback. Canonicalization session must (a) write a single `lib/bagStatus.js` covering all five enum values, (b) replace `markAssigned` with `markBuilt` writing `'built'`, (c) add a separate `markPickedUp` action, (d) handle `incomplete` explicitly, (e) start destructuring `{ error }` and surfacing failures. Files: `src/pages/TeamBagsPage.jsx:7-11,118-124,156-178`, `src/pages/TeamBagDetailPage.jsx:8-12,142-153,234-281`, `src/pages/TeamsPage.jsx:193-198`, `src/pages/Dashboard.jsx:43`, `src/pages/MyTeamPage.jsx:12-17`.
- **[DEV-02] Migration 1 is a stub (`20260407_initial_schema.sql`) — MUST-FIX.** Live DB has the canonical schema; no migration captures it. Anyone bootstrapping a new env has nothing to point to. Run `pg_dump --schema-only` against `crfccsmymyzdbtlwwrzf` and check it in. Required before any future schema change can be reviewed. 
- **[DEV-03] AcceptInvitePage doesn't enforce email match — MUST-FIX (security).** `src/pages/AcceptInvitePage.jsx:43-101` adds the signed-in user to `organization_members` and grants `intended_roles` purely on token possession, without checking `invite.email == user.email`. Any forwarded link grants org access on whatever account opens it.
- **[DEV-04] `bag_summary` view exists but is unrecorded in migrations — POLISH (downgraded).** Originally MUST-FIX on the assumption the view might not exist; **verified 2026-04-28** to exist in live DB with columns matching uncommitted `MyTeamPage.jsx:226-230`. Now this is just a migration-hygiene item: capture the view definition (and `equipment_totals`) in a migration during Session 1's schema-dump pass.
- **[DEV-05] `tickets_update` RLS lacks `WITH CHECK` — POLISH/security (closed in Session 5).** `supabase/migrations/20260422_tickets.sql:226-231` allows opener/assignee/admin to UPDATE tickets but the `WITH CHECK` clause is omitted — they could change `organization_id`. Add `WITH CHECK` mirroring the `USING` predicate plus pinning `opened_by`. **Closed 2026-05-03:** `supabase/migrations/20260430_dev05_tickets_update_with_check.sql` adds WITH CHECK with `is_org_member(organization_id) AND` prefix (mirror of USING alone is insufficient — opener can still re-target org_id while remaining opened_by; the prefix forces post-update org into the caller's membership set). Live-verified post-apply via `pg_policy.polwithcheck`. Active-attack repro deferred per DEV-09 precedent.
- **[DEV-06] `activity_log` insert policy doesn't pin `actor_id` — POLISH/security (closed in Session 5).** `supabase/migrations/20260408_activity_log.sql:17` requires only `is_org_member(organization_id)`. Should also require `actor_id = auth.uid()`. **Closed 2026-05-03:** `supabase/migrations/20260430_dev06_activity_log_actor_pin.sql` adds `actor_id = auth.uid()` to WITH CHECK plus `DEFAULT auth.uid()` on the column (belt-and-suspenders so future callers that omit the field self-heal rather than dropping a NULL that would fail the new CHECK). App-side audit pre-apply confirmed both insert call sites (`src/lib/activity.js`, `src/pages/MembersPage.jsx`) already set `actor_id = (await supabase.auth.getUser()).data.user.id`, so no caller is broken. activity_log has no triggers; the CHECK is the sole enforcement point. Live-verified post-apply. Active-attack repro deferred per DEV-09 precedent.
- **[DEV-07] `transfer_stock` RPC doesn't validate location org-membership — POLISH/security (closed in Session 5).** `supabase/migrations/20260427_transfer_stock_rpc.sql:80-101`: only stock availability is checked. If `from_id` or `to_id` belong to a different org, the insert into `stock_events` would still succeed (org_id is taken from the parameter, not the location). The trigger then writes the wrong location row in `location_stock`. Mitigated by `apply_stock_event`'s `ON CONFLICT (storage_location_id, equipment_item_id)` keeping the row in the rightful org's stock space, but cross-org reads can still leak. **Closed 2026-05-03:** `supabase/migrations/20260430_dev07_transfer_stock_org_validation.sql` adds a tenancy guard between the per-row shape checks and the stock-availability pass: every distinct `from_id` and `to_id` in `p_transfers` must belong to `p_org_id` via `storage_locations.organization_id`. Raises on first mismatch naming the offending location; whole RPC is one transaction so a raise rolls everything back. Existing caller-role authorization at the top of the function is unchanged. Live-verified post-apply. Active-attack repro deferred per DEV-09 precedent.
- **[DEV-08] `TeamsPage.AssignGearModal.createTemplate` writes `equipment_item_id: i.category_id` — POLISH (data corruption).** `src/pages/TeamsPage.jsx:374-377` stuffs a category id into the equipment-item column. Templates created from this modal will not match the schema's intent. Likely rarely-used path because /settings has the canonical editor; still should be fixed.
- **[DEV-09] `Edge Function send-invitation-email` is unauthenticated and CORS-`*` — POLISH/security.** `supabase/functions/send-invitation-email/index.ts:1-22`: anyone with the function URL and a valid invitation_id can trigger an email send (and unwantedly mark `email_sent_at`). Add an auth-required check (verify caller is the invitation's `invited_by` or has admin in the org) using the JWT in `Authorization`. Also restrict CORS to your domain(s).
- **[DEV-10] Three orphaned page files — POLISH.** `KitBuilderPage.jsx` (582 lines), `AssignmentsPage.jsx` (178 lines), `CategoriesPage.jsx` (not in App.jsx or Sidebar). Each adds bundle weight (Vite tree-shakes, but the imports still ship if any test brings them in) and active confusion: `KitBuilderPage` carries the *correct* 4-status flow logic that `TeamBagDetailPage` lacks. Either delete or wire them in.
- **[DEV-11] `EquipmentPage.jsx` is 2110 lines — NICE-TO-HAVE.** Split the modal subtree, the tree-rendering code, and the table into siblings. Not a ship blocker but a maintenance time bomb.
- **[DEV-12] `Sidebar` `canSee` returns `false` while `rolesLoading` — POLISH.** `src/components/Sidebar.jsx:31` hides every gated link until roles load, but `My Team`, `Board`, and the user footer always show. Result: on every page load, the sidebar reflows once roles arrive. Add a brief skeleton for the gated section instead.
- **[DEV-13] No error state when initial fetches fail — POLISH.** Almost every page does `await Promise.all([…])` and uses `?.data || []` on each result. If a query fails, you get an empty list with no surface to the user and (worse) no Sentry capture. Wrap in try/catch and report a top-of-page banner.
- **[DEV-14] `ProtectedRoute` flashes plain "Loading..." on every nav — POLISH.** `src/App.jsx:38`. Use the existing skeleton block or render the prior page's chrome.
- **[DEV-15] Sentry tracesSampleRate / replays = 0 — VERIFY.** `src/main.jsx:13-15`. No tracing or replays. If incidents are happening, you have only `captureException`. Consider raising tracesSampleRate to 0.1 in prod for the first month.
- **[DEV-16] No tests — VERIFY.** `package.json` has no `test` script and no test deps. RBAC + RLS + the auto-bag flow each deserve at least a smoke test before adding more roles.
- **[DEV-17] `vite-plugin-pwa` `NetworkFirst` cache for Supabase REST — VERIFY.** `vite.config.js:51-62` caches GET responses for 5 minutes. This will serve stale RLS-protected reads to a user across sessions on the same device. Either drop the rule or scope it tightly. Mobile coaches sharing a phone could see another team's data from cache.
- **[DEV-18] Profile fetch ignores error — POLISH.** `src/contexts/AuthContext.jsx:30-38`. If the profile row is missing (race after signup), `setProfile(null)` and we move on. UI shows "User" forever.
- **[DEV-19] Inline styles dominate — POLISH.** Most pages use inline-style objects instead of CSS classes. This works but defeats theming, dark-mode, and any future design-token sweep. Inventory the truly common primitives (page-header, stat-card, badge) into a small components/ui folder.
- **[DEV-20] `cancelled` ref pattern not used in fetches — POLISH.** Most pages await without abort. Leaves race-conditioned setState if user nav-aways during a long fetch. `useUserRoles` does it right; copy the pattern.
- **[DEV-21] `apply_stock_event` is `SECURITY DEFINER` and inserts ignoring RLS — VERIFY.** `supabase/migrations/20260422_stock_events.sql:93-130`. Means anyone who can INSERT into `stock_events` (admin + EM by RLS) can write to `location_stock` regardless of `location_stock`'s own RLS. Confirm `location_stock`'s own write policy is intentionally subordinate.
- **[DEV-22] `bag_summary` and `equipment_totals` views are owner-defined (security-definer mode) — POLISH (closed in Session 5; expanded to `user_role_summary` as third view).** Verified 2026-04-28 via web Claude: both views are owned by `postgres` and have no `security_invoker` option set. Postgres default is security-definer for views, meaning the underlying SELECT runs as the view owner — bypassing the caller's RLS on `team_bags`, `team_bag_items`, `location_stock`, etc. **Not exposing anything wrong today** because the underlying RLS is permissive (any org member can SELECT), but it becomes a risk the moment RLS is tightened in Session 5 (DEV-05/06/07 hardening). One-line migration to bundle with that session: `ALTER VIEW bag_summary SET (security_invoker = on); ALTER VIEW equipment_totals SET (security_invoker = on);`. Capture in the schema-dump backfill so the security_invoker settings on these views are explicit going forward. **Closed 2026-05-03:** `supabase/migrations/20260430_dev_bonus_view_security_invoker.sql` flips `bag_summary`, `equipment_totals`, and `user_role_summary` to `security_invoker=on`. Scope expanded mid-session: live verification turned up `user_role_summary` as a third view with the same defect, all three flipped together. Pure metadata change; view definitions unaffected. Live-verified post-apply via `pg_class.reloptions`.
- **[DEV-23] Front-end-only BUG 1 — VERIFY (live repro needed).** Live DB verification ruled out: column name (it's `category_id`), missing FK (it exists, conventionally named), RLS rejection (org-member SELECT is permitted on all four tables in the join chain), missing data (all 17 bags have 8–11 items each, avg 8.18). Therefore the empty-items-list bug must be in front-end logic: query shape, filter value, race condition, or PostgREST embed resolution at runtime. Static analysis is out of leverage; first 10 minutes of Session 2 should be live repro with coach credentials. Suspects to triage: `currentOrg.id` not yet populated when `fetchTeamData` fires (race), `team.id` mismatch between `fetchCoachTeams` result and the bag query, or PostgREST collapsing the embed when one of the two FK columns (`category_id` or `equipment_item_id`) is null on a bag-item row. **2026-04-28 schema-dump update:** `team_bag_items.category_id` is `NOT NULL`, so the "PostgREST collapses on null FK" sub-hypothesis is also ruled out; `equipment_item_id` is the only nullable embed column.
- **[DEV-24] Live `kit_templates` / `kit_template_items` RLS rejects admin-only role — POLISH.** Discovered during 2026-04-28 schema-dump review. Live policies are stricter than the (unapplied) `20260424_kit_templates_rls.sql` migration prescribed: INSERT and UPDATE require `equipment_manager` role only; admin-only users are rejected. Migration 15 was deleted from the repo (it was a no-op record) and the live state was preserved in the schema-backfill commit. **Failure mode is silent**: `SettingsPage.saveTemplate` (`src/pages/SettingsPage.jsx:45-69`) doesn't destructure `{ error }` on any of its insert/update/delete calls — admin clicks "Save" → toast says "Template updated" → nothing happens server-side. Same pattern as DEV-01's `markAssigned`. Roll into the Session 2 write-error sweep: every `await supabase.from('…').insert/.update/.delete` in this file should destructure `{ error }` and surface failures via `addToast(friendlyError(error), 'error')`. Decide separately whether to widen the policy (admin OR equipment_manager) — for now the operational expectation is that the league president holds the equipment_manager role too, which matches Demotte's current setup. **2026-04-28 update:** the silent-failure half is closed in Session 2 (write-error sweep across 6 pages); the policy-vs-code mismatch remains as a follow-up decision.
- **[DEV-25] Silent network storms from referential-identity loops + cascading misdiagnosis — MUST-FIX-CRITICAL (closed in Session 2).** Discovered during 2026-04-28 live BUG 1 repro. `MyTeamPage.TeamDetail`'s `useEffect([currentOrg, team])` re-fired on every render because the parent created a fresh `team` object via `teams.find(...)` each render, and OrgProvider's value-prop churn caused MyTeamPage to re-render frequently. Each re-fire ran `fetchTeamData`, which silently swallowed errors via `setBagItems(itemsRes.data || [])` and triggered another setState. Result: 53 requests fired in a single page reload, all returning HTTP 503 from Supabase's edge proxy degrading under request-storm load. Console: silent. Sentry: silent. User-facing: a slow-loading empty page they couldn't act on. **Failure mode is the worst of both worlds**: the silent-failure pattern (DEV-01, DEV-24) made the storm invisible, and the referential-identity bug made it self-feeding. Burns Supabase resources, can trigger anti-abuse throttling for the whole project, and grows linearly with user count. Closed in Session 2 by switching the relevant `useEffect` deps to primitives (`[currentOrg?.id, team?.id]`).
- **[DEV-26] `activity_log` INSERT RLS leaves a blind spot for token-only attackers — POLISH.** `activity_log` INSERT RLS is `is_org_member(organization_id)`, which means audit log writes from the AcceptInvitePage email-mismatch handler only succeed when the attacker is already a member of the target org. Token-only external attempts fail to log, so we have a known blind spot in audit coverage. Fix is a SECURITY DEFINER RPC `log_security_event(action text, details jsonb)` that bypasses RLS for security-event-class log entries only. Recommend implementing in a future RLS-hardening session alongside DEV-05/06/07.
- **[DEV-27] DEV-09 hardens email-send, not invitation creation — POLISH (reframe).** DEV-09 hardens the email-send capability of `send-invitation-email` but does not gate invitation creation, which goes through PostgREST `invitations.insert()` directly. Pre-DEV-09 the function was an open phishing/spam-spray weapon; that is now closed. Invitation creation is gated by RLS policies on `invitations` (`Admins manage invitations` and `Coaches insert team invitations`) which are structurally correct and pin to real role+scope. What RLS does not provide and a chokepoint Edge Function would: per-inviter rate limiting, welcome-message sanitization, abuse signals. Recommendation: do NOT refactor creation through the function (churn without proportional benefit). Instead, formally audit the `invitations` INSERT RLS in a future session and add rate-limiting via SECURITY DEFINER trigger or RPC if abuse becomes a concern.
- **[DEV-28] Invitation email-send failures are invisible to the inviter — POLISH.** The "Invitation created" modal renders after the PostgREST insert succeeds (step 2) but before `functions.invoke('send-invitation-email')` completes (step 4). If the email-send step fails — function 4xx/5xx, Resend outage, network blip — the user sees success and walks away believing the email was sent. Failures only surface in `console.error`. Same silent-failure family as DEV-01/DEV-24/DEV-25. Files affected: `src/pages/MyTeamPage.jsx` (handleSubmit, ~line 533), `src/pages/BoardPage.jsx` (~line 397). Fix in a future polish session: await the function call before showing the success modal, or surface an in-modal warning chip if the send failed (modal still shows the working link, but adds "We couldn't send the email — share this link manually").

  **Cascading-misdiagnosis postmortem (added 2026-04-28 evening):** The 503s under load masked the actual underlying error, which only surfaced after the storm was silenced: PostgREST `300 PGRST201` — ambiguous FK embed. When `replacement_item_id` was added to `team_bag_items` in migration `20260422_tickets.sql`, the table acquired a *second* FK to `equipment_items` (alongside `equipment_item_id`). PostgREST's shorthand `equipment_items(...)` then refused to pick a column. Three sessions of audit work attributed BUG 1 to: (a) wrong column name `equipment_category_id`, (b) missing FK on `category_id`, (c) RLS rejection on `team_bag_items` for the coach role, (d) coach not in `organization_members`, (e) `bag_status` enum violation, (f) referential-identity render loop. (a)–(e) were all wrong. (f) was real and necessary, but a *symptom amplifier*, not BUG 1's root cause. The actual root cause emerged only after silencing the storm enough for the underlying error code to come through cleanly. **Lesson for future audits: when fixing a storm, recheck the underlying error after the storm subsides. A 503 under load and a 300 in steady state are the same byte sequence at the proxy layer.** Same lesson applies to the silent-failure sweep — it needs to surface 503s and 429s, not just `{ error }` from successful HTTP calls.

  **Fix applied (Session 2):**
  1. Storm fix: 4 `useEffect` dep arrays in `src/pages/MyTeamPage.jsx` now use primitives. Verified live: 53 → 4 requests per page load.
  2. FK disambiguator: applied to all three sites that embed `equipment_items` from `team_bag_items` — `src/pages/MyTeamPage.jsx:223`, `src/pages/TeamBagDetailPage.jsx:41`, `src/pages/NewTicketPage.jsx:63`, `src/pages/TeamsPage.jsx:55`. Form: `equipment_items!team_bag_items_equipment_item_id_fkey(...)`. The other multi-FK source (`bag_item_replacements`, with `new_equipment_item_id` + `old_equipment_item_id`) is currently only used with `bag_item_replacements(*)` — no nested embed of `equipment_items` from it — so no fix needed there today. If future code embeds `equipment_items` from `bag_item_replacements`, the same disambiguator pattern applies.
- **[DEV-30] Edge Function dev CORS allowlist is brittle to Vite port fallback — POLISH.** The DEV-09-hardened `send-invitation-email` allowlist hardcodes `localhost:5173` and `localhost:5174`. When both ports are taken (stale Vite servers, or a developer running multiple working copies of MLB), `npm run dev` falls through to `:5175+` and every Edge Function call fails at the CORS preflight. The user-facing symptom is "email send failed" in dev that looks like a real bug but isn't — and exactly this masquerade happened during Session 6 DEV-28 verification (the failed-state chip rendered for the right reason structurally, the wrong reason functionally). Fix options: (a) extend the allowlist to `:5173`–`:5179` to cover Vite's full port-fallback range; (b) make the dev allowlist environment-aware so anything matching `localhost:*` is permitted in non-prod; (c) document the constraint in CLAUDE.md and rely on developers killing stale servers. **Recommendation:** (a) — narrow, low-risk, and matches the actual port-fallback behavior. **Surfaced during:** Session 6 DEV-28 verification (2026-05-03).
- **[DEV-31] `/equipment` route is auth-gated but not role-gated — POLISH.** Sidebar correctly hides "Inventory" from coaches (only `admin` / `equipment_manager` / `board_member` see it), so the route is effectively unreachable through normal navigation — but a coach landing via deep-link, browser back-button, or shared URL gets a viewer-only orphan empty state rather than a redirect. Add a route-level role gate at `src/App.jsx:56` consistent with the sidebar visibility rule. **Surfaced during:** Session 6 empty-state verification (2026-05-03). Not blocking; route is unreachable through the UI.
- **[DEV-32] Equipment Home Recent activity feed renders every entry as "Someone moved…" — POLISH.** Actor name is not resolved into the human-readable string; `EquipmentDashboardPage.jsx:274` falls back to `'Someone'` when `ev.profiles?.full_name` is missing, and the live feed shows that fallback for every row. Could be (a) missing/wrong profile join in the activity feed query, (b) `actor_id` orphaned from a deleted profile, or (c) join silently failing under RLS. Investigate and fix in Session 6. Adds warmth ("Robert moved 24 of T-Ball Game Baseball" reads very different from "Someone moved 24 of T-Ball Game Baseball"). **Surfaced during:** Session 6 empty-state verification (2026-05-03).
- **[DEV-33] TicketDetailPage activity feed lacks self/orphan resolution — POLISH.** Same family as DEV-32 but on a different surface. `TicketDetailPage.jsx:172` renders `ev.actor?.full_name || 'Someone'`. Underlying query already resolves names correctly via the two-query pattern (lines 69-86), so "Someone" only fires for genuinely NULL `actor_id` — but the feed lacks the "You" (self) and "A former member" (orphaned actor_id) treatments that DEV-32 added to Equipment Home Recent activity. Apply the same actor-resolution pattern from `src/pages/EquipmentDashboardPage.jsx`, ideally extracted into a shared helper in `src/lib/` so the third caller (whenever it appears) doesn't drift. **Surfaced during:** Session 7 ticket-surface error-copy sweep (2026-05-04).

### Legal findings

- **[LEG-01] Privacy Policy / Terms exist and are linked — GOOD.** Sidebar footer + signup gate + standalone routes. PrivacyPage references retention windows (incidents 7y, background checks role+1y) and explicitly addresses minors' data — aware and reasonable.
- **[LEG-02] Token-only invitation acceptance — MUST-FIX (legal-adjacent).** Same finding as DEV-03 but recasts as a privacy concern: a forwarded invitation could grant a wrong individual access to roster + incident-report data, including data about minors. COPPA implications are tenuous because adults enter the data, but state-level minor-data laws vary.
- **[LEG-03] Service-role key not committed — GOOD (verify).** `.env` and `.env.local` are gitignored. Resend API key and `SUPABASE_SERVICE_ROLE_KEY` live as Supabase Function secrets per the Edge Function. Double-check `.vercel/.env.development.local` (currently has `VERCEL_OIDC_TOKEN` only) doesn't accumulate prod secrets on next pull.
- **[LEG-04] No documented data-deletion / account-deletion flow — POLISH.** PrivacyPage promises retention rules but the app has no UI to act on a "delete my data" request — admins manually do it. Add a documented runbook at minimum.
- **[LEG-05] Resend emails carry "no unsubscribe" — POLISH.** `send-invitation-email/index.ts` produces transactional invites — generally exempt from CAN-SPAM unsubscribe requirements when narrowly transactional. Risk is low; do confirm the from-address is identifiable and matches `myleagueboard.com`.
- **[LEG-06] No backup/restore runbook — POLISH.** Supabase has automatic backups; the org should know the restore process. One paragraph in `docs/` is enough.
- **[LEG-07] Activity-log spoofability — POLISH.** Same as DEV-06; framed as "audit log integrity for member-role changes and stock movements is undermined."
- **[LEG-08] Edge Function permissive CORS + unauthenticated — POLISH/security.** Same as DEV-09.
- **[LEG-09] Background-check & incident-report read access — VERIFY.** RLS migrations correctly restrict to admin + safety_officer. Confirm there is no client-side path that fetches these tables under a non-safety role and then conditionally renders — that pattern would still hit the DB.
- **[LEG-10] Accessibility — VERIFY.** ESLint config includes `jsx-a11y` recommended rules. Spot-check shows multiple `onClick` div/span handlers (TeamBagsPage row, EquipmentDashboard cards, Dashboard checkbox spans) without keyboard handlers. Run `npx eslint .` and triage.

### User-experience findings

- **[UX-01] Coach lands on "Building" for a bag they already have — MUST-FIX.** Compounds DEV-01. Coaches see "Bag is being assembled" copy when in reality it's been picked up. Fixed by the uncommitted MyTeamPage.jsx + a real status normalization sweep.
- **[UX-02] Admin "Team Bags" list is wrong — MUST-FIX.** Same root cause: status chips read "Building" because the config map lacks `picked_up`. Filter dropdown only knows building/assigned/returned. Either is a 5-line fix; the bigger fix is one shared `BAG_STATUS_CONFIG` in `lib/bagStatus.js`.
- **[UX-03] Two admin paths to the same data with different lifecycle UIs — MUST-FIX.** `/teams` (4-status modal flow) vs. `/team-bags` (3-status table flow) both manage `team_bags`. Different buttons, different vocabulary ("Mark assembled" vs. "Mark built", "Pickup" missing on /team-bags entirely). Pick one as canonical, redirect the other or hide it.
- **[UX-04] `/board` and `/members` overlap — POLISH.** Both render "Board of Directors". Sidebar shows them as distinct items. Decide: `/members` is the single source for managing org membership, `/board` is the public-facing directory? Or merge?
- **[UX-05] Sidebar emoji + label only — POLISH.** Works but is busy. Considering the cluster of yellow/orange icons, the sidebar feels SaaS-bloaty rather than calm. Consider a 2-tier nav: Operations (Dashboard, My Team, Tickets) up top; Equipment + League below.
- **[UX-06] No undo / confirm on stock transfers from `/locations` — POLISH.** The transfer modal is one-way. With money/equipment at stake, an "are you sure?" or "show me the resulting deltas" confirmation step would be cheap insurance.
- **[UX-07] Mobile drag-to-reorder on `/teams` — POLISH.** HTML5 DnD doesn't fire on touch. Phone admins can't reorder sport sections. Either swap to a tap-to-edit position or accept that reordering is desktop-only and label the affordance accordingly.
- **[UX-08] Toasts auto-dismiss in 3s, no manual close — POLISH.** A 3-second toast on a slow phone is too short to read for a tired coach in a dugout. Make errors persistent until clicked, success can stay 3s.
- **[UX-09] Empty states are inconsistent — POLISH.** Some have a friendly line + CTA ("Create a bag template first…"). Others are just "No tickets yet." A 30-minute pass to harmonize tone would lift the whole feel.
- **[UX-10] First-time coach onboarding is a single screen — MISSING.** `AcceptInvitePage` says "you've been invited as Assistant Coach for X" and dumps you on `/dashboard`. A one-time toast or `/my-team` deep-link on first login would help.
- **[UX-11] No "who else is editing" / collaboration cue — NICE-TO-HAVE.** Coaches checking off items concurrently can clobber each other. Realtime subscription on `team_bag_items` for the active bag would solve it; unnecessary for v1.
- **[UX-12] PWA install prompt fires on every load until dismissed — POLISH.** That's the intended behavior of `beforeinstallprompt`, but the bottom-right card persists during user flow. Time-delay to first appear (e.g., after 2 minutes of session) feels less pushy.
- **[UX-13] Dashboard "Items in team bags" stat counts only picked_up — POLISH.** `Dashboard.jsx:35` filters on `'picked_up'` only. Items in `built` bags aren't counted but conceptually are "in a team bag." Either fix the count or rename the stat.
- **[UX-14] Tone drift across labels — POLISH.** "Bag assembly auto-requested on team creation. Template:" (auto-bag ticket description, robotic), versus "If you believe this is an error, contact your league administrator" (warm). Pick one voice; leans warm.
- **[UX-15] No surfacing of role to the user — NICE-TO-HAVE.** A coach who is also a board member doesn't see what role they're acting as. Tiny chip near the org switcher would clarify.
- **[UX-16] Print/export for restocking lists — MISSING.** `Dashboard` shows "X items below target" but no print or CSV export. Volunteer-run leagues live on paper.
- **[UX-17] Coach can't see other tickets for their team — VERIFY.** TicketsPage tab "my" includes `coachTeamIds` ✓. But on mobile, the filter chips run wide. Live walk needed.
- **[UX-18] Sidebar shows ticket badge only on first load — POLISH.** `src/components/Sidebar.jsx:20-28` runs once per (user, org). After resolving a ticket, badge stays until refresh. Subscribe or refetch on `/tickets` route enter.
- **[UX-19] No "back" button context on `/tickets/new?team_bag_item_id=…` — POLISH.** Pre-filled from MyTeamPage. After submit, returns to `/tickets/<new id>` (assumed) — verify it doesn't dump on `/tickets` and lose context.
- **[UX-20] iPad mid-width grid collapses to single column from 1023px down — POLISH.** EquipmentDashboard sets `grid-template-columns: 1fr` at 1023px which loses the side-by-side panel layout for iPad portrait (768–1023). A 2-col layout for iPad portrait would be more useful.

### Operational findings

- **[OPS-01] Supabase SQL editor multi-line paste produced policy with NULL `with_check` — POLISH.** Discovered during Session 5 apply of DEV-05 (2026-05-03). Pasting `DROP POLICY IF EXISTS "tickets_update" ON public.tickets;` followed by `CREATE POLICY "tickets_update" ON public.tickets FOR UPDATE ...` as two top-level statements separated by a newline produced a policy with NULL `with_check`. Re-pasting the same statements as a single line (or wrapped in a single `DO $$ ... $$;` block) produced the expected policy. Root cause not diagnosed; the recommendation holds regardless. Same family as the existing working-rule note about multi-statement double-execution. **Recommendation:** future migrations applied via the SQL editor must be either single-statement or wrapped in a single function/`DO` block; do not paste multi-statement scripts spanning multiple top-level semicolon-terminated commands. Capture in CLAUDE.md or session-start carryover so future sessions don't re-trip it.

---

## Phase E — Prioritized ship list

### MUST-FIX

1. **[DEV-01 / UX-01 / UX-02 / UX-03] Bag-status canonicalization (5 statuses, not 4).** Create `src/lib/bagStatus.js` exporting one `BAG_STATUSES` array covering all five live-DB enum values (`building, built, picked_up, returned, incomplete`), one `BAG_STATUS_CONFIG` map, and helper `getBagStatusConfig(status)`. `incomplete` should render as a warm-warning chip (amber/orange), not a primary lifecycle stage. Replace all in-line maps in `Dashboard.jsx`, `MyTeamPage.jsx`, `TeamBagsPage.jsx`, `TeamBagDetailPage.jsx`, `TeamsPage.jsx`. Canonical lifecycle: `building → built → picked_up → returned`, with `incomplete` as a side-state reachable from `built` or `picked_up` when items are missing. Replace `TeamBagDetailPage.markAssigned` with `markBuilt` (writes `'built'`), add a separate `markPickedUp` action with optional name capture, add a `markReturned` path. **Critically: start destructuring `{ error }` on every Supabase call in this file** — the silent-enum failure mode means there's likely other silent failures lurking. No `'assigned'` rename migration needed (verified: zero rows hold that value because every write attempt has been rejected). **Effort:** half day. **Files:** ~5 pages, 1 new lib file, no migration.
2. **[DEV-02] Backfill the initial-schema migration.** Run `supabase db dump --schema public --schema-only` (or `pg_dump`) against the linked project, replace the stub at `supabase/migrations/20260407_initial_schema.sql`. The dump will also pick up `bag_summary`, `equipment_totals`, the three bag-related enums, and the RLS policies for the long list of unrecorded-baseline tables — so this single task closes DEV-04 and most "verify with human" notes in Phase B. **Effort:** 1 hour incl. review. **Files:** `supabase/migrations/20260407_initial_schema.sql` rewritten.
3. **[DEV-03 / LEG-02] Email-match check on accept-invite.** In `AcceptInvitePage.acceptInvite`, fetch `auth.user.email` and compare case-insensitively to `invite.email` before any `organization_members` insert. Show a clear "this invitation was sent to a different email" branch. **Effort:** 30 minutes. **Files:** `src/pages/AcceptInvitePage.jsx`.
4. **[BUG 1 reset] Coach-facing items list — premise was wrong.** Both original hypotheses (column name, missing FK) are disproven by the live-DB verification. Before doing any code work, confirm whether the empty-items-list bug still reproduces against current `main` (without the uncommitted edits). If it does, the cause is something else — RLS policy on `team_bag_items` blocking the coach's role, or a query shape that fails post-RLS. If it doesn't reproduce, the uncommitted `MyTeamPage.jsx` refactor incidentally fixed it. Either way, commit the uncommitted file once you know which one. **Effort:** 30 minutes investigation + commit. **Files:** depends on outcome.
5. **[DEV-09 / LEG-08] Edge Function authorization.** Add JWT verification in `send-invitation-email/index.ts`: parse `Authorization: Bearer <token>`, call `supabase.auth.getUser`, ensure caller is the invitation's `invited_by` or has admin role. Tighten CORS to `https://www.myleagueboard.com` (and your preview domain pattern). **Effort:** 1 hour. **Files:** the function + redeploy via `supabase functions deploy send-invitation-email`.
6. **[DEV-10 partial] Delete `AssignmentsPage.jsx` and `KitBuilderPage.jsx`** (or wire them in). At minimum, decide on `KitBuilderPage` — its 4-status flow is closest to what `TeamBagDetailPage` should look like (still missing `incomplete`). Easiest move: harvest `KitBuilderPage`'s lifecycle handlers into the canonicalization pass and delete the page. `AssignmentsPage` writes `equipment_items.status='assigned'` against `item_status` — semantically valid but unrouted; safe to delete. **Effort:** 1–2 hours review + deletion. **Files:** delete 2–3 pages.

### POLISH

1. **[DEV-05]** Add `WITH CHECK` to `tickets_update` policy. (1 migration, 5 lines.)
2. **[DEV-06]** `activity_log` insert: also require `actor_id = auth.uid()`. (1 migration.)
3. **[DEV-07]** `transfer_stock` RPC: add a check that `from_id` and `to_id` belong to `p_org_id` via `storage_locations.organization_id = p_org_id`. (1 migration, append RAISE EXCEPTION.)
4. **[DEV-08]** Fix `equipment_item_id: i.category_id` mistake in `TeamsPage.AssignGearModal.createTemplate`. (5-line fix.)
5. **[DEV-12 / DEV-14]** Skeleton for `Sidebar` while roles load + better `ProtectedRoute` loader.
6. **[DEV-13]** Top-of-page error banner pattern + Sentry capture for fetch failures.
7. **[DEV-17]** Drop or scope the `runtimeCaching` rule for Supabase REST in `vite.config.js`.
8. **[DEV-19]** Extract page-header / stat-card / badge / filters-bar into `src/components/ui/`; replace inline styles incrementally.
9. **[UX-04]** Decide `/board` vs. `/members`. Likely keep `/members` for management, retire `/board` (or vice versa). Update sidebar.
10. **[UX-08]** Persist error toasts; success toasts stay 3s.
11. **[UX-09]** Tone pass on every empty state and toast string.
12. **[UX-13]** Rename Dashboard stat or include `built` bags.
13. **[UX-18]** Refresh ticket badge on `/tickets` route enter.

### MISSING

1. **Coach onboarding moment.** First login post-invite should land them on `/my-team` with a "welcome, here's your bag" tour, not `/dashboard`.
2. **Print / CSV export for restock lists.** Volunteer-run leagues print stuff.
3. **Email re-send for invitations.** `BoardPage` shows pending invites — add a one-click "resend email."
4. **Account deletion / data export (GDPR-style).** Even if unlikely to be invoked, having the runbook docs is a hygiene win.
5. **Tests.** A handful of integration tests covering: auto-bag on team creation, invitation accept happy path, `transfer_stock` happy + insufficient-stock paths.

### NICE-TO-HAVE

1. **Realtime collaboration on bags.** Subscribe to `team_bag_items` for the active bag.
2. **Role chip near the org switcher** so users see "Acting as: Coach (Mifflin)".
3. **Two-tier sidebar.** Operations vs. League.
4. **Split EquipmentPage** into smaller components.
5. **iPad portrait 2-col layout** for EquipmentDashboard.
6. **Sentry tracesSampleRate** to 0.1 in prod for first month.

---

## Recommended first batch for next session

A single, coherent commit set that **only touches the bag-lifecycle and the pre-existing coach work**, without dragging in security or schema-dump work (those deserve their own session each). Updated for the 5-status reality and the silent-enum-violation finding.

**Title:** "Canonicalize bag status across admin + coach flows"

**Diff scope (~6 files, ~250 lines net):**

1. **New file** `src/lib/bagStatus.js` — `BAG_STATUSES = ['building','built','picked_up','returned','incomplete']`, `BAG_STATUS_CONFIG` map (incl. `incomplete` as warm-warning amber), `getBagStatusConfig(status)`, `BAG_LIFECYCLE_OPTIONS` (the four primary stages), `BAG_FILTER_OPTIONS` (all five). Single source of truth.
2. **Edit** `src/pages/TeamBagsPage.jsx` — replace local `STATUS_CONFIG`, replace filter dropdown options to include all five statuses, fall through to canonical config (lines 7-11, 113-125, 152, 177-180).
3. **Edit** `src/pages/TeamBagDetailPage.jsx` — replace local config; rename `markAssigned` → `markBuilt` writing `status: 'built'`; add `markPickedUp(name)` writing `status: 'picked_up'`; fix `bag.status === 'assigned'` reads to `'built'` and `'picked_up'` as appropriate; **destructure `{ error }` on every Supabase call** and surface failures via `addToast(friendlyError(error), 'error')` (the silent enum violation is a symptom of broader missing error handling in this file). Lines 8-12, 142-153, 234-281, 367-433.
4. **Edit** `src/pages/Dashboard.jsx` — pull from canonical config (line 43); decide whether "Items in team bags" should sum `built + picked_up` or stay `picked_up`-only (UX-13).
5. **Edit** `src/pages/TeamsPage.jsx` — pull from canonical config (lines 193-198).
6. **Commit the in-flight `MyTeamPage.jsx`** — `bag_summary` is verified to exist with matching columns, no fallback needed. Pull its inline `BAG_STATUS_CONFIG` (lines 12-17) into the new shared config so it includes `incomplete`.

**Notably NOT needed:**
- ~~`UPDATE team_bags SET status = … WHERE status = 'assigned'` migration~~ — verified, zero rows hold `'assigned'` because every attempt has been rejected by the enum. No data normalization required.
- Graceful fallback for `bag_summary` — it exists.

**Out of scope for this batch (do separately):**
- The schema-dump backfill (DEV-02). Run by itself, careful review. Will pick up `bag_summary`, `equipment_totals`, all three enums, and the RLS policies for the unrecorded-baseline tables — closes DEV-04 and many Phase B "verify with human" items in one stroke.
- BUG 1 reset (item 4 in MUST-FIX) — investigate before coding.
- Email-match check (DEV-03). Touches auth, deserves its own review.
- Edge Function lockdown (DEV-09). Deploys differently, deserves its own review.
- RLS hardening (DEV-05/06/07). Single migration, but worth its own review.

Stop here. Hand back to human.
