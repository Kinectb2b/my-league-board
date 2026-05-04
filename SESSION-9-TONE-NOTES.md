# Session 9 — Tone audit notes

Working doc. **Observation only — no fixes applied.** Captures cross-page tone inconsistencies for triage. Severity is rough — your call which to fix vs defer.

Inventory done by Explore agent across 22 routed pages + Sidebar. Coverage is high but not exhaustive — flagged where the agent noted a section it didn't reach (e.g., child modals inside EquipmentPage.jsx).

---

## Findings, by severity

### 🔴 Real warmth deltas (worth fixing in this session)

**T-01. Old-style "Failed to" toasts survived the friendlyError sweep.**
ProfilePage has two: `'Failed to save'`, `'Failed to change password: ' + error.message`. The second one *also* leaks raw `error.message` — same anti-pattern Session 7's ticket-surface sweep closed, just on a third surface.
*Fix shape:* route through `friendlyError(error)` like the other surfaces.
*Files:* `src/pages/ProfilePage.jsx`.

**T-02. "Loading..." button-disabled state is inconsistent.**
- "Saving...", "Creating...", "Joining...", "Sending...", "Changing..." (all gerunds — fine)
- "Please wait..." (AuthPage on signup/signin) — generic, doesn't say what's happening
*Fix shape:* "Signing in..." / "Creating account..." matching the action.
*Files:* `src/pages/AuthPage.jsx`.

**T-03. Toast `${role}` interpolation leaks raw enum values.**
`MembersPage:" ${fullName} added as ${role}"` interpolates the raw DB string (`admin`, `equipment_manager`, `safety_officer`) instead of the display label (`Admin`, `Equipment Manager`, `Safety Officer`). Display labels are defined in the same file as `roleLabels` — but the toast doesn't use the map.
*Fix shape:* `${roleLabels[role] || role}` in the toast.
*Files:* `src/pages/MembersPage.jsx`.

**T-04. SafetyPage h1 is "Safety Officer" — refers to the role, not the page.**
The page is about incidents / background checks / first aid kits. Calling it "Safety Officer" is mis-naming — the role can view the page, but the page itself is the safety surface.
*Fix shape:* "Safety" or "Incidents and safety" (whatever fits the site map).
*Files:* `src/pages/SafetyPage.jsx`.

**T-05. Empty-state copy survivors that didn't get the UX-09 harmonization.**
- FieldsPage: `"No fields yet. Click '+ Add field' to add the first one."` — old style, references the button instead of providing one.
- SettingsPage: `"No templates yet. Create one to define what goes in a team gear bag."` — close to the new pattern but lacks a CTA button.
- SettingsPage: `"No seasons yet."` — bare line.
- SafetyPage empties — three surfaces, all old style with conditional CTA hints in copy.
*Fix shape:* match BagTemplatesPage / TeamBagsPage pattern: heading + explainer + role-gated CTA.
*Files:* `FieldsPage.jsx`, `SettingsPage.jsx`, `SafetyPage.jsx`. Could roll this into the "complete UX-09 sweep" cluster.

**T-06. "Create bag template" vs "Edit template" — mismatched shape.**
Same modal, two button paths into it. The create-modal title includes "bag" in the noun phrase; edit drops it. Reads like two different actions.
*Fix shape:* both should be "Create bag template" + "Edit bag template", OR both "Create template" + "Edit template".
*Files:* `src/pages/BagTemplatesPage.jsx` (create heading vs edit heading).

---

### 🟡 Stylistic — pick a convention then apply (one decision unblocks several)

**T-07. Page title casing — sentence case vs Title Case.**
The product is split:

| Page | Current title | Case |
|---|---|---|
| BagTemplatesPage | "Bag templates" | sentence |
| EquipmentDashboardPage | "Equipment dashboard" | sentence |
| EquipmentPage | "Equipment inventory" | sentence |
| LocationsPage | "Storage locations" | sentence |
| NewTicketPage | "New ticket" | sentence |
| OrgSetupPage | "Set up your league" | sentence |
| BoardPage | "Board of Directors" | Title (or proper-noun) |
| MembersPage | "Board Directory" | Title |
| MyTeamPage (picker) | "My Teams" | Title |
| SafetyPage | "Safety Officer" | Title (and see T-04) |
| Dashboard | "Dashboard" | one word |
| Profile / Fields / Settings | one word | n/a |

Sentence case is the majority and the more modern/calm convention. **Recommend going sentence-case across the board** — "Board of Directors" stays as proper-noun if you keep that page (or merges into MembersPage per UX-04). "Board Directory" → "Board directory". "My Teams" → "My teams".

**T-08. Modal titles — verb shape varies.**
- "Add field" / "Add location" / "Edit field" / "Edit location" (verb + noun, no article — common shape)
- "Add a member" (verb + article + noun) — outlier
- "Invite to board" (verb + preposition) — different shape
- "Report an incident" (verb + article + noun) — also has article
- "Create bag template" / "Edit template" (see T-06)

