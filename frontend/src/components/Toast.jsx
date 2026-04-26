import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

export function useToast() {
  return useContext(ToastContext)
}

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
}

const COLORS = {
  success: 'bg-surface-primary border-border text-fg',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-surface-primary border-border text-fg',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'success', duration = 2500) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type, exiting: false }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 150)
    }, duration)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 150)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-1.5" aria-live="polite">
        {toasts.map(({ id, message, type, exiting }) => {
          const Icon = ICONS[type]
          return (
            <div
              key={id}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border shadow-lg
                ${COLORS[type]} ${exiting ? 'animate-toast-out' : 'animate-toast-in'}`}
            >
              <Icon size={14} strokeWidth={2} className="shrink-0 text-fg-secondary" />
              <span className="text-caption font-medium">{message}</span>
              <button onClick={() => dismiss(id)} className="ml-1 opacity-40 hover:opacity-100 transition-opacity">
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
