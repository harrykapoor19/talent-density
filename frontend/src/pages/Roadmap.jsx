import { useState } from 'react'
import { apiFetch } from '../lib/api'
import { Sparkles, Search, AlertCircle, TrendingUp, Users, Globe, Cpu, Target, AlertTriangle, Flag } from 'lucide-react'
import Spinner from '../components/Spinner'

const CONFIDENCE_COLORS = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-zinc-50 text-zinc-600 border-zinc-200',
}

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-surface-primary border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-fg-secondary" />
        <h3 className="text-body font-semibold text-fg">{title}</h3>
      </div>
      {children}
    </div>
  )
}

export default function Roadmap() {
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const submit = async (e) => {
    e?.preventDefault()
    if (!companyName.trim()) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const resp = await apiFetch('/api/roadmap/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName.trim() }),
      })
      const json = await resp.json()
      if (!resp.ok) {
        setError(json.detail || 'Failed to predict roadmap')
      } else {
        setData(json)
      }
    } catch (err) {
      setError(err.message || 'Network error')
    }
    setLoading(false)
  }

  const r = data?.roadmap

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-title-lg font-semibold text-fg mb-1">Company Roadmap Predictor</h1>
        <p className="text-caption text-fg-secondary">
          Enter a company we've already tracked. We read every JD they've posted and predict what they're building next 12-24 months.
        </p>
      </div>

      <form onSubmit={submit} className="flex gap-2 items-stretch">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
          <input
            type="text"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            placeholder="Try: Anthropic, Cursor, Cartesia..."
            className="w-full pl-9 pr-3 py-2 bg-surface-primary border border-border rounded-md text-body text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !companyName.trim()}
          className="btn btn-primary inline-flex items-center gap-1.5"
        >
          {loading ? <Spinner /> : <Sparkles size={14} />}
          {loading ? 'Predicting…' : 'Predict roadmap'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
          <AlertCircle size={15} className="text-red-600 mt-0.5 shrink-0" />
          <div className="text-body text-red-800">{error}</div>
        </div>
      )}

      {loading && !data && (
        <div className="bg-surface-primary border border-border rounded-lg p-8 text-center">
          <Spinner />
          <div className="text-caption text-fg-secondary mt-3">
            Reading JDs and predicting roadmap with Claude Sonnet… ~10-15s
          </div>
        </div>
      )}

      {data && r && (
        <div className="space-y-4">
          {/* Header strip */}
          <div className="bg-gradient-to-br from-brand-50 to-surface-primary border border-brand-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="text-title font-semibold text-fg">{data.company}</div>
              <div className="text-caption text-fg-muted">
                {data.jobs_analyzed} JD{data.jobs_analyzed !== 1 ? 's' : ''} analyzed
              </div>
            </div>
            <p className="text-body text-fg leading-relaxed">{r.thesis}</p>
          </div>

          {/* Product bets */}
          {r.product_bets?.length > 0 && (
            <SectionCard icon={TrendingUp} title="Product bets (next 12-24M)">
              <div className="space-y-2.5">
                {r.product_bets.map((b, i) => (
                  <div key={i} className="border-l-2 border-brand-300 pl-3">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-medium text-fg text-body">{b.bet}</span>
                      {b.confidence && (
                        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${CONFIDENCE_COLORS[b.confidence] || CONFIDENCE_COLORS.low}`}>
                          {b.confidence}
                        </span>
                      )}
                    </div>
                    <div className="text-caption text-fg-secondary leading-relaxed">{b.evidence}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Team scaling */}
          {r.team_scaling && (
            <SectionCard icon={Users} title="Team scaling pattern">
              <div className="text-body text-fg mb-3">{r.team_scaling.headline}</div>
              {r.team_scaling.by_function?.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {r.team_scaling.by_function.map((f, i) => (
                    <div key={i} className="bg-surface-secondary rounded-md p-2.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium text-fg text-caption">{f.function}</span>
                        {typeof f.count === 'number' && f.count > 0 && (
                          <span className="text-caption text-brand-600 font-semibold">{f.count}</span>
                        )}
                      </div>
                      <div className="text-[12px] text-fg-secondary leading-snug">{f.signal}</div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {/* Geo + Tech signals row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {r.geographic_moves && (
              <SectionCard icon={Globe} title="Geographic moves">
                <p className="text-body text-fg-secondary leading-relaxed">{r.geographic_moves}</p>
              </SectionCard>
            )}
            {r.tech_signals?.length > 0 && (
              <SectionCard icon={Cpu} title="Tech signals">
                <ul className="space-y-1.5">
                  {r.tech_signals.map((s, i) => (
                    <li key={i} className="text-caption text-fg-secondary flex gap-2">
                      <span className="text-fg-muted">•</span>
                      <span className="leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}
          </div>

          {/* Strategic priorities */}
          {r.strategic_priorities?.length > 0 && (
            <SectionCard icon={Target} title="Strategic priorities">
              <div className="space-y-2.5">
                {r.strategic_priorities.map((p, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-caption font-semibold shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <div className="font-medium text-fg text-body">{p.priority}</div>
                      <div className="text-caption text-fg-secondary leading-relaxed">{p.reasoning}</div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Risks + next milestone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {r.risks_or_gaps && (
              <SectionCard icon={AlertTriangle} title="Telling absences">
                <p className="text-body text-fg-secondary leading-relaxed">{r.risks_or_gaps}</p>
              </SectionCard>
            )}
            {r.next_milestone_guess && (
              <SectionCard icon={Flag} title="Next public milestone (predicted)">
                <p className="text-body text-fg leading-relaxed">{r.next_milestone_guess}</p>
              </SectionCard>
            )}
          </div>

          {/* JD evidence */}
          {data.job_titles?.length > 0 && (
            <details className="bg-surface-primary border border-border rounded-lg p-4">
              <summary className="cursor-pointer text-caption text-fg-secondary font-medium select-none">
                Source JDs ({data.job_titles.length})
              </summary>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.job_titles.map((t, i) => (
                  <span key={i} className="text-[12px] bg-surface-secondary text-fg-secondary border border-border-subtle rounded px-2 py-0.5">
                    {t}
                  </span>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