Two reasonable conventions: drop articles ("Add member", "Report incident") or keep them ("Add a member", "Report an incident"). Either works; pick one.

**T-09. Section heading casing.**
Mostly sentence case ("Bag contents", "Recent activity", "Quick actions"). One Title Case outlier: MembersPage "All Members". Easy fix.

**T-10. Empty-state h1-style heading inside the empty-state.**
Most have a 1.1rem heading + microcopy. A handful are bare lines (no heading). T-05 covers the worst ones; the rest could go either way depending on the panel size.

---

### 🟢 Minor / preference (defer or skip)

**T-11. "Auto-Assign" label uses kebab-Title-Case.**
BagTemplatesPage column header is "Auto-Assign" (hyphen + capital A). Other table columns are sentence-case ("Sport / Division", "Items"). Convention: "Auto-assign". Minor.

**T-12. "Mark available" / "Mark maintenance" / "Mark closed" buttons.**
FieldsPage button labels. Three buttons, three states, parallel construction. Fine, just noting they're imperative-tight (no "Mark as X").

**T-13. "All locations are fully stocked!" success toast.**
LocationsPage. Has an exclamation point and uses "are fully stocked" (present tense, indicative) where most success toasts are past-tense+terse ("Template deleted", "Equipment updated"). It's a different shape because it's a query result, not a save confirmation. Probably fine; just inconsistent if you're being strict.

**T-14. "Check your email for a confirmation link!" success toast.**
AuthPage. Also has `!`. Different register from system success toasts. Probably fine.

**T-15. Status pill capitalization for safety states.**
SafetyPage statuses: `resolved`, `follow_up`, `open`, `pending`, `approved`, `denied`, `expired`, `good`, `needs_restock`, `missing` — these come from the DB enum. Whether they're rendered with explicit casing transformation or as-is, I haven't traced. Worth checking that they don't render as raw `needs_restock` to the user.

**T-16. Sidebar nav labels — "Equipment Home" vs "Inventory" vs "Bag Templates".**
Title Case in the nav for "Equipment Home", "Bag Templates", "Team Bags". Inconsistent with sentence-case page titles. If we go sentence case (T-07), nav follows: "Equipment home", "Bag templates", "Team bags".

---

## Cross-cutting observations

**O-A. Voice is split clean between "We" (system action) and "You" (user state).**
"We can't reach the server", "We couldn't update that item" — first-person plural for system-narrated failures.
"You don't have permission", "Your session expired" — second person for user state.
This split is intentional and consistent. Don't fix.

**O-B. References to "the app" — one survivor.**
Dashboard: "Actions will appear here as you use the app." — only place I see the third-person product self-reference. Tiny.

**O-C. "MLB" abbreviation isn't user-facing anywhere I found.**
The product calls itself "My League Board" in the sidebar header / mobile-header / OrgSetupPage URL line. No "MLB" leakage in user-facing copy.

**O-D. Validation message register is different from system error register.**
Validation messages ("Name is required", "Please enter a valid email", "Password must be at least 6 characters") are imperative + brief. System errors (post-friendlyError) are first-person + recovery-hint. This split mirrors the voice split in O-A — fine for now. DEV-35 is the planned sweep; that's the right surface to align them.

**O-E. Coverage gaps in this audit.**
The agent flagged a few "(no toasts in read section)" and "(modal titles in child components not in read section)" — meaning some sub-component-level strings weren't captured. Most likely missed area: EquipmentPage.jsx modal subtree (HistoryModal, AddItemModal, ItemDetailModal, etc.) which is a 2110-line file. If we do a fix pass, double-check that file's modals.

---

## Suggested fix order if we proceed

If/when you want to commit fixes, the cleanest groupings are:

1. **🔴 Real deltas — one commit per file/cluster:**
   - T-01 (ProfilePage Failed-to + raw-error leak) — same anti-pattern as Session 7 ticket sweep, very mechanical
   - T-03 (MembersPage role label leak) — one-line fix
   - T-04 (SafetyPage h1 misnaming) — content decision needed first
   - T-05 (empty-state UX-09 sweep completion) — could be its own commit by surface

2. **🟡 Conventions — one commit each, with the body explaining the rule:**
   - T-07 (page-title sentence case) — touches ~5 pages
   - T-08 (modal titles — pick one) — touches ~4 pages
   - T-06 (Create/Edit modal title parity) — single file
   - T-09 (section heading "All Members" → "All members") — one file
   - T-16 (sidebar nav labels) — depends on T-07

3. **DEV-35 (form-level inline errors)** is the planned sweep covering the validation-message register — would land cleanly after T-01 closes the toast register on Profile.

4. **DEV-37** (comment-event actor label — convention check) is unrelated to tone but on your queue.

5. **DEV-34** (bag template undo-toast) is a different surface than tone work; can fit anywhere.

---

## What I'm NOT recommending without your call

