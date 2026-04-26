import { Routes, Route, NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { Search, BarChart3, FolderKanban, CheckCircle, BookOpen, X, LogOut } from 'lucide-react'
import AuthGuard from './components/AuthGuard'
import OpenRoles from './pages/OpenRoles'
import OnRadar from './pages/OnRadar'
import Pipeline from './pages/Pipeline'
import ReachedOut from './pages/ReachedOut'
import Applied from './pages/Applied'
import Sources from './pages/Sources'
import Roadmap from './pages/Roadmap'
import Network from './pages/Network'

function NavTab({ to, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-md text-body font-medium transition-all duration-150 whitespace-nowrap inline-flex items-center ${
          isActive
            ? 'bg-surface-active text-fg'
            : 'text-fg-secondary hover:text-fg hover:bg-surface-hover'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

const HOW_CARDS = [
  {
    icon: Search,
    title: 'Discovers companies automatically',
    body: 'Every Monday, I pull open roles from Ashby and Greenhouse across 100+ tracked companies. The agent also scans funding news, LinkedIn hiring posts, and newsletters to surface new AI-native companies.',
  },
  {
    icon: BarChart3,
    title: 'Scores every role with Claude',
    body: 'A keyword pre-filter runs first at zero LLM cost: roles below 30/100 are dropped. The rest are scored on 5 dimensions with Claude Sonnet: role fit (30%), company fit (25%), end-user layer (20%), growth signal (15%), location (10%).',
  },
  {
    icon: FolderKanban,
    title: 'Routes to Open Roles or On Radar',
    body: 'Roles scoring 75+ go to Open Roles; 55-74 land in Borderline. Companies with no open PM roles go to On Radar. Every radar company gets a drafted outreach in my voice.',
  },
  {
    icon: CheckCircle,
    title: 'Tracks everything, drafts everything',
    body: 'Tracks application status, outreach, and follow-ups across all stages. Nothing is sent automatically. The agent drafts, I review, I send.',
  },
]

function HowItWorksPanel({ open, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] animate-fade-in" />
      <div
        className="relative w-full max-w-md bg-surface-primary border-l border-border shadow-xl h-full overflow-y-auto animate-slide-in-right"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface-primary/80 backdrop-blur-md border-b border-border-subtle px-5 py-3 flex items-center justify-between z-10">
          <h2 className="text-title text-fg">How this agent works</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-surface-active transition-colors text-fg-muted hover:text-fg">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {HOW_CARDS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="flex gap-3.5 animate-fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="w-8 h-8 rounded-md bg-surface-tertiary flex items-center justify-center shrink-0">
                <Icon size={16} className="text-fg-secondary" />
              </div>
              <div>
                <div className="font-medium text-fg text-body mb-0.5">{title}</div>
                <div className="text-caption text-fg-secondary leading-relaxed">{body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function getLastMonday() {
  const now = new Date()
  const diff = now.getDay() === 0 ? 6 : now.getDay() - 1
  const m = new Date(now)
  m.setDate(now.getDate() - diff)
  m.setHours(0, 0, 0, 0)
  return m
}

export default function App() {
  const [counts, setCounts] = useState({})
  const [thisWeek, setThisWeek] = useState({ jobs: 0, companies: 0 })
  const [showHelp, setShowHelp] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  useEffect(() => {
    const fetchCounts = async () => {
      const lastMonday = getLastMonday().toISOString()

      const [jobResp, radarResp, roRadarResp, weekJobResp, weekCoResp] = await Promise.all([
        supabase.from('jobs').select('id, status, score_breakdown'),
        supabase.from('companies').select('attention_score, feedback, radar_status').gte('attention_score', 40),
        supabase.from('companies').select('id').eq('radar_status', 'reached_out'),
        supabase.from('jobs').select('id', { count: 'exact' }).gte('created_at', lastMonday),
        supabase.from('companies').select('id', { count: 'exact' }).gte('created_at', lastMonday).not('attention_score', 'is', null).or('feedback.is.null,feedback.neq.not_for_me'),
      ])

      const jobs = jobResp.data || []
      const c = {}
      jobs.forEach(j => { c[j.status] = (c[j.status] || 0) + 1 })

      const radarCount = (radarResp.data || []).filter(r =>
        r.feedback !== 'not_for_me' && !['reached_out', 'applied'].includes(r.radar_status)
      ).length

      const roJobCount = jobs.filter(j =>
        (j.score_breakdown || {}).reached_out_at || j.status === 'reached_out'
      ).length
      const roCount = roJobCount + (roRadarResp.data?.length || 0)

      setCounts({
        open: (c['prep_ready'] || 0) + (c['borderline'] || 0) + (c['new'] || 0),
        radar: radarCount,
        pipeline: c['pipeline'] || 0,
        reachedOut: roCount,
        applied: c['applied'] || 0,
      })
      setThisWeek({ jobs: weekJobResp.count || 0, companies: weekCoResp.count || 0 })
    }
    fetchCounts()
  }, [])

  return (
    <AuthGuard>
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface-primary/80 backdrop-blur-md border-b border-border-subtle sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between gap-6">
          <span className="font-semibold text-fg text-body tracking-tight shrink-0">
            Talent Density
          </span>

          <nav className="flex items-center gap-0.5 overflow-x-auto flex-1 justify-center" aria-label="Main navigation">
            <NavTab to="/" end>Open Roles</NavTab>
            <NavTab to="/on-radar">On Radar</NavTab>
            <NavTab to="/pipeline">Pipeline</NavTab>
            <NavTab to="/reached-out">Outreach</NavTab>
            <NavTab to="/applied">Applied</NavTab>
            <NavTab to="/roadmap">Roadmap</NavTab>
            <NavTab to="/network">Network</NavTab>
            <NavTab to="/sources">Sources</NavTab>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {(thisWeek.jobs > 0 || thisWeek.companies > 0) && (
              <div className="text-caption text-fg-muted hidden sm:block">
                <span className="text-emerald-600 font-medium">{thisWeek.jobs} new</span>
                {thisWeek.companies > 0 && <span> · <span className="text-brand-600 font-medium">{thisWeek.companies} radar</span></span>}
              </div>
            )}
            <button
              onClick={() => setShowHelp(true)}
              className="px-2 py-1 rounded-md text-fg-muted hover:text-brand-600 hover:bg-brand-50 transition-colors inline-flex items-center gap-1.5 text-caption font-medium"
              title="How this agent works"
            >
              <BookOpen size={14} />
              <span className="hidden sm:inline">How it works</span>
            </button>
            {user && (
              <div className="flex items-center gap-2 pl-2 border-l border-border-subtle">
                <span className="text-caption text-fg-muted hidden sm:block truncate max-w-[120px]">
                  {user.user_metadata?.full_name || user.email}
                </span>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="btn btn-ghost btn-sm"
                  title="Sign out"
                >
                  <LogOut size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-6 space-y-5">
        <Routes>
          <Route path="/" element={<OpenRoles />} />
          <Route path="/on-radar" element={<OnRadar />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/reached-out" element={<ReachedOut />} />
          <Route path="/applied" element={<Applied />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/network" element={<Network />} />
          <Route path="/sources" element={<Sources />} />
        </Routes>
      </main>

      <HowItWorksPanel open={showHelp} onClose={() => setShowHelp(false)} />
    </div>
    </AuthGuard>
  )
}
