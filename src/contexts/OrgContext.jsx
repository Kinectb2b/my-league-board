import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

const OrgContext = createContext({})

export function OrgProvider({ children }) {
  const { user } = useAuth()
  const [orgs, setOrgs] = useState([])
  const [currentOrg, setCurrentOrg] = useState(null)
  const [membership, setMembership] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) fetchOrgs()
    else {
      setOrgs([])
      setCurrentOrg(null)
      setMembership(null)
      setLoading(false)
    }
  }, [user])

  async function fetchOrgs() {
    setLoading(true)
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('profile_id', user.id)

    if (memberships && memberships.length > 0) {
      const orgList = memberships.map(m => m.organizations)
      setOrgs(orgList)

      const savedOrgId = localStorage.getItem('mlb_current_org')
      const savedOrg = orgList.find(o => o.id === savedOrgId)

      if (savedOrg) {
        setCurrentOrg(savedOrg)
        setMembership(memberships.find(m => m.organization_id === savedOrg.id))
      } else {
        setCurrentOrg(orgList[0])
        setMembership(memberships[0])
      }
    }
    setLoading(false)
  }

  function switchOrg(orgId) {
    const org = orgs.find(o => o.id === orgId)
    if (org) {
      setCurrentOrg(org)
      localStorage.setItem('mlb_current_org', orgId)
    }
  }

  async function createOrg(name, slug) {
    const { data, error } = await supabase
      .from('organizations')
      .insert({ name, slug })
      .select()
      .single()

    if (!error && data) {
      await fetchOrgs()
      setCurrentOrg(data)
      localStorage.setItem('mlb_current_org', data.id)
    }
    return { data, error }
  }

  return (
    <OrgContext.Provider value={{
      orgs, currentOrg, membership, loading,
      switchOrg, createOrg, refreshOrgs: fetchOrgs
    }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  return useContext(OrgContext)
}
