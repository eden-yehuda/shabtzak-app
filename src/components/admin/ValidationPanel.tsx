import { useState } from 'react'
import type { ValidationError } from '@/types'

// Stable key per error: type + soldier + task + message text
export function errorKey(e: ValidationError): string {
  return `${e.type}|${e.soldier_id ?? ''}|${e.task_id ?? ''}|${e.message}`
}

interface Props {
  errors: ValidationError[]
  dismissedKeys?: string[]
  onDismiss?: (key: string) => void
  onRestore?: (key: string) => void
}

export default function ValidationPanel({ errors, dismissedKeys = [], onDismiss, onRestore }: Props) {
  const [showDismissed, setShowDismissed] = useState(false)
  const dismissedSet = new Set(dismissedKeys)

  // Split visible vs dismissed
  const visible = errors.filter(e => !dismissedSet.has(errorKey(e)))
  const dismissed = errors.filter(e => dismissedSet.has(errorKey(e)))

  const visibleErrs = visible.filter(e => e.type === 'error')
  const visibleWarns = visible.filter(e => e.type === 'warning')

  if (visible.length === 0 && dismissed.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm">
        ✓ אין שגיאות
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {visible.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-green-700 text-sm">
          ✓ אין שגיאות פעילות
        </div>
      )}

      {visibleErrs.map(e => {
        const k = errorKey(e)
        return (
          <div key={`err-${k}`} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex gap-2 items-start justify-between">
            <span className="flex-1">🔴 {e.message}</span>
            {onDismiss && (
              <button onClick={() => onDismiss(k)} title="סמן כתקין — הסתר שגיאה זו"
                className="text-red-400 hover:text-green-600 hover:bg-white px-1.5 py-0.5 rounded text-base leading-none shrink-0">
                ✓
              </button>
            )}
          </div>
        )
      })}

      {visibleWarns.map(e => {
        const k = errorKey(e)
        return (
          <div key={`warn-${k}`} className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800 flex gap-2 items-start justify-between">
            <span className="flex-1">🟡 {e.message}</span>
            {onDismiss && (
              <button onClick={() => onDismiss(k)} title="סמן כתקין — הסתר אזהרה זו"
                className="text-yellow-500 hover:text-green-600 hover:bg-white px-1.5 py-0.5 rounded text-base leading-none shrink-0">
                ✓
              </button>
            )}
          </div>
        )
      })}

      {dismissed.length > 0 && (
        <div className="border-t border-slate-200 pt-2 mt-3">
          <button onClick={() => setShowDismissed(s => !s)}
            className="text-xs text-slate-500 hover:text-slate-700 font-semibold">
            {showDismissed ? '▼' : '▶'} {dismissed.length} שגיאות שסומנו כתקינות
          </button>
          {showDismissed && (
            <div className="space-y-1 mt-2">
              {dismissed.map(e => {
                const k = errorKey(e)
                return (
                  <div key={`dis-${k}`} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-500 flex gap-2 items-start justify-between">
                    <span className="flex-1 line-through">{e.type === 'error' ? '🔴' : '🟡'} {e.message}</span>
                    {onRestore && (
                      <button onClick={() => onRestore(k)} title="החזר שגיאה זו לרשימה"
                        className="text-slate-400 hover:text-orange-600 px-1.5 py-0.5 rounded text-sm leading-none shrink-0">
                        ↶
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
