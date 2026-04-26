import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDateMDY } from '../lib/utils'
import { RowSkeleton } from '../components/Skeleton'
import { Clock } from 'lucide-react'

function AppliedRow({ job, showCompany }) {
  const [bd, setBd] = useState(job.score_breakdown || {})
  const [appliedDate, setAppliedDate] = useState(fmtDateMDY(job.score_breakdown?.applied_at || job.updated_at))
  const [notes, setNotes] = useState(job.score_breakdown?.apply_notes || '')

  const followupAt = bd.apply_followup_at
  let followupDisplay = ''
  let followupUrgent = false
  if (followupAt) {
    const daysLeft = Math.floor((new Date(followupAt) - Date.now()) / 86400000)
    followupDisplay = daysLeft <= 0 ? 'Due now' : `In ${daysLeft}d`
    followupUrgent = daysLeft <= 0
  }

  const saveDate = async () => {
    const newBd = { ...bd, applied_at: appliedDate }
    await supabase.from('jobs').update({ score_breakdown: newBd }).eq('id', job.id)
    setBd(newBd)
  }

  const toggleFollowup = async (checked) => {
    const newBd = { ...bd }
    if (checked) {
      newBd.apply_followup_at = new Date(Date.now() + 5 * 86400000).toISOString()
    } else {
      newBd.apply_followup_at = null
    }
    await supabase.from('jobs').update({ score_breakdown: newBd }).eq('id', job.id)
    setBd(newBd)
  }

  const saveNotes = async () => {
    const newBd = { ...bd, apply_notes: notes }
    await supabase.from('jobs').update({ score_breakdown: newBd }).eq('id', job.id)
    setBd(newBd)
  }

  return (
    <tr className="hover:bg-surface-hover transition-colors">
      <td className="px-3 py-2.5 font-medium text-fg">
        {showCompany ? job.company_name : ''}
      </td>
      <td className="px-3 py-2.5 text-body text-fg-secondary">
        {job.url
          ? <a href={job.url} target="_blank" rel="noreferrer" className="hover:text-brand-600 transition-colors">{job.title}</a>
          : job.title}
      </td>
      <td className="px-3 py-2.5">
        <input
          type="text"
          value={appliedDate}
          onChange={e => setAppliedDate(e.target.value)}
          onBlur={saveDate}
          placeholder="MM/DD/YY"
          className="border border-border rounded-md px-3 py-2 text-caption w-24 focus:outline-none focus:ring-2 focus:ring-brand-200 min-h-[30px]"
        />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <label className="flex items-center gap-1.5 text-caption text-fg-secondary cursor-pointer min-h-[30px]">
            <input
              type="checkbox"
              checked={!!followupAt}
              onChange={e => toggleFollowup(e.target.checked)}
              className="rounded w-4 h-4"
            />
            Follow up
          </label>
          {followupDisplay && (
            <span className={`text-caption inline-flex items-center gap-1 ${followupUrgent ? 'text-red-500 font-medium' : 'text-fg-muted'}`}>
              <Clock size={12} /> {followupDisplay}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Add notes..."
          className="border border-border rounded-md px-3 py-2 text-caption w-full min-w-40 focus:outline-none focus:ring-2 focus:ring-brand-200 min-h-[30px]"
        />
      </td>
    </tr>
  )
}

export default function Applied() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'applied')
        .order('updated_at', { ascending: false })
      setJobs(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const grouped = (() => {
    const byCompany = {}
    for (const j of jobs) {
      if (!byCompany[j.company_name]) byCompany[j.company_name] = []
      byCompany[j.company_name].push(j)
    }
    const entries = Object.entries(byCompany)
    entries.sort((a, b) => {
      const latestDate = (list) => {
        const dates = list.map(j => (j.score_breakdown?.applied_at || j.updated_at || '')).filter(Boolean)
        return dates.length ? Math.max(...dates.map(d => new Date(d).getTime())) : 0
      }
      return latestDate(b[1]) - latestDate(a[1])
    })
    return entries
  })()

  return (
    <div className="space-y-3">
      <div className="text-caption text-fg-muted">{jobs.length} applications tracked</div>

      {loading ? (
        <div className="card overflow-hidden">
          <table className="w-full text-body">
            <thead className="bg-surface-secondary border-b border-border-subtle">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Company</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Role</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Applied On</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Follow-up</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Notes</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={i} />)}
            </tbody>
          </table>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 text-fg-muted text-body">No applications tracked yet.</div>
      ) : (
        <div className="card overflow-hidden animate-fade-in">
          <table className="w-full text-body">
            <thead className="bg-surface-secondary border-b border-border-subtle">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Company</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Role</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Applied On</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Follow-up</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Notes</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([company, companyJobs]) => (
                <>
                  {companyJobs.map((job, idx) => (
                    <AppliedRow key={job.id} job={job} showCompany={idx === 0} />
                  ))}
                  <tr key={`sep-${company}`} className="border-t border-border-subtle">
                    <td colSpan={5} className="py-0" />
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
