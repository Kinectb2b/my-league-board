// Translates raw Supabase / network errors into kind, calm copy that always
// names what happened and what to try. Never returns Postgres jargon, never
// returns "Something went wrong."
export function friendlyError(error) {
  if (!error) {
    return "Something didn't work. Try again, or refresh the page if it keeps happening."
  }
  const msg = error.message || error.toString()
  if (msg.includes('JWT expired')) {
    return 'Your session expired. Sign in again to continue.'
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return "We can't reach the server. Check your connection and try again."
  }
  if (msg.includes('violates row-level security') || msg.includes('42501')) {
    return "You don't have permission to do that. Ask an admin if this looks wrong."
  }
  if (msg.includes('duplicate key') || msg.includes('23505')) {
    // TODO: 23505 fires for any unique constraint, not just name fields.
    // For composite uniques like (bag_id, item_id), "Try a different name"
    // is wrong advice. If a future case hits this branch where the user
    // can't act by renaming (e.g. "this item is already in this bag"),
    // inspect error.details / error.constraint to pick more accurate copy.
    return 'That already exists. Try a different name.'
  }
  if (msg.includes('violates foreign key') || msg.includes('23503')) {
    return 'This is still being used somewhere else. Remove those links first, then try again.'
  }
  if (msg.includes('null value in column')) {
    return 'A required field is empty. Fill it in and try again.'
  }
  if (msg.includes('invalid input syntax for type uuid')) {
    return 'That selection looks off. Refresh the page and try again.'
  }
  // Unknown error — log for debugging (DEV-25 lesson: surface silent drift),
  // then return a kind generic so the user sees something humane.
  console.error('Unhandled friendlyError case:', error)
  return "Something didn't work. Try again, or refresh the page if it keeps happening."
}
