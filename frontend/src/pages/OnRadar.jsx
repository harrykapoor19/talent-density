import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'
import { ListSkeleton } from '../components/Skeleton'
import ScoreBadge from '../components/ScoreBadge'
import FilterLink from '../components/FilterLink'
import { Mail, Check, ThumbsDown, ExternalLink, ChevronUp, ChevronDown, Sparkles, RefreshCw, Search } from 'lucide-react'

const NOT_FOR_ME_REASONS = [
  'Wrong sector', 'Wrong stage', 'Not AI enough',
  'Too early / no product yet', 'Too late / too big',
  'Wrong geography', 'Other',
]

function RadarCard({ item, onHide }) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState(item.relationship_message || '')
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showNotForMe, setShowNotForMe] = useState(false)
  const [nfmReason, setNfmReason] = useState(NOT_FOR_ME_REASONS[0])
  const toast = useToast()

  const score = item.attention_score
  const status = item.radar_status
  const isReachedOut = status === 'reached_out'
  const hasDraft = !!draft.trim()

  const saveDraft = async () => {
    await supabase.from('companies').update({ relationship_message: draft }).eq('id', item.id)
  }

  const generateDraft = async () => {
    setGenerating(true)
    try {
      const resp = await apiFetch('/api/radar/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: item.id, company: item.name, what_they_do: item.what_they_do }),
      })
      const data = await resp.json()
      if (data.message) {
        setDraft(data.message)
        setExpanded(true)
        toast('Draft generated', 'success')
      }
    } catch (e) {
      toast('Draft generation failed', 'error')
    }
    setGenerating(false)
  }

  const markReachedOut = async () => {
    setLoading(true)
    await supabase.from('companies').update({ radar_status: 'reached_out' }).eq('id', item.id)
    setLoading(false)
    toast(`Marked ${item.name} as reached out`, 'success')
    onHide(item.id)
  }

  const markApplied = async () => {
    setLoading(true)
    await supabase.from('companies').update({ radar_status: 'applied' }).eq('id', item.id)
    setLoading(false)
    toast(`Moved ${item.name} to Applied`, 'success')
    onHide(item.id)
  }

  const confirmNotForMe = async () => {
    setLoading(true)
    await supabase.from('companies').update({ feedback: 'not_for_me', feedback_reason: nfmReason }).eq('id', item.id)
    await supabase.from('jobs')
      .update({ status: 'skip' })
      .eq('company_name', item.name)
      .in('status', ['new', 'borderline', 'prep_ready'])
    setLoading(false)
    toast(`Dismissed ${item.name}`, 'info')
    onHide(item.id)
  }

  return (
    <div className="card overflow-hidden">
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="w-full flex items-start gap-1.5 p-2.5 text-left hover:bg-surface-hover transition-colors min-h-[36px]"
      >
        <ScoreBadge score={score} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-fg text-body inline-flex items-center gap-1.5">
            {isReachedOut && <Mail size={12} className="text-amber-600" />}
            {status === 'applied' && <Check size={12} className="text-emerald-600" />}
            {item.name}
            {item._isNew && <span className="badge bg-emerald-50 text-emerald-700 font-bold uppercase tracking-wide text-[0.65rem]">new</span>}
          </div>
          {item.what_they_do && (
            <div className="text-caption text-fg-secondary mt-0.5 line-clamp-1">{item.what_they_do}</div>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            {item.sector && <span className="badge bg-surface-tertiary text-fg-secondary">{item.sector}</span>}
            {item.stage && <span className="badge bg-surface-tertiary text-fg-secondary">{item.stage}</span>}
            {item.funding_info && <span className="badge bg-surface-tertiary text-fg-secondary">{item.funding_info}</span>}
            {item.investors && <span className="text-caption text-fg-muted">backed by {item.investors}</span>}
          </div>
        </div>
        <span className="text-fg-muted mt-0.5 shrink-0">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border-subtle p-2.5 space-y-2.5 animate-fade-in">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-1.5">
            <button
              className={isReachedOut ? 'btn-sm bg-amber-100 text-amber-700 border border-amber-200' : 'btn-warning btn-sm'}
              onClick={markReachedOut}
              disabled={loading || isReachedOut}
            >
              {loading ? <Spinner size={12} /> : <Mail size={12} />}
              {isReachedOut ? 'Sent' : 'Reached Out'}
            </button>
            <button className="btn-primary btn-sm" onClick={markApplied} disabled={loading}>
              {loading ? <Spinner size={12} /> : <Check size={12} />} Applied
            </button>
            {!showNotForMe && (
              <button className="btn-danger btn-sm" onClick={() => setShowNotForMe(true)} disabled={loading}>
                <ThumbsDown size={12} /> Not for me
              </button>
            )}
            {item.source_url && (
              <a href={item.source_url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm ml-auto">
                <ExternalLink size={12} />
              </a>
            )}
          </div>

          {/* Not for me form */}
          {showNotForMe && (
            <div className="bg-red-50 rounded-md p-2.5 space-y-1.5 animate-fade-in">
              <div className="text-caption font-medium text-red-700">Why is {item.name} not a fit?</div>
              <select
                value={nfmReason}
                onChange={e => setNfmReason(e.target.value)}
                className="border border-red-200 rounded-md px-3 py-2 text-caption w-full bg-surface-primary min-h-[30px]"
              >
                {NOT_FOR_ME_REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
              <div className="flex gap-1.5">
                <button onClick={confirmNotForMe} disabled={loading} className="btn-danger btn-sm">
                  {loading ? <Spinner size={12} /> : 'Confirm'}
                </button>
                <button onClick={() => setShowNotForMe(false)} className="btn-secondary btn-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Outreach draft */}
          <div>
            <div className="text-caption font-medium text-fg-secondary mb-1.5">Outreach draft</div>
            {hasDraft ? (
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={saveDraft}
                rows={5}
                className="w-full border border-border rounded-md px-3 py-2 text-caption text-fg focus:outline-none focus:ring-2 focus:ring-brand-200 resize-none min-h-[36px]"
              />
            ) : (
              <div className="space-y-1.5">
                <div className="text-caption text-fg-muted italic">No draft yet.</div>
                <button
                  className="btn-primary btn-sm"
                  onClick={generateDraft}
                  disabled={generating}
                >
                  {generating ? <Spinner size={12} /> : <Sparkles size={12} />}
                  {generating ? 'Generating...' : 'Generate draft'}
                </button>
              </div>
            )}
            {hasDraft && (
              <div className="flex gap-1.5 mt-1.5">
                <button
                  className="btn-ghost btn-sm"
                  onClick={generateDraft}
                  disabled={generating}
                >
                  {generating ? <Spinner size={12} /> : <RefreshCw size={12} />}
                  {generating ? 'Regenerating...' : 'Regenerate'}
                </button>
                <span className="text-caption text-fg-muted self-center">{draft.length} chars</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function OnRadar() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [hiddenIds, setHiddenIds] = useState(new Set())
  const [statusFilter, setStatusFilter] = useState('Not yet contacted')
  const [sectorFilter, setSectorFilter] = useState('All sectors')
  const [stageFilter, setStageFilter] = useState('All stages')
  const [scoreFilter, setScoreFilter] = useState('All scores')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetchAll = async () => {
      const [coResp, jobResp] = await Promise.all([
        supabase.from('companies').select('*').gte('attention_score', 40).order('attention_score', { ascending: false, nullsFirst: false }),
        supabase.from('jobs').select('company_name').in('status', ['prep_ready', 'borderline', 'new']),
      ])

      const openNames = new Set((jobResp.data || []).map(j => j.company_name))

      const monday = (() => {
        const now = new Date()
        const diff = now.getDay() === 0 ? 6 : now.getDay() - 1
        const m = new Date(now); m.setDate(now.getDate() - diff); m.setHours(0, 0, 0, 0)
        return m
      })()

      const enriched = (coResp.data || [])
        .filter(c => c.feedback !== 'not_for_me' && c.sector !== 'Cybersecurity AI' && !openNames.has(c.name))
        .map(c => ({ ...c, _isNew: new Date(c.created_at) >= monday }))

      setCompanies(enriched)
      setLoading(false)
    }
    fetchAll()
  }, [])

  const hideItem = (id) => setHiddenIds(prev => new Set([...prev, id]))

  const allSectors = useMemo(() =>
    ['All sectors', ...Array.from(new Set(companies.map(c => c.sector).filter(Boolean))).sort()],
  [companies])

  const allStages = useMemo(() =>
    ['All stages', ...Array.from(new Set(companies.map(c => c.stage).filter(Boolean))).sort()],
  [companies])

  const filtered = useMemo(() => {
    let result = companies.filter(c => !hiddenIds.has(c.id))

    if (statusFilter === 'Not yet contacted')
      result = result.filter(c => !['reached_out', 'applied'].includes(c.radar_status))
    else if (statusFilter === 'Has draft')
      result = result.filter(c => (c.relationship_message || '').trim() && !['reached_out', 'applied'].includes(c.radar_status))
    else if (statusFilter === 'Reached out')
      result = result.filter(c => c.radar_status === 'reached_out')
    else if (statusFilter === 'Applied')
      result = result.filter(c => c.radar_status === 'applied')

    if (sectorFilter !== 'All sectors') result = result.filter(c => c.sector === sectorFilter)
    if (stageFilter !== 'All stages') result = result.filter(c => c.stage === stageFilter)
    const sc = c => c.attention_score || 0
    if (scoreFilter === 'High (80+)') result = result.filter(c => sc(c) >= 80)
    if (scoreFilter === 'Medium (60-79)') result = result.filter(c => sc(c) >= 60 && sc(c) < 80)
    if (scoreFilter === 'Low (<60)') result = result.filter(c => sc(c) > 0 && sc(c) < 60)

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.name?.toLowerCase().includes(q) || c.sector?.toLowerCase().includes(q)
      )
    }

    return [...result].sort((a, b) => {
      if (a._isNew !== b._isNew) return a._isNew ? -1 : 1
      return (b.attention_score || 0) - (a.attention_score || 0)
    })
  }, [companies, hiddenIds, statusFilter, sectorFilter, stageFilter, scoreFilter, search])

  return (
    <div className="space-y-3">
      {/* Filter bar — minimal inline */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-1 max-w-xs">
          <Search size={12} className="text-fg-muted shrink-0" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-transparent text-body text-fg placeholder-fg-muted outline-none border-b border-transparent focus:border-fg-faint transition-colors pb-0.5"
          />
        </div>
        <div className="flex items-center gap-3 text-body">
          <FilterLink label="Status" value={statusFilter} onChange={setStatusFilter}
            options={['Not yet contacted', 'Has draft', 'All', 'Reached out', 'Applied']} />
          <span className="text-fg-faint">·</span>
          <FilterLink label="Sector" value={sectorFilter} onChange={setSectorFilter}
            options={allSectors} />
          <span className="text-fg-faint">·</span>
          <FilterLink label="Stage" value={stageFilter} onChange={setStageFilter}
            options={allStages} />
          <span className="text-fg-faint">·</span>
          <FilterLink label="Score" value={scoreFilter} onChange={setScoreFilter}
            options={['All scores', 'High (80+)', 'Medium (60-79)', 'Low (<60)']} />
        </div>
      </div>

      {/* Count line */}
      <div className="text-caption text-fg-muted">
        {filtered.length} {filtered.length === 1 ? 'company' : 'companies'}
        {(() => { const n = filtered.filter(c => c._isNew).length; return n > 0 ? <span className="ml-1.5 text-emerald-600 font-medium">· {n} new this week</span> : null })()}
      </div>

      {loading ? (
        <ListSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-fg-muted text-body">No companies matching this filter.</div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((item, i) => (
            <div key={item.id} className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
              <RadarCard item={item} onHide={hideItem} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
