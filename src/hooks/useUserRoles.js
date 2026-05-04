import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Fetches the current user's role assignments within an organization.
 * Returns { roles, loading, error } where roles is an array of
 * { role, scope_type, scope_id } objects.
 */
export function useUserRoles(organizationId, userId) {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!organizationId || !userId) {
      setRoles([])
      // Stay loading. Flipping to false here lets consumers (route gates,
      // role-aware UI) conclude "user has no roles" during the brief window
      // between mount and currentOrg/user resolving — racing legitimate
      // users into the no-roles fallback. ProtectedRoute redirects on auth
      // before reaching the role check, so leaving loading=true while args
      // are missing doesn't strand any logged-out path.
      return
    }

    let cancelled = false

    async function fetchRoles() {
      setLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase
        .from('user_roles')
        .select('role, scope_type, scope_id')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)

      if (cancelled) return
      if (fetchError) {
        console.error('Error fetching user roles:', fetchError)
        setError(fetchError)
        setRoles([])
      } else {
        setRoles(data || [])
      }
      setLoading(false)
    }

    fetchRoles()
    return () => { cancelled = true }
  }, [organizationId, userId])

  return { roles, loading, error }
}
