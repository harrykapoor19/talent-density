import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Auth from '../pages/Auth'

export default function AuthGuard({ children }) {
  const [session, setSession] = useState(undefined) // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-surface-secondary flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-fg/20 border-t-fg rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <Auth />

  return children
}
