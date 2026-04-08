import { supabase } from './supabase'

export async function logActivity(orgId, action, entityType, entityName, details) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !orgId) return
  await supabase.from('activity_log').insert({
    organization_id: orgId,
    actor_id: user.id,
    action,
    entity_type: entityType || null,
    entity_name: entityName || null,
    details: details || null
  }).catch(() => {})
}
