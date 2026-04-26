import { supabase } from './supabase'

/**
 * Wraps fetch() for /api/* calls, injecting the current user's JWT
 * so the backend can identify the user and scope data to them.
 */
export async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) }

  if (supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  return fetch(url, { ...options, headers })
}
