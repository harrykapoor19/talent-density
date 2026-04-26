import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Briefcase, Loader2 } from 'lucide-react'

export default function Auth() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } },
        })
        if (error) throw error
        setSuccess('Check your email for a confirmation link.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-secondary flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 bg-fg rounded-md flex items-center justify-center">
            <Briefcase size={16} className="text-white" />
          </div>
          <span className="text-title font-semibold text-fg">Talent Density</span>
        </div>

        <div className="card p-6">
          <h1 className="text-title font-semibold text-fg mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-caption text-fg-muted mb-5">
            {mode === 'login'
              ? 'Track and engage the people who matter'
              : 'Stay close to the highest-density talent'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label className="block text-caption font-medium text-fg-secondary mb-1">Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Alex Johnson"
                  required
                  className="w-full px-3 py-2 rounded-md border border-border bg-surface-primary text-fg text-body placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg/20 focus:border-fg transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-caption font-medium text-fg-secondary mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2 rounded-md border border-border bg-surface-primary text-fg text-body placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg/20 focus:border-fg transition-colors"
              />
            </div>

            <div>
              <label className="block text-caption font-medium text-fg-secondary mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full px-3 py-2 rounded-md border border-border bg-surface-primary text-fg text-body placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-fg/20 focus:border-fg transition-colors"
              />
            </div>

            {error && (
              <p className="text-caption text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            {success && (
              <p className="text-caption text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full mt-1"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : null}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-center text-caption text-fg-muted mt-4">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess('') }}
            className="text-fg font-medium hover:underline"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
