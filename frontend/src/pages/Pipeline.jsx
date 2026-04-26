import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { daysSince, fmtDateMDY } from '../lib/utils'
import { useToast } from '../components/Toast'
import Spinner from '../components/Spinner'
import { ListSkeleton } from '../components/Skeleton'
import ScoreBadge from '../components/ScoreBadge'
import { Mail, Check, ExternalLink, ChevronUp, ChevronDown, Sparkles, RefreshCw, Clock, Zap } from 'lucide-react'

function PipelineCard({ job, onUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const [localJob, setLocalJob] = useState(job)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [notes, setNotes] = useState(job.score_breakdown?.notes || '')
  const toast = useToast()

  const sb = localJob.score_breakdown || {}
  const prep = localJob.prep_materials || {}
  const reachedOutAt = sb.reached_out_at
  const hasPrepMsg = !!(prep.outreach_message || '').trim()
  const daysReachedOut = daysSince(reachedOutAt)
  const showNudge = reachedOutAt && daysReachedOut >= 3

  const markReachedOut = async () => {
    setLoading(true)
    const newSb = { ...sb, reached_out_at: new Date().toISOString() }
    await supabase.from('jobs').update({ score_breakdown: newSb }).eq('id', localJob.id)
    setLocalJob(prev => ({ ...prev, score_breakdown: newSb }))
    setLoading(false)
    toast(`Marked ${localJob.company_name} as reached out`, 'success')
  }

  const markApplied = async () => {
    setLoading(true)
    const newSb = { ...sb, applied_at: new Date().toISOString() }
    await supabase.from('jobs').update({ status: 'applied', score_breakdown: newSb }).eq('id', localJob.id)
    setLoading(false)
    toast(`Moved ${localJob.company_name} to Applied`, 'success')
    onUpdate(localJob.id)
  }

  const generatePrep = async () => {
    setGenerating(true)
    try {
      const resp = await fetch('/api/pipeline/generate-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: localJob.id,
          company_name: localJob.company_name,
          title: localJob.title,
          jd_text: localJob.jd_text,
          score_breakdown: localJob.score_breakdown,
        }),
      })
      const data = await resp.json()
      if (data.outreach_message) {
        const newPrep = { outreach_message: data.outreach_message, generated_at: data.generated_at }
        setLocalJob(prev => ({ ...prev, prep_materials: newPrep }))
        setExpanded(true)
        toast('Outreach message generated', 'success')
      }
    } catch (e) {
      toast('Prep generation failed', 'error')
    }
    setGenerating(false)
  }

  const saveNotes = async () => {
    const newSb = { ...sb, notes }
    await supabase.from('jobs').update({ score_breakdown: newSb }).eq('id', localJob.id)
    setLocalJob(prev => ({ ...prev, score_breakdown: newSb }))
  }

  const outreachMsg = prep.outreach_message || ''

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-1.5 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors min-h-[36px]"
      >
        <ScoreBadge score={localJob.attractiveness_score} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-fg text-body">
            {localJob.company_name}
          </div>
          <div className="text-caption text-fg-secondary truncate inline-flex items-center gap-1">
            {localJob.title}
            {showNudge && (
              <span className="inline-flex items-center gap-0.5 text-amber-600 font-medium">
                <Clock size={12} /> Follow up ({daysReachedOut}d)
              </span>
            )}
          </div>
        </div>
        <div className="text-caption text-fg-muted shrink-0">
          {fmtDateMDY(localJob.created_at)}
        </div>
        <span className="text-fg-muted shrink-0">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-border-subtle p-3.5 space-y-3 animate-fade-in">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-1.5">
            <button
              className={reachedOutAt ? 'btn-sm bg-amber-100 text-amber-700 border border-amber-200' : 'btn-warning btn-sm'}
              onClick={markReachedOut}
              disabled={loading || !!reachedOutAt}
            >
              {loading ? <Spinner size={12} /> : <Mail size={12} />}
              {reachedOutAt ? 'Sent' : 'Reached Out'}
            </button>
            <button className="btn-primary btn-sm" onClick={markApplied} disabled={loading}>
              {loading ? <Spinner size={12} /> : <Check size={12} />} Applied
            </button>
            {localJob.url && (
              <a href={localJob.url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                <ExternalLink size={12} /> View job
              </a>
            )}
          </div>

          {/* Outreach message */}
          <div>
            <div className="text-caption font-medium text-fg-secondary mb-1.5">Outreach Message</div>
            <div className="text-caption text-fg-muted mb-1.5">Find the right person on LinkedIn. Swap [Name] and send.</div>
            {outreachMsg ? (
              <>
                <textarea
                  value={outreachMsg}
                  readOnly
                  rows={6}
                  className="w-full border border-border rounded-md px-3 py-2 text-caption text-fg bg-surface-secondary resize-none"
                />
                <div className="flex items-center gap-1.5 mt-1.5">
                  <button
                    className="btn-ghost btn-sm"
                    onClick={generatePrep}
                    disabled={generating}
                  >
                    {generating ? <Spinner size={12} /> : <RefreshCw size={12} />}
                    {generating ? 'Regenerating...' : 'Regenerate'}
                  </button>
                  <span className="text-caption text-fg-muted">
                    {outreachMsg.length} chars
                    {prep.generated_at && ` · generated ${prep.generated_at.slice(0, 10)}`}
                  </span>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <div className="text-caption text-fg-muted italic">No outreach message yet.</div>
                <button
                  className="btn-primary btn-sm"
                  onClick={generatePrep}
                  disabled={generating}
                >
                  {generating ? <Spinner size={12} /> : <Sparkles size={12} />}
                  {generating ? 'Generating...' : 'Generate now'}
                </button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <div className="text-caption font-medium text-fg-secondary mb-1">Notes</div>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Interview status, recruiter name, next step..."
              className="border border-border rounded-md px-3 py-2 text-caption w-full focus:outline-none focus:ring-2 focus:ring-brand-200 min-h-[36px]"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function Pipeline() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [generatingAll, setGeneratingAll] = useState(false)
  const toast = useToast()

  const fetchJobs = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'pipeline')
      .order('created_at', { ascending: false })
    setJobs(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchJobs() }, [])

  const handleUpdate = (jobId) => setJobs(prev => prev.filter(j => j.id !== jobId))

  const needsPrep = jobs.filter(j => !(j.prep_materials?.outreach_message || '').trim())

  const generateAllPrep = async () => {
    setGeneratingAll(true)
    for (const job of needsPrep) {
      try {
        await fetch('/api/pipeline/generate-prep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: job.id,
            company_name: job.company_name,
            title: job.title,
            jd_text: job.jd_text,
            score_breakdown: job.score_breakdown,
          }),
        })
      } catch (e) {
        console.error('Failed prep for', job.id, e)
      }
    }
    setGeneratingAll(false)
    toast(`Generated prep for ${needsPrep.length} jobs`, 'success')
    fetchJobs()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-caption text-fg-secondary">
          {jobs.length} jobs in pipeline
          {needsPrep.length > 0 && (
            <span className="ml-1.5 text-amber-600">· {needsPrep.length} need prep</span>
          )}
        </div>
        {needsPrep.length > 0 && (
          <button
            className="btn-primary btn-sm"
            onClick={generateAllPrep}
            disabled={generatingAll}
          >
            {generatingAll ? <Spinner size={12} /> : <Zap size={12} />}
            {generatingAll ? 'Generating...' : `Generate prep for all (${needsPrep.length})`}
          </button>
        )}
      </div>

      {loading ? (
        <ListSkeleton count={4} />
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-fg-muted text-body">
          No jobs in pipeline yet. Hit Pipeline on any Open Role card.
        </div>
      ) : (
        <div className="space-y-1.5">
          {jobs.map((job, i) => (
            <div key={job.id} className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
              <PipelineCard job={job} onUpdate={handleUpdate} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
