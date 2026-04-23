import { supabase } from './supabase'

/**
 * Fetch the teams that a user coaches (via head_coach_id or user_roles coach scope).
 * Returns a de-duped array of team objects with division info.
 */
export async function fetchCoachTeams(organizationId, userId) {
  if (!organizationId || !userId) return []

  const [byHead, byRole] = await Promise.all([
    // Teams where user is head coach
    supabase
      .from('teams')
      .select('id, name, divisions(name, sport_types(name))')
      .eq('organization_id', organizationId)
      .eq('head_coach_id', userId),
    // Teams via user_roles coach scope
    supabase
      .from('user_roles')
      .select('scope_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('role', 'coach')
      .eq('scope_type', 'team')
  ])

  const headTeams = byHead.data || []
  const roleTeamIds = (byRole.data || []).map(r => r.scope_id).filter(Boolean)

  // Fetch any role-scoped teams not already in headTeams
  const headIds = new Set(headTeams.map(t => t.id))
  const missingIds = roleTeamIds.filter(id => !headIds.has(id))

  let roleTeams = []
  if (missingIds.length > 0) {
    const { data } = await supabase
      .from('teams')
      .select('id, name, divisions(name, sport_types(name))')
      .in('id', missingIds)
    roleTeams = data || []
  }

  return [...headTeams, ...roleTeams]
}
