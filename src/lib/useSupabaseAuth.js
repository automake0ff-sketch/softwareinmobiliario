import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { useStore } from './store'

export function useSupabaseAuth() {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const navigate = useNavigate()
  const { setUser, setAgency } = useStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        loadUserProfile(session.user)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        loadUserProfile(session.user)
      } else if (_event === 'SIGNED_OUT') {
        setUser(null)
        setAgency(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadUserProfile = async (authUser) => {
    const { data: userData } = await supabase
      .from('users')
      .select('*, agencies(*)')
      .eq('id', authUser.id)
      .single()

    if (userData) {
      setUser(userData)
      setAgency(userData.agencies || null)
    }
  }

  const signUp = useCallback(async ({ email, password, name, phone, agencyName, agencyCity, agencyPhone, plan }) => {
    setLoading(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, role: 'admin' },
        },
      })
      if (authError) throw authError

      const slug = agencyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')

      const { error: rpcError } = await supabase.rpc('register_agency', {
        p_agency_name: agencyName,
        p_agency_city: agencyCity,
        p_agency_slug: slug,
        p_plan: plan || 'starter',
      })
      if (rpcError) throw rpcError

      await loadUserProfile(authData.user)
      return { success: true }
    } catch (err) {
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      await loadUserProfile(data.user)
      return { success: true }
    } catch (err) {
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setAgency(null)
    setSession(null)
    navigate('/login')
  }, [navigate])

  return { loading, session, signUp, signIn, signOut }
}
