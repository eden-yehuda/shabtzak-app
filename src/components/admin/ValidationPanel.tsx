import { useState } from 'react'
import type { ValidationError, Task, ErrorSeverity } from '@/types'

// Stable key per error: type + soldier + task + message text
export function errorKey(e: ValidationError): string {
  return `${e.type}|${e.soldier_id ?? ''}|${e.task_id ?? ''}|${e.message}`
}

const MAX_VISIBLE = 3

interface TierStyle {
  label: string
  dot: string
  row: string      // card classes
  badge: string    // tier badge classes
}

const TIERS: Record<ErrorSeverity, TierStyle> = {
  1: { label: 'קריטי', dot: '🔴', row: 'bg-red-50 border-red-300 text-red-700', badge: 'bg-red-600 text-white' },
  2: { label: 'חמור', dot: '🟠', row: 'bg-orange-50 border-orange-300 text-orange-700', badge: 'bg-orange-500 text-white' },
  3: { label: 'בינוני', dot: '🟡', row: 'bg-amber-50 border-amber-200 text-amber-800', badge: 'bg-amber-400 text-white' },
  4: { label: 'קל', dot: '⚪', row: 'bg-slate-50 border-slate-200 text-slate-600', badge: 'bg-slate-400 text-white' },
}
const DEFAULT_TIER: TierStyle = { label: 'שגיאה', dot: '🔴', row: 'bg-red-50 border-red-200 text-red-700', badge: 'bg-red-500 text-white' }

function tierOf(e: ValidationError): TierStyle {
  return e.severity ? (TIERS[e.severity] ?? DEFAULT_TIER) : DEFAULT_TIER
}

interface Props {
  errors: ValidationError[]
  dismissedKeys?: string[]
  onDismiss?: (key: string) => void
  onRestore?: (key: string) => void
  tasks?: Task[] // optional, used to build "day | task" header per error
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
function formatTaskHeader(task: Task | undefined): string | null {
  if (!task) return null
  const d = task.start_datetime
  const dayName = DAY_NAMES[d.getDay()]
  const dateStr = `${d.getDate()}/${d.getMonth() + 1}`
  return `${dayName} ${dateStr} | ${task.task_type}`
}

export default function ValidationPanel({ errors, dismissedKeys = [], onDismiss, onRestore, tasks = [] }: Props) {
  const [showDismissed, setShowDismissed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)   // show/hide toggle during scheduling
  const [drawerOpen, setDrawerOpen] = useState(false) // side panel with all errors
  const dismissedSet = new Set(dismissedKeys)
  const taskById = new Map(tasks.map(t => [t.id, t]))

  // Only render RED errors. Warnings are intentionally hidden.
  const onlyErrors = errors.filter(e => e.type === 'error')

  // Split visible vs dismissed, sorted by severity (most severe first)
  const bySeverity = (a: ValidationError, b: ValidationError) => (a.severity ?? 99) - (b.severity ?? 99)
  const visible = onlyErrors.filter(e => !dismissedSet.has(errorKey(e))).sort(bySeverity)
  const dismissed = onlyErrors.filter(e => dismissedSet.has(errorKey(e)))

  if (visible.length === 0 && dismissed.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm">
        ✓ אין שגיאות
      </div>
    )
  }

  const topVisible = visible.slice(0, MAX_VISIBLE)
  const hiddenCount = visible.length - topVisible.length

  function renderErrorRow(e: ValidationError, opts: { showDismiss: boolean }) {
    const k = errorKey(e)
    const tier = tierOf(e)
    const header = formatTaskHeader(e.task_id ? taskById.get(e.task_id) : undefined)
    return (
      <div key={`err-${k}`} className={`${tier.row} border rounded-xl px-4 py-3 text-sm flex flex-col gap-1`}>
        <div className="flex items-center gap-2">
          <span className={`${tier.badge} text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0`}>{tier.label}</span>
          {header && <div className="text-[11px] font-bold opacity-70 uppercase tracking-wide truncate">{header}</div>}
        </div>
        <div className="flex gap-2 items-start justify-between">
          <span className="flex-1">{tier.dot} {e.message}</span>
          {opts.showDismiss && onDismiss && (
            <button onClick={() => onDismiss(k)} title="סמן כתקין — הסתר שגיאה זו"
              className="text-current opacity-50 hover:opacity-100 hover:bg-white px-1.5 py-0.5 rounded text-base leading-none shrink-0">
              ✓
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Header bar: count + show/hide toggle */}
      <div className="flex items-center justify-between">
        <button onClick={() => setCollapsed(c => !c)}
          className="text-sm font-bold text-red-700 hover:text-red-900 flex items-center gap-1">
          <span>{collapsed ? '▸' : '▾'}</span>
          <span>🔴 {visible.length} שגיאות</span>
        </button>
        <button onClick={() => setCollapsed(c => !c)}
          className="text-xs text-slate-500 hover:text-slate-700 font-semibold">
          {collapsed ? 'הצג' : 'הסתר'}
        </button>
      </div>

      {!collapsed && (
        <>
          {visible.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-green-700 text-sm">
              ✓ אין שגיאות פעילות
            </div>
          )}

          {topVisible.map(e => renderErrorRow(e, { showDismiss: true }))}

          {hiddenCount > 0 && (
            <button onClick={() => setDrawerOpen(true)}
              className="w-full text-sm font-semibold text-navy hover:text-blue-700 border border-dashed border-slate-300 rounded-xl py-2 hover:bg-slate-50">
              +{hiddenCount} שגיאות נוספות ←
            </button>
          )}

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
        </>
      )}

      {/* Side drawer: ALL active errors, grouped/sorted by severity */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDrawerOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-[26rem] max-w-[92vw] bg-white shadow-2xl z-50 flex flex-col" dir="rtl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 className="font-bold text-navy">כל השגיאות ({visible.length})</h3>
              <button onClick={() => setDrawerOpen(false)} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {visible.map(e => renderErrorRow(e, { showDismiss: true }))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
