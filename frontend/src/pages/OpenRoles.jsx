import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { deriveSector, deriveStage } from '../lib/utils'
import JobCard from '../components/JobCard'
import { CardSkeleton } from '../components/Skeleton'
import FilterLink from '../components/FilterLink'
import { Search } from 'lucide-react'

function getLastMonday() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export default function OpenRoles() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [sectorFilter, setSectorFilter] = useState('All sectors')
  const [stageFilter, setStageFilter] = useState('All stages')
  const [scoreFilter, setScoreFilter] = useState('All scores')
  const [weekFilter, setWeekFilter] = useState('All time')

  const fetchJobs = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('*, companies(sector, stage, what_they_do)')
      .in('status', ['prep_ready', 'borderline', 'new'])
      .order('attractiveness_score', { ascending: false, nullsFirst: false })
    if (data) {
      const lastMonday = getLastMonday()
      const enriched = data.map(job => ({
        ...job,
        _sector: job.companies?.sector || deriveSector(job),
        _stage: job.companies?.stage || deriveStage(job),
        _isNew: new Date(job.created_at) >= lastMonday,
      }))
      setJobs(enriched)
    }
    setLoading(false)
  }

  useEffect(() => { fetchJobs() }, [])

  const handleStatusChange = (jobId, newStatus) => {
    if (['skip', 'pipeline', 'applied'].includes(newStatus)) {
      setJobs(prev => prev.filter(j => j.id !== jobId))
    }
  }

  const allSectors = useMemo(() =>
    ['All sectors', ...Array.from(new Set(jobs.map(j => j._sector).filter(s => s && s !== 'Cybersecurity AI'))).sort()],
  [jobs])

  const allStages = useMemo(() =>
    ['All stages', ...Array.from(new Set(jobs.map(j => j._stage).filter(Boolean))).sort()],
  [jobs])

  const filtered = useMemo(() => {
    let result = jobs
    if (weekFilter === 'This week') result = result.filter(j => j._isNew)
    if (roleFilter === 'PM') result = result.filter(j => (j.score_breakdown || {}).role_type === 'pm')
    if (roleFilter === 'Generalist / Ops') result = result.filter(j => (j.score_breakdown || {}).role_type === 'operator')
    if (sectorFilter !== 'All sectors') result = result.filter(j => j._sector === sectorFilter)
    if (stageFilter !== 'All stages') result = result.filter(j => j._stage === stageFilter)
    const score = j => j.attractiveness_score ?? 0
    if (scoreFilter === 'High (75+)') result = result.filter(j => score(j) >= 75)
    if (scoreFilter === 'Medium (55-74)') result = result.filter(j => score(j) >= 55 && score(j) < 75)
    if (scoreFilter === 'Low (<55)') result = result.filter(j => score(j) > 0 && score(j) < 55)
    if (scoreFilter === 'Unscored') result = result.filter(j => !j.attractiveness_score)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(j =>
        j.title?.toLowerCase().includes(q) || j.company_name?.toLowerCase().includes(q)
      )
    }
    return [...result].sort((a, b) => {
      const aPinned = !!(a.score_breakdown?.pinned)
      const bPinned = !!(b.score_breakdown?.pinned)
      if (aPinned !== bPinned) return aPinned ? -1 : 1
      if (a._isNew !== b._isNew) return a._isNew ? -1 : 1
      return (b.attractiveness_score ?? 0) - (a.attractiveness_score ?? 0)
    })
  }, [jobs, weekFilter, roleFilter, sectorFilter, stageFilter, scoreFilter, search])

  const newCount = jobs.filter(j => j._isNew).length

  return (
    <div className="space-y-4">
      {/* Filter bar — variant B: minimal inline */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <Search size={14} className="text-fg-muted shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-transparent text-body text-fg placeholder-fg-muted outline-none border-b border-transparent focus:border-fg-faint transition-colors pb-0.5"
          />
        </div>
        <div className="flex items-center gap-4 text-body">
          <FilterLink label="Role" value={roleFilter} onChange={setRoleFilter}
            options={['All', 'PM', 'Generalist / Ops']} />
          <span className="text-fg-faint">·</span>
          <FilterLink label="Sector" value={sectorFilter} onChange={setSectorFilter}
            options={allSectors} />
          <span className="text-fg-faint">·</span>
          <FilterLink label="Stage" value={stageFilter} onChange={setStageFilter}
            options={allStages} />
          <span className="text-fg-faint">·</span>
          <FilterLink label="Score" value={scoreFilter} onChange={setScoreFilter}
            options={['All scores', 'High (75+)', 'Medium (55-74)', 'Low (<55)', 'Unscored']} />
          <span className="text-fg-faint">·</span>
          <FilterLink label="Time" value={weekFilter} onChange={setWeekFilter}
            options={['All time', 'This week']} />
        </div>
      </div>

      {/* Count */}
      <div className="text-caption text-fg-muted">
        {filtered.length} role{filtered.length !== 1 ? 's' : ''}
        {newCount > 0 && <span className="ml-1.5 text-emerald-600 font-medium">· {newCount} new this week</span>}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-fg-muted text-body">No roles matching this filter.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((job, i) => (
            <JobCard
              key={job.id}
              job={job}
              onStatusChange={handleStatusChange}
              style={{ opacity: 0, animation: `fade-in-up 0.25s ease-out ${Math.min(i, 12) * 40}ms forwards` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
