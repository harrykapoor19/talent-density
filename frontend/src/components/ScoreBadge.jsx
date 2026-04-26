import { scoreColor } from '../lib/utils'

export default function ScoreBadge({ score, size = 'md' }) {
  const { bg, text, border } = scoreColor(score)
  const sz = size === 'lg' ? 'w-11 h-11 text-sm' : size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'

  return (
    <div className={`${sz} rounded-full border ${border} ${bg} flex items-center justify-center shrink-0`}>
      <span className={`font-bold leading-none ${text}`}>{score ?? '—'}</span>
    </div>
  )
}
