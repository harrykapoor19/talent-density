import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDateMDY } from '../lib/utils'
import { useToast } from './Toast'
import Spinner from './Spinner'
import ScoreBadge from './ScoreBadge'
import { Mail, Check, ExternalLink, Layers, X, Sparkles } from 'lucide-react'

export default function JobCard({ job, onStatusChange, style }) {
  const [localJob, setLocalJob] = useState(job)
  const [loading, setLoading] = useState(false)
  const [actionDone, setActionDone] = useState(null)
  const [showSkip, setShowSkip] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const [notes, setNotes] = useState(job.score_breakdown?.notes || '')
  const toast = useToast()

  const sb = localJob.score_breakdown || {}
  const sector = localJob._sector || localJob.companies?.sector || null
  const stage = localJob._stage || localJob.companies?.stage || null
  const reachedOut = !!sb.reached_out_at
  const whatTheyDo = localJob.companies?.what_they_do || ''
  const isNew = localJob._isNew || false
  const score = localJob.attractiveness_score

  const flashAction = (name) => {
    setActionDone(name)
    setTimeout(() => setActionDone(null), 500)
  }

  const updateStatus = async (newStatus) => {
    setLoading(true)
    try {
      const updates = { status: newStatus, updated_at: new Date().toISOString() }
      if (newStatus === 'reached_out') {
        const newSb = { ...sb, reached_out_at: new Date().toISOString() }
        updates.score_breakdown = newSb
        updates.status = 'prep_ready'
        await supabase.from('jobs').update(updates).eq('id', localJob.id)
        setLocalJob(prev => ({ ...prev, score_breakdown: newSb }))
        flashAction('outreach')
        toast(`${localJob.company_name} — reached out`, 'success')
      } else if (newStatus === 'applied') {
        const newSb = { ...sb, applied_at: new Date().toISOString() }
        updates.score_breakdown = newSb
        await supabase.from('jobs').update(updates).eq('id', localJob.id)
        flashAction('applied')
        toast(`${localJob.company_name} → Applied`, 'success')
        setTimeout(() => onStatusChange?.(localJob.id, newStatus), 400)
      } else {
        await supabase.from('jobs').update(updates).eq('id', localJob.id)
        flashAction('pipeline')
        toast(`${localJob.company_name} → Pipeline`, 'success')
        setTimeout(() => onStatusChange?.(localJob.id, newStatus), 400)
      }
    } finally {
      setLoading(false)
    }
  }

  const confirmSkip = async () => {
    setLoading(true)
    const updates = { status: 'skip', updated_at: new Date().toISOString() }
    if (skipReason.trim()) updates.score_breakdown = { ...sb, skip_reason: skipReason.trim() }
    await supabase.from('jobs').update(updates).eq('id', localJob.id)
    setLoading(false)
    toast(`Skipped ${localJob.company_name}`, 'info')
    onStatusChange?.(localJob.id, 'skip')
  }

  const saveNotes = async () => {
    const newSb = { ...sb, notes }
    await supabase.from('jobs').update({ score_breakdown: newSb }).eq('id', localJob.id)
    setLocalJob(prev => ({ ...prev, score_breakdown: newSb }))
  }

  return (
    <div
      className="bg-surface-primary rounded-lg border border-border hover:border-border-strong transition-all duration-150 flex flex-col overflow-hidden group"
      style={style}
    >
      <div className="p-3.5 flex flex-col gap-2.5 flex-1">
        <div className="flex items-start gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-fg text-body leading-snug">
              {localJob.url
                ? <a href={localJob.url} target="_blank" rel="noreferrer" className="hover:text-brand-600 transition-colors">{localJob.title}</a>
                : localJob.title}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-caption text-fg-secondary font-medium truncate">{localJob.company_name}</span>
              {isNew && <span className="px-1 py-px rounded text-[9px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-600">new</span>}
            </div>
          </div>
          <ScoreBadge score={score} />
        </div>

        <div className="flex flex-wrap gap-1">
          {sector && <span className="badge bg-surface-tertiary text-fg-secondary">{sector}</span>}
          {stage && <span className="badge bg-surface-tertiary text-fg-secondary">{stage}</span>}
          {reachedOut
            ? <span className="badge bg-amber-50 text-amber-700 gap-1"><Mail size={10} /> {fmtDateMDY(sb.reached_out_at)}</span>
            : localJob.created_at && <span className="text-caption text-fg-muted">{fmtDateMDY(localJob.created_at)}</span>
          }
        </div>

        {whatTheyDo && (
          <p className="text-caption text-fg-secondary leading-relaxed line-clamp-2">{whatTheyDo}</p>
        )}

        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Add a note..."
          className="text-caption w-full rounded-md px-2.5 py-1.5 bg-surface-secondary text-fg placeholder-fg-faint border border-transparent focus:border-border focus:bg-surface-primary focus:outline-none transition-all"
        />

        {showSkip && (
          <div className="bg-surface-secondary rounded-md p-2.5 space-y-2 border border-border-subtle animate-fade-in">
            <p className="text-caption font-medium text-fg-secondary">Why skip?</p>
            <input
              type="text"
              value={skipReason}
              onChange={e => setSkipReason(e.target.value)}
              placeholder="e.g. too infra-heavy"
              className="border border-border rounded-md px-2.5 py-1.5 text-caption w-full bg-surface-primary focus:outline-none focus:border-border-strong"
              autoFocus
            />
            <div className="flex gap-1.5">
              <button onClick={confirmSkip} disabled={loading} className="btn-sm bg-fg text-white hover:bg-neutral-800">
                {loading ? <Spinner size={12} /> : 'Skip'}
              </button>
              <button onClick={() => { setShowSkip(false); setSkipReason('') }} className="btn-sm bg-surface-primary text-fg-secondary border border-border hover:bg-surface-hover">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border-subtle px-2.5 py-2 space-y-1.5">
        <div className="flex items-center gap-1 w-full">
          <ActionBtn className="flex-1" onClick={() => updateStatus('pipeline')} disabled={loading} done={actionDone === 'pipeline'}>
            {actionDone === 'pipeline' ? <><Sparkles size={12} className="text-brand-500" /></> : <><Layers size={12} /> Pipeline</>}
          </ActionBtn>
          <ActionBtn className="flex-1" onClick={() => updateStatus('reached_out')} disabled={loading || reachedOut} dimmed={reachedOut} done={actionDone === 'outreach'}>
            {actionDone === 'outreach' ? <><Sparkles size={12} className="text-brand-500" /></> : reachedOut ? <><Check size={12} /> Sent</> : <><Mail size={12} /> Outreach</>}
          </ActionBtn>
          <ActionBtn className="flex-1" onClick={() => updateStatus('applied')} disabled={loading} done={actionDone === 'applied'}>
            {actionDone === 'applied' ? <><Sparkles size={12} className="text-brand-500" /></> : <><Check size={12} /> Applied</>}
          </ActionBtn>
        </div>
        <div className="flex items-center justify-between">
          {!showSkip
            ? <button onClick={() => setShowSkip(true)} disabled={loading}
                className="text-caption text-fg-faint hover:text-fg-secondary transition-colors py-1 px-0.5 inline-flex items-center gap-1">
                <X size={10} /> Skip
              </button>
            : <span />
          }
          {localJob.url
            ? <a href={localJob.url} target="_blank" rel="noreferrer"
                className="text-caption text-fg-faint hover:text-fg-secondary transition-colors font-medium py-1 px-0.5 inline-flex items-center gap-1">
                View <ExternalLink size={10} />
              </a>
            : <span />
          }
        </div>
      </div>
    </div>
  )
}

function ActionBtn({ children, onClick, disabled, dimmed, done, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1.5 rounded-md text-caption font-medium border transition-all duration-150 text-center
        inline-flex items-center justify-center gap-1
        ${done
          ? 'text-brand-600 border-brand-200 bg-brand-50 btn-action-done'
          : dimmed
            ? 'text-fg-faint border-border-subtle cursor-default'
            : 'text-fg-secondary border-border bg-surface-primary hover:bg-surface-hover hover:text-fg cursor-pointer active:scale-[0.97]'}
        disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  )
}
