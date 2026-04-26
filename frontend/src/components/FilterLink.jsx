import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

export default function FilterLink({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const isActive = value !== options[0]

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-0.5 text-body transition-colors ${
          isActive ? 'text-brand-600 font-medium' : 'text-fg-secondary hover:text-fg'
        }`}
      >
        {value}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''} ${isActive ? 'text-brand-400' : 'text-fg-muted'}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 min-w-[140px] bg-surface-primary border border-border rounded-lg shadow-lg py-1 z-30 animate-fade-in">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-body transition-colors ${
                opt === value
                  ? 'text-brand-600 bg-brand-50 font-medium'
                  : 'text-fg-secondary hover:bg-surface-hover hover:text-fg'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
