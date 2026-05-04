/**
 * Resolves an activity-feed actor into a human-readable label.
 *
 *   actor_id is null/missing             → "Someone"
 *   actor_id matches the viewing user    → "You"
 *   actor_id has a resolved full_name    → the full name
 *   actor_id is set but full_name is null → "A former member" (FK orphan)
 *
 * Caller passes the resolved fullName (or null/undefined) however they
 * already do their lookup — the helper does no fetching of its own. This
 * way Equipment Home (lookup map) and Ticket detail (per-event nameMap
 * resolution at fetch time) can share the same label logic without
 * forcing a single data shape.
 */
export function resolveActorLabel({ actorId, currentUserId, fullName }) {
  if (!actorId) return 'Someone'
  if (actorId === currentUserId) return 'You'
  return fullName || 'A former member'
}
