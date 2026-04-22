/**
 * Check if a roles array contains a specific role.
 * @param {Array<{role: string}>} roles - Role assignments from user_roles
 * @param {string} targetRole - Role name to check for
 * @returns {boolean}
 */
export function hasRole(roles, targetRole) {
  if (!roles || !targetRole) return false
  return roles.some(r => r.role === targetRole)
}

/**
 * Check if a roles array contains ANY of the specified roles.
 * @param {Array<{role: string}>} roles - Role assignments from user_roles
 * @param {string[]} targetRoles - Role names; match any
 * @returns {boolean}
 */
export function hasAnyRole(roles, targetRoles) {
  if (!roles || !Array.isArray(targetRoles) || targetRoles.length === 0) {
    return false
  }
  const targetSet = new Set(targetRoles)
  return roles.some(r => targetSet.has(r.role))
}

/**
 * Check if a roles array contains ALL of the specified roles.
 * @param {Array<{role: string}>} roles - Role assignments from user_roles
 * @param {string[]} targetRoles - Role names; must have every one
 * @returns {boolean}
 */
export function hasAllRoles(roles, targetRoles) {
  if (!roles || !Array.isArray(targetRoles) || targetRoles.length === 0) {
    return false
  }
  const userRoleSet = new Set(roles.map(r => r.role))
  return targetRoles.every(r => userRoleSet.has(r))
}
