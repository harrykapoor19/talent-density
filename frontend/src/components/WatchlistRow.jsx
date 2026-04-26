import { useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { relativeDate } from '../lib/utils'

export default function WatchlistRow({ entry, onRemove }) {
  const [confirmRemove, setConfirmRemove] = useState(false)

  const handleRemoveClick = () => {
    if (confirmRemove) {
      onRemove(entry.twitter_handle)
    } else {
      setConfirmRemove(true)
      setTimeout(() => setConfirmRemove(false), 3000)
    }
  }

  const lastChecked = entry.last_checked
    ? `checked ${relativeDate(entry.last_checked)}`
    : 'never checked'

  const activeWindow = entry.patterns?.predicted_window

  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-fg text-body">{entry.name}</span>
          <a
            href={`https://x.com/${entry.twitter_handle}`}
            target="_blank"
            rel="noreferrer"
            className="text-caption text-sky-600 hover:underline inline-flex items-center gap-0.5"
          >
            @{entry.twitter_handle} <ExternalLink size={10} />
          </a>
          <span className="text-caption text-fg-muted">({entry.company})</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {entry.context && (
            <span className="text-[11px] text-fg-muted truncate max-w-xs">
              {entry.context.slice(0, 80)}{entry.context.length > 80 ? '…' : ''}
            </span>
          )}
          <span className="text-[11px] text-fg-muted shrink-0">{lastChecked}</span>
          {activeWindow && activeWindow !== 'Insufficient data' && (
            <span className="text-[11px] text-emerald-600 shrink-0">· {activeWindow}</span>
          )}
        </div>
      </div>

      <button
        onClick={handleRemoveClick}
        className={`btn btn-ghost btn-sm inline-flex items-center gap-1 shrink-0 transition-colors ${
          confirmRemove ? 'text-red-600 hover:bg-red-50' : 'text-fg-muted hover:text-fg'
        }`}
        title={confirmRemove ? 'Click again to confirm removal' : 'Remove from watchlist'}
      >
        <X size={12} />
        {confirmRemove && <span className="text-[11px]">Remove?</span>}
      </button>
    </div>
  )
}
