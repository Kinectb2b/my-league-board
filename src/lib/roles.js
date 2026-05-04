/**
 * Canonical user_roles enum → human-readable display label.
 * Single source of truth so that a future surface rendering a role
 * doesn't drift from existing surfaces ("Admin" vs "President /
 * Admin", "Equipment Manager" vs "Equipment manager", etc.).
 *
 * Use formatRoleLabel(role) at the call site for the "render this
 * one role" path; iterate ROLE_LABELS directly when you need the
 * full list (e.g., a multi-select).
 *
 * This is the boundary-fix counterpart to friendlyError (DEV-39):
 * the helper makes the right wrap easy at the call site, so future
 * surfaces don't drift by hardcoding their own role-label maps.
 */
export const ROLE_LABELS = {
  admin: 'President / Admin',
  equipment_manager: 'Equipment Manager',
  safety_officer: 'Safety Officer',
  coach: 'Coach',
  board_member: 'Board Member',
  volunteer: 'Volunteer',
  treasurer: 'Treasurer',
  division_vp: 'Division VP',
  field_manager: 'Field Manager',
  uniform_manager: 'Uniform Manager',
  scheduling_manager: 'Scheduling Manager',
  registration_manager: 'Registration Manager',
  player_agent: 'Player Agent',
  umpire_coordinator: 'Umpire Coordinator',
  sponsorship_coordinator: 'Sponsorship Coordinator',
}

/**
 * Translates a raw role string to a display label. Falls back to
 * the raw string if the role isn't in the map (graceful: better to
 * render `equipment_manager` once until we add it to the map than
 * to render `undefined`).
 */
export function formatRoleLabel(role) {
  return ROLE_LABELS[role] || role
}

/**
 * The 6 first-class roles a member can hold as their primary role
 * via MembersPage's role selector. The wider role roster (treasurer,
 * division_vp, scheduling_manager, etc.) is granted via board-position
 * assignments and multi-role invitations rather than a member's
 * primary role on organization_members.
 */
export const PRIMARY_MEMBER_ROLES = [
  'admin',
  'equipment_manager',
  'safety_officer',
  'coach',
  'board_member',
  'volunteer',
]
