import { Eye, EyeOff, ExternalLink } from 'lucide-react'
import ScoreBadge from './ScoreBadge'

const CHANNEL_STYLES = {
  twitter_reply: { label: 'Twitter', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  linkedin_dm:   { label: 'LinkedIn DM', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  email:         { label: 'Email', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
}

export default function PersonCard({ person, isWatched, onAddToWatchlist }) {
  const channel = CHANNEL_STYLES[person.suggested_channel] || {
    label: person.suggested_channel || 'Unknown',
    cls: 'bg-gray-100 text-gray-600 border-gray-200',
  }
  const hasTwitter = !!person.twitter_handle
  const breakdown = person.score_breakdown || {}

  return (
    <div className="bg-surface-secondary border border-border rounded-lg p-4 flex items-start gap-4">
      <ScoreBadge score={person.target_score} size="lg" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-semibold text-fg text-body">{person.name}</span>
          {person.title && (
            <span className="text-fg-secondary text-caption">{person.title}</span>
          )}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${channel.cls}`}>
            {channel.label}
          </span>
        </div>

        {person.why_target && (
          <p className="text-caption text-fg-secondary mb-1.5 leading-relaxed">{person.why_target}</p>
        )}

        {person.opening_angle && (
          <p className="text-[11px] text-fg-muted italic mb-2">💡 {person.opening_angle}</p>
        )}

        {Object.keys(breakdown).length > 0 && (
          <details className="mb-2">
            <summary className="text-[11px] text-fg-muted cursor-pointer select-none hover:text-fg-secondary">
              Score breakdown
            </summary>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {Object.entries(breakdown).map(([k, v]) => (
                <span
                  key={k}
                  className="text-[10px] bg-surface-tertiary border border-border-subtle rounded px-2 py-0.5 text-fg-muted"
                >
                  {k.replace(/_/g, ' ')}: {v}
                </span>
              ))}
            </div>
          </details>
        )}

        <div className="flex items-center gap-3 text-caption">
          {person.linkedin_url && (
            <a
              href={person.linkedin_url}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 hover:underline inline-flex items-center gap-1"
            >
              LinkedIn <ExternalLink size={10} />
            </a>
          )}
          {person.twitter_handle && (
            <a
              href={`https://x.com/${person.twitter_handle.replace('@', '')}`}
              target="_blank"
              rel="noreferrer"
              className="text-sky-600 hover:underline inline-flex items-center gap-1"
            >
              @{person.twitter_handle.replace('@', '')} <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {isWatched ? (
          <button
            className="btn btn-ghost btn-sm text-fg-muted inline-flex items-center gap-1.5 cursor-default"
            disabled
          >
            <EyeOff size={13} /> Watching
          </button>
        ) : (
          <button
            onClick={() => hasTwitter && onAddToWatchlist(person)}
            disabled={!hasTwitter}
            title={!hasTwitter ? 'No Twitter handle — try LinkedIn DM instead' : 'Add to Twitter watchlist'}
            className={`btn btn-sm inline-flex items-center gap-1.5 ${
              hasTwitter
                ? 'btn-ghost text-sky-600 hover:bg-sky-50 hover:text-sky-700'
                : 'opacity-40 cursor-not-allowed'
            }`}
          >
            <Eye size={13} /> Watch on X
          </button>
        )}
      </div>
    </div>
  )
}