- T-04 SafetyPage rename — needs a content decision (what should the page be called?), not a tone decision.
- UX-04 (Board vs Members page split) — would unify "Board of Directors" / "Board Directory" but it's a structural decision out of scope here.
- Anything in the 🟢 minor section unless you want a clean sweep.

---

Hand back. Walk me through which clusters land in this session vs defer.

---

## EquipmentPage.jsx re-scan (2110-line file, 8 modals + helper components)

Targeted second pass on the file the original walk under-covered.

### 🔴 Red bucket — found one new pattern instance

**T-17. Four raw-error leaks in EquipmentPage modal subtree.**
Same anti-pattern as T-01 (ProfilePage). Stock-event modals dump `error.message` directly into the toast:
- `EquipmentPage.jsx:1084` (ReceiveModal) — `addToast(error.message, 'error')`
- `EquipmentPage.jsx:1171` (TransferModal) — same
- `EquipmentPage.jsx:1261` (RemoveModal) — same
- `EquipmentPage.jsx:1333` (AuditModal) — same

*Fix shape:* route through `friendlyError(error)` (already imported in this file via the SkeletonList commit, but `friendlyError` itself isn't — needs an import).
*Recommendation:* fold into Cluster 2's commit alongside T-01 (ProfilePage). Both are the same anti-pattern; one commit closes both surfaces.

### 🟡 Convention — stock-event action modals don't fit the entity-create rule

The triage rule was "articles for create, no articles for edit." The 5 stock-event modals in EquipmentPage use a third shape — **imperative action + colon + item name**:

- "Receive stock" — bare imperative, no item context (because receive picks the item inside the modal)
- "Transfer: {item.name}"
- "Remove: {item.name}"
- "Audit: {item.name}"
- "History: {item.name}" — view-only, but same shape

These aren't entity creates (they create `stock_events` rows but conceptually they're actions on existing items, like "transfer this item"). Adding an article ("Transfer a: T-Ball Game Baseball") would be grammatically broken.

**Recommendation:** treat stock-event actions as a distinct category — imperative-action + colon + item name, no article. Don't apply T-08's create-article rule here. Document the rule when applying tone fixes so the next person reading the convention knows there's a third bucket.

The "Receive stock" modal is the lone bare imperative (item is selected inside, not pre-selected). Stays as-is.

### 🟢 Minor — dynamic Add modal title is awkward

`EquipmentPage.jsx:1695` — `<h2>{item ? 'Edit equipment' : `Add ${typeLabel}`}</h2>`

`typeLabel` is a category name like "balls", "bats", "first aid". Result: "Add balls", "Add bats", "Add first aid". The new article rule would give "Add a balls" (broken grammar) so the rule doesn't apply.

Two clean options:
- (a) Change to uniform `"Add equipment"` for the create branch (matches the page title and the edit-branch label "Edit equipment"). Loses the type-context which the type-picker modal already provided.
- (b) Singularize typeLabel and apply article: "Add a ball", "Add a bat", "Add a first aid kit". Requires a typeLabel singular form, which would need a small map. Not worth the lift.

**Recommendation:** (a) "Add equipment". Matches edit. Type context comes from the picker modal one step earlier.

### 🟡 The type-picker modal — "What are you adding?"

`EquipmentPage.jsx:1675` — single conversational modal title in the codebase. Doesn't fit any convention.

**Recommendation:** keep as-is. It's a warm onboarding moment, the only place the product asks a question of the user. Defending the irregularity is fine — it serves the flow. Don't normalize.

### Section headings — clean

`<h3>Browse categories</h3>`, `<h3>Filters</h3>`, `<h3>Locations</h3>`, `<h3>History</h3>` — all sentence case. No fixes needed.

### Toasts — past-tense terse, mostly clean

- "Equipment updated" / "Equipment added" / "Equipment deleted" / "Inventory exported"
- `Received ${total} units` / `Transferred ${quantity} units` / `Removed ${quantity} units (${reason})` / `Audit recorded: ${delta}` / `Added ${stockQty} to location`

All past-tense terse. Consistent with the success-toast convention. No fixes needed beyond the T-17 error leaks.

### Form labels & options & headers — clean

All sentence case. Select options follow "All X" / "Select X..." pattern uniformly.

---

## Updated cluster plan after re-scan

**No changes to Cluster 1** (page titles + sidebar nav, modal titles). Pre-decided conventions hold up across the EquipmentPage modal subtree.

**Cluster 2 absorbs T-17** alongside T-01:
- `polish(tone): wrap raw-error leaks via friendlyError on Profile + EquipmentPage modals (T-01, T-17)` — same anti-pattern, single commit, ~5 sites total

**New finding for Cluster 1's modal-titles commit body:** when documenting the convention, explicitly note the third category — *stock-event action modals use `<verb>: <item.name>` shape, no article* — so the convention doesn't get misapplied to those four modals later.

**T-19 (formerly the "Add ${typeLabel}" issue)** lands in the modal-titles commit alongside T-08.
