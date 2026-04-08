export function friendlyError(error) {
  if (!error) return 'Something went wrong'
  const msg = error.message || error.toString()
  if (msg.includes('duplicate key') || msg.includes('23505')) return 'This item already exists. Please use a different name.'
  if (msg.includes('violates foreign key') || msg.includes('23503')) return 'Cannot complete this action — related data still exists.'
  if (msg.includes('violates row-level security') || msg.includes('42501')) return "You don't have permission to do this."
  if (msg.includes('JWT expired')) return 'Your session has expired. Please sign in again.'
  if (msg.includes('invalid input syntax for type uuid')) return 'Invalid selection. Please try again.'
  if (msg.includes('null value in column')) return 'A required field is missing. Please fill in all required fields.'
  if (msg.includes('Failed to fetch')) return 'Network error. Please check your internet connection.'
  return msg
}
