import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../lib/api'
import { Users, Eye, RefreshCw, X, AlertTriangle, Search } from 'lucide-react'
import Spinner from '../components/Spinner'
import PersonCard from '../components/PersonCard'
import WatchlistRow from '../components/WatchlistRow'
import TweetAlert from '../components/TweetAlert'
import { useToast } from '../components/Toast'

export default function Network() {
  // Find people
  const [company, setCompany] = useState('')
  const [roleHint, setRoleHint] = useState('')
  const [findLoading, setFindLoading] = useState(false)
  const [findError, setFindError] = useState(null)
  const [findResults, setFindResults] = useState(null) // null = never searched
  const findJobIdRef = useRef(null)
  const findPollRef = useRef(null)

  // Watchlist
  const [watchlist, setWatchlist] = useState([])
  const [watchlistLoading, setWatchlistLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [newPosts, setNewPosts] = useState([])
  const checkJobIdRef = useRef(null)
  const checkPollRef = useRef(null)

  const toast = useToast()

  useEffect(() => {
    loadWatchlist()
    return () => {
      clearInterval(findPollRef.current)
      clearInterval(checkPollRef.current)
    }
  }, [])

  const loadWatchlist = async () => {
    setWatchlistLoading(true)
    try {
      const res = await apiFetch('/api/network/watchlist')
      const data = await res.json()
      setWatchlist(data.watchlist || [])
    } catch {
      toast('Could not load watchlist', 'error')
    }
    setWatchlistLoading(false)
  }

  const handleFind = async () => {
    if (!company.trim() || findLoading) return
    clearInterval(findPollRef.current)
    setFindLoading(true)
    setFindError(null)
    setFindResults(null)

    try {
      const res = await apiFetch('/api/network/find-people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: company.trim(), role_hint: roleHint.trim() }),
      })
      const data = await res.json()
      findJobIdRef.current = data.job_id

      let elapsed = 0
      findPollRef.current = setInterval(async () => {
        elapsed += 1500
        try {
          const poll = await apiFetch(`/api/network/find-people/status/${findJobIdRef.current}`)
          const pd = await poll.json()
          if (pd.status === 'done') {
            clearInterval(findPollRef.current)
            setFindResults(Array.isArray(pd.result) ? pd.result : [])
            setFindLoading(false)
          } else if (pd.status === 'error') {
            clearInterval(findPollRef.current)
            setFindError(pd.result?.error || 'Search failed. Try again.')
            setFindLoading(false)
          }
        } catch { /* keep polling */ }
        if (elapsed >= 60000) {
          clearInterval(findPollRef.current)
          setFindError('Search timed out — the Apify request may have failed. Try again.')
          setFindLoading(false)
        }
      }, 1500)
    } catch (e) {
      setFindError('Failed to start search: ' + e.message)
      setFindLoading(false)
    }
  }

  const handleAddToWatchlist = async (person) => {
    try {
      const res = await apiFetch('/api/network/watchlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_name: person.name,
          twitter_handle: (person.twitter_handle || '').replace('@', ''),
          company: person.company || company,
          context: person.opening_angle || '',
        }),
      })
      const data = await res.json()
      toast(
        data.status === 'added'
          ? `Watching @${person.twitter_handle}`
          : 'Already on watchlist',
        'success'
      )
      loadWatchlist()
    } catch {
      toast('Failed to add to watchlist', 'error')
    }
  }

  const handleRemoveFromWatchlist = async (handle) => {
    try {
      await apiFetch('/api/network/watchlist/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ twitter_handle: handle }),
      })
      setWatchlist(wl => wl.filter(e => e.twitter_handle !== handle))
      toast('Removed from watchlist', 'success')
    } catch {
      toast('Failed to remove', 'error')
    }
  }

  const handleCheck = async () => {
    if (checking || watchlist.length === 0) return
    clearInterval(checkPollRef.current)
    setChecking(true)

    try {
      const res = await apiFetch('/api/network/watchlist/check', { method: 'POST' })
      const data = await res.json()
      checkJobIdRef.current = data.job_id

      checkPollRef.current = setInterval(async () => {
        try {
          const poll = await apiFetch(`/api/network/watchlist/check/status/${checkJobIdRef.current}`)
          const pd = await poll.json()
          if (pd.status === 'done') {
            clearInterval(checkPollRef.current)
            const posts = pd.result?.new_posts || []
            if (posts.length > 0) {
              setNewPosts(posts)
              toast(`${posts.length} new post${posts.length > 1 ? 's' : ''} found!`, 'success')
            } else {
              toast('No new posts', 'success')
            }
            setChecking(false)
            loadWatchlist()
          } else if (pd.status === 'error') {
            clearInterval(checkPollRef.current)
            toast('Check failed: ' + (pd.result?.error || 'unknown error'), 'error')
            setChecking(false)
          }
        } catch { /* keep polling */ }
      }, 2000)
    } catch {
      toast('Failed to check tweets', 'error')
      setChecking(false)
    }
  }

  const watchedHandles = new Set(
    watchlist.map(e => (e.twitter_handle || '').toLowerCase())
  )

  return (
    <div className="space-y-5">

      {/* ── Find People ─────────────────────────────────── */}
      <div className="bg-surface-primary border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users size={15} className="text-brand-600" />
          <h2 className="text-title font-semibold text-fg">Find People</h2>
          <span className="text-caption text-fg-muted">Who to contact — ranked by response potential</span>
        </div>

        {findResults === null && !findLoading && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
            <AlertTriangle size={13} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-caption text-amber-800">
              Calls Apify (~$0.02) + Claude Sonnet to score contacts. Results take ~15s.
            </p>
          </div>
        )}

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
            <input
              type="text"
              placeholder="Company name (e.g. Anthropic)"
              value={company}
              onChange={e => setCompany(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFind()}
              className="w-full pl-8 pr-3 py-2 bg-surface-primary border border-border rounded-md text-body text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
            />
          </div>
          <input
            type="text"
            placeholder="Role hint (e.g. head of PLG)"
            value={roleHint}
            onChange={e => setRoleHint(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFind()}
            className="w-56 px-3 py-2 bg-surface-primary border border-border rounded-md text-body text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
          />
          <button
            onClick={handleFind}
            disabled={findLoading || !company.trim()}
            className="btn btn-primary btn-sm inline-flex items-center gap-1.5 px-4"
          >
            {findLoading ? <Spinner size={13} /> : <Users size={13} />}
            {findLoading ? 'Searching…' : 'Find people'}
          </button>
        </div>

        {findLoading && (
          <div className="bg-surface-secondary border border-border rounded-lg p-8 text-center">
            <Spinner size={20} className="text-brand-500 mx-auto mb-3" />
            <p className="text-body text-fg-secondary">Scanning LinkedIn + scoring with Claude…</p>
            <p className="text-caption text-fg-muted mt-1">~15 seconds</p>
          </div>
        )}

        {findError && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 text-caption text-red-700">
            {findError}
          </div>
        )}

        {!findLoading && findResults !== null && findResults.length === 0 && (
          <p className="text-body text-fg-muted text-center py-6">
            No people found. Try a different company name or add a role hint.
          </p>
        )}

        {!findLoading && findResults && findResults.length > 0 && (
          <div className="space-y-3">
            {findResults.map((person, i) => (
              <PersonCard
                key={i}
                person={person}
                isWatched={watchedHandles.has((person.twitter_handle || '').toLowerCase().replace('@', ''))}
                onAddToWatchlist={handleAddToWatchlist}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Watchlist ───────────────────────────────────── */}
      <div className="bg-surface-primary border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Eye size={15} className="text-sky-600" />
            <h2 className="text-title font-semibold text-fg">Twitter Watchlist</h2>
            {watchlist.length > 0 && (
              <span className="bg-sky-100 text-sky-700 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                {watchlist.length}
              </span>
            )}
          </div>
          <button
            onClick={handleCheck}
            disabled={checking || watchlist.length === 0}
            title={`Calls Apify for each person (~$0.02/person). Takes ~10–30s.`}
            className="btn btn-sm inline-flex items-center gap-1.5"
          >
            {checking ? <Spinner size={12} /> : <RefreshCw size={12} />}
            {checking ? 'Checking…' : 'Check for tweets'}
          </button>
        </div>

        {newPosts.length > 0 && (
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-caption font-semibold text-sky-800">
                New tweets — reply window open
              </span>
              <button
                onClick={() => setNewPosts([])}
                className="btn btn-ghost btn-sm text-sky-600 hover:bg-sky-100"
              >
                <X size={13} />
              </button>
            </div>
            <div className="space-y-3">
              {newPosts.map((post, i) => (
                <TweetAlert key={i} post={post} />
              ))}
            </div>
          </div>
        )}

        {watchlistLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-10 bg-surface-secondary rounded animate-pulse" />
            ))}
          </div>
        ) : watchlist.length === 0 ? (
          <div className="text-center py-10">
            <Users size={28} className="text-fg-muted mx-auto mb-2 opacity-30" />
            <p className="text-body text-fg-muted">No one on your watchlist yet.</p>
            <p className="text-caption text-fg-muted mt-0.5">
              Find people above and click <strong>Watch on X</strong>.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {watchlist.map((entry, i) => (
              <WatchlistRow
                key={entry.twitter_handle || i}
                entry={entry}
                onRemove={handleRemoveFromWatchlist}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
