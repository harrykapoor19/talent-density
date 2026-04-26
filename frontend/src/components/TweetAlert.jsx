import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { relativeDate } from '../lib/utils'

export default function TweetAlert({ post }) {
  const [copied, setCopied] = useState(false)

  const copyReply = () => {
    if (!post.reply_draft) return
    navigator.clipboard.writeText(post.reply_draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="bg-white border border-sky-100 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-caption flex-wrap">
        <a
          href={`https://x.com/${post.handle}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-sky-700 hover:underline"
        >
          @{post.handle}
        </a>
        <span className="text-fg-muted">·</span>
        <span className="text-fg-secondary">{post.person}</span>
        <span className="text-fg-muted">({post.company})</span>
        {post.detected_at && (
          <span className="text-fg-muted ml-auto">{relativeDate(post.detected_at)}</span>
        )}
      </div>

      {post.tweet_text && (
        <p className="text-body text-fg italic pl-3 border-l-2 border-sky-300 leading-relaxed">
          "{post.tweet_text.slice(0, 280)}{post.tweet_text.length > 280 ? '…' : ''}"
        </p>
      )}

      {post.reply_draft && (
        <div className="bg-surface-secondary rounded-md p-2.5 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-fg-muted uppercase tracking-wide font-semibold mb-1">
              Drafted reply
            </p>
            <p className="text-caption text-fg leading-relaxed">{post.reply_draft}</p>
          </div>
          <button
            onClick={copyReply}
            className="btn btn-ghost btn-sm shrink-0 text-fg-muted hover:text-fg"
            title="Copy to clipboard"
          >
            {copied
              ? <Check size={13} className="text-emerald-500" />
              : <Copy size={13} />
            }
          </button>
        </div>
      )}

      {post.tweet_url && (
        <a
          href={post.tweet_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-caption text-sky-600 hover:underline"
        >
          Open tweet <ExternalLink size={11} />
        </a>
      )}
    </div>
  )
}
