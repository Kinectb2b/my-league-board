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
      setLoading(false)
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
