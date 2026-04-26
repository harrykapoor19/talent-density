import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDateMDY, daysSince } from '../lib/utils'
import { useToast } from '../components/Toast'
import { RowSkeleton } from '../components/Skeleton'
import { Check, Clock } from 'lucide-react'

function JobRow({ job, onApplied }) {
  const [notes, setNotes] = useState(job.score_breakdown?.reached_out_notes || '')
  const toast = useToast()
  const sb = job.score_breakdown || {}
  const roTimestamp = sb.reached_out_at || (job.status === 'reached_out' ? job.updated_at : null)
  const roDate = fmtDateMDY(roTimestamp)
  const days = daysSince(roTimestamp)
  const showNudge = days != null && days >= 3

  const saveNotes = async () => {
    const newSb = { ...sb, reached_out_notes: notes }
    await supabase.from('jobs').update({ score_breakdown: newSb }).eq('id', job.id)
  }

  const markApplied = async () => {
    const newSb = { ...sb, applied_at: new Date().toISOString() }
    await supabase.from('jobs').update({ status: 'applied', score_breakdown: newSb }).eq('id', job.id)
    toast(`Moved ${job.company_name} to Applied`, 'success')
    onApplied(job.id)
  }

  return (
    <tr className="hover:bg-surface-hover transition-colors">
      <td className="px-3 py-2.5 font-medium text-fg">{job.company_name}</td>
      <td className="px-3 py-2.5 text-body text-fg-secondary">
        {job.url ? <a href={job.url} target="_blank" rel="noreferrer" className="hover:text-brand-600 transition-colors">{job.title}</a> : job.title}
      </td>
      <td className="px-3 py-2.5 text-body text-fg-secondary whitespace-nowrap">
        {roDate}
        {showNudge && (
          <span className="inline-flex items-center gap-0.5 text-amber-600 font-medium text-caption ml-1.5">
            <Clock size={12} /> {days}d
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        <button
          onClick={markApplied}
          className="text-caption text-fg-muted hover:text-emerald-600 font-medium transition-colors inline-flex items-center gap-1 py-1.5 px-2 rounded-md hover:bg-emerald-50 min-h-[30px]"
          title="Mark as applied"
        >
          <Check size={12} /> Applied
        </button>
      </td>
      <td className="px-3 py-2.5">
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="e.g. Recruiter replied, follow up Fri"
          className="border border-border rounded-md px-3 py-2 text-caption w-full min-w-48 focus:outline-none focus:ring-2 focus:ring-brand-200 min-h-[30px]"
        />
      </td>
    </tr>
  )
}

function RadarRow({ item, onApplied }) {
  const [notes, setNotes] = useState('')
  const toast = useToast()

  const markApplied = async () => {
    await supabase.from('companies').update({ radar_status: 'applied' }).eq('id', item.id)
    toast(`Moved ${item.name} to Applied`, 'success')
    onApplied(item.id)
  }

  return (
    <tr className="hover:bg-surface-hover transition-colors">
      <td className="px-3 py-2.5 font-medium text-fg">{item.name}</td>
      <td className="px-3 py-2.5 text-caption text-fg-muted">—</td>
      <td className="px-3 py-2.5 text-body text-fg-secondary"></td>
      <td className="px-3 py-2.5 text-center">
        <button
          onClick={markApplied}
          className="text-caption text-fg-muted hover:text-emerald-600 font-medium transition-colors inline-flex items-center gap-1 py-1.5 px-2 rounded-md hover:bg-emerald-50 min-h-[30px]"
          title="Mark as applied"
        >
          <Check size={12} /> Applied
        </button>
      </td>
      <td className="px-3 py-2.5">
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Recruiter replied, follow up Fri"
          className="border border-border rounded-md px-3 py-2 text-caption w-full min-w-48 focus:outline-none focus:ring-2 focus:ring-brand-200 min-h-[30px]"
        />
      </td>
    </tr>
  )
}

export default function ReachedOut() {
  const [jobs, setJobs] = useState([])
  const [radarItems, setRadarItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      const [jobResp, radarResp] = await Promise.all([
        supabase.from('jobs').select('*').order('updated_at', { ascending: false }),
        supabase.from('companies').select('id, name, radar_status, relationship_message').eq('radar_status', 'reached_out'),
      ])
      const allJobs = jobResp.data || []
      const reachedOut = allJobs.filter(j =>
        (j.score_breakdown || {}).reached_out_at || j.status === 'reached_out'
      )
      setJobs(reachedOut)
      setRadarItems(radarResp.data || [])
      setLoading(false)
    }
    fetchAll()
  }, [])

  const removeJob = (id) => setJobs(prev => prev.filter(j => j.id !== id))
  const removeRadar = (id) => setRadarItems(prev => prev.filter(r => r.id !== id))

  const total = jobs.length + radarItems.length

  return (
    <div className="space-y-3">
      <div className="text-caption text-fg-muted">
        {total} {total === 1 ? 'company' : 'companies'} reached out to
        {radarItems.length > 0 && <span className="ml-1.5 text-fg-faint">· {radarItems.length} from On Radar</span>}
      </div>

      {loading ? (
        <div className="card overflow-hidden">
          <table className="w-full text-body">
            <thead className="bg-surface-secondary border-b border-border-subtle">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Company</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Role</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Date</th>
                <th className="px-3 py-2.5 font-medium text-fg-secondary text-label">Action</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}
            </tbody>
          </table>
        </div>
      ) : total === 0 ? (
        <div className="text-center py-16 text-fg-muted text-body">
          No outreach tracked yet. Hit "Reached Out" on any job in Open Roles or Pipeline, or on a company in On Radar.
        </div>
      ) : (
        <div className="card overflow-hidden animate-fade-in">
          <table className="w-full text-body">
            <thead className="bg-surface-secondary border-b border-border-subtle">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Company</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Role</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Date</th>
                <th className="px-3 py-2.5 font-medium text-fg-secondary text-label">Action</th>
                <th className="text-left px-3 py-2.5 font-medium text-fg-secondary text-label">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {jobs.map(job => (
                <JobRow key={job.id} job={job} onApplied={removeJob} />
              ))}
              {radarItems.map(item => (
                <RadarRow key={item.id} item={item} onApplied={removeRadar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
