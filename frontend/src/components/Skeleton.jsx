export function CardSkeleton() {
  return (
    <div className="bg-surface-primary rounded-lg border border-border p-3.5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3.5 w-3/4" />
          <div className="skeleton h-3 w-1/2" />
        </div>
        <div className="skeleton w-9 h-9 rounded-full" />
      </div>
      <div className="flex gap-1.5">
        <div className="skeleton h-4 w-14 rounded" />
        <div className="skeleton h-4 w-16 rounded" />
      </div>
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-7 w-full rounded-md" />
      <div className="flex gap-1.5 pt-2 border-t border-border-subtle">
        <div className="skeleton h-7 flex-1 rounded-md" />
        <div className="skeleton h-7 flex-1 rounded-md" />
        <div className="skeleton h-7 flex-1 rounded-md" />
      </div>
    </div>
  )
}

export function RowSkeleton({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <div className={`skeleton h-3.5 ${i === 0 ? 'w-28' : 'w-20'}`} />
        </td>
      ))}
    </tr>
  )
}

export function ListSkeleton({ count = 4 }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface-primary rounded-lg border border-border p-3 flex items-center gap-3">
          <div className="skeleton w-7 h-7 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3.5 w-1/3" />
            <div className="skeleton h-3 w-2/3" />
          </div>
          <div className="skeleton h-3 w-10" />
        </div>
      ))}
    </div>
  )
}
