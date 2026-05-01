import { useState, useEffect } from 'react'
import type { Soldier, Task, Assignment, TaskType } from '@/types'
import {
  groupIntoBlocks,
  resolveBlocks,
  diffBlocks,
  type SheetRow,
  type DiffEntry,
} from '@/utils/sheetParser'
import { createTask, updateTask, createAssignment, deleteAssignment, assignmentsRef, taskTypesRef } from '@/lib/firestore'
import { getDocs, query, where } from 'firebase/firestore'

interface Props {
  scheduleId: string
  scheduleStart: Date
  scheduleEnd: Date
  soldiers: Soldier[]
  tasks: Task[]
  assignments: Assignment[]
  onClose: () => void
  onApplied?: () => void
}

function isoDate(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function daysInRange(from: Date, to: Date): Set<string> {
  const s = new Set<string>()
  const cur = new Date(from); cur.setHours(12, 0, 0, 0)
  const end = new Date(to); end.setHours(12, 0, 0, 0)
  while (cur <= end) { s.add(isoDate(cur)); cur.setDate(cur.getDate() + 1) }
  return s
}

const STATUS_LABELS: Record<string, string> = {
  new: 'חדש',
  updated: 'עדכון',
  same: 'ללא שינוי',
}
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-green-50 border-green-300 text-green-800',
  updated: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  same: 'bg-slate-50 border-slate-200 text-slate-500',
}

export default function SyncFromSheets({
  scheduleId,
  scheduleStart,
  scheduleEnd,
  soldiers,
  tasks,
  assignments,
  onClose,
  onApplied,
}: Props) {
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diff, setDiff] = useState<DiffEntry[] | null>(null)
  const [syncWarnings, setSyncWarnings] = useState<string[]>([])
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    getDocs(taskTypesRef()).then(snap => {
      setTaskTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskType)))
    })
  }, [])

  const scheduleDates = daysInRange(scheduleStart, scheduleEnd)

  async function fetchAndDiff() {
    setLoading(true)
    setError(null)
    setDiff(null)
    try {
      const res = await fetch('/.netlify/functions/fetch-sheets')
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const rows: SheetRow[] = (data.rows as SheetRow[]).filter(r =>
        scheduleDates.has(r.date)
      )

      if (rows.length === 0) {
        setError('לא נמצאו שורות בגיליון עבור טווח תאריכי השבצ"ק')
        return
      }

      const blocks = groupIntoBlocks(rows)
      const resolved = resolveBlocks(blocks, soldiers)

      // Expand single-row blocks to full shift duration from task type config
      const expanded = resolved.map(block => {
        if (block.endHour - block.startHour > 1) return block  // already multi-hour
        const tt = taskTypes.find(t => t.name === block.taskType)
        if (!tt?.shift_duration_hours || tt.shift_duration_hours <= 1) return block
        return { ...block, endHour: block.startHour + tt.shift_duration_hours }
      })

      const entries = diffBlocks(expanded, tasks, assignments, scheduleId)

      // Warn only for task types that require a commander and have none assigned
      const warnings: string[] = []
      for (const entry of entries) {
        const tt = taskTypes.find(t => t.name === entry.block.taskType)
        if (!tt?.requires_commander) continue
        if (entry.block.soldierIds.length === 0) continue
        const hasCommander = entry.block.soldierIds.some(id => soldiers.find(s => s.id === id)?.is_commander)
        if (!hasCommander) {
          const names = entry.block.soldierIds.map(id => soldiers.find(s => s.id === id)?.full_name ?? id)
          warnings.push(`⚠️ אין מפקד ב: ${entry.block.taskType} ${entry.block.date} ${entry.block.startHour}:00 (${names.join(', ')})`)
        }
      }
      setSyncWarnings(warnings)
      setDiff(entries)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה')
    } finally {
      setLoading(false)
    }
  }

  async function applyChanges() {
    if (!diff) return
    setApplying(true)
    try {
      for (const entry of diff) {
        if (entry.status === 'same') continue

        let taskId = entry.existingTaskId

        if (entry.status === 'new') {
          const { block } = entry
          const tt = taskTypes.find(t => t.name === block.taskType)
          const startDate = new Date(`${block.date}T${String(block.startHour).padStart(2, '0')}:00`)
          const endHour = block.endHour === 24 ? 0 : block.endHour
          const endDate = new Date(`${block.date}T${String(endHour).padStart(2, '0')}:00`)
          if (block.endHour >= 24 || (block.endHour === 0 && block.startHour > 0)) {
            endDate.setDate(endDate.getDate() + 1)
          }
          const ref = await createTask({
            schedule_id: scheduleId,
            task_name: block.taskType,
            task_type: block.taskType,
            difficulty: tt?.difficulty ?? 'hard',
            start_datetime: startDate,
            end_datetime: endDate,
            required_people_count: tt?.soldiers_required ?? block.soldierIds.length || 1,
            requires_commander: tt?.requires_commander ?? false,
            notes: '',
          })
          taskId = ref.id
          let commanderAssigned = false
          let nonCmdOrder = 1
          for (let i = 0; i < entry.block.soldierIds.length; i++) {
            const sid = entry.block.soldierIds[i]
            const note = entry.block.soldierIdNotes?.[i] ?? undefined
            const isCommander = soldiers.find(s => s.id === sid)?.is_commander ?? false
            let order: number
            if (!commanderAssigned && isCommander) {
              order = 0
              commanderAssigned = true
            } else {
              order = nonCmdOrder++
            }
            await createAssignment(taskId, sid, order, note || undefined)
          }
        } else if (entry.status === 'updated' && taskId) {
          // Update task times if they differ from the block
          const { block } = entry
          const newStart = new Date(`${block.date}T${String(block.startHour).padStart(2, '0')}:00`)
          const endHourAdj = block.endHour === 24 ? 0 : block.endHour
          const newEnd = new Date(`${block.date}T${String(endHourAdj).padStart(2, '0')}:00`)
          if (block.endHour >= 24 || (block.endHour === 0 && block.startHour > 0)) {
            newEnd.setDate(newEnd.getDate() + 1)
          }
          const existingTask = tasks.find(t => t.id === taskId)
          if (existingTask && (
            Math.abs(existingTask.start_datetime.getTime() - newStart.getTime()) > 60000 ||
            Math.abs(existingTask.end_datetime.getTime() - newEnd.getTime()) > 60000
          )) {
            await updateTask(taskId, { start_datetime: newStart, end_datetime: newEnd })
          }
          // Remove old assignments
          for (const sid of entry.removeAssignments) {
            const a = assignments.find(a => a.task_id === taskId && a.soldier_id === sid)
            if (a) await deleteAssignment(a.id)
          }
          // Also check Firestore directly for stale ones
          if (entry.removeAssignments.length > 0) {
            const snap = await getDocs(query(assignmentsRef(), where('task_id', '==', taskId)))
            for (const d of snap.docs) {
              if (entry.removeAssignments.includes(d.data().soldier_id)) {
                await deleteAssignment(d.id)
              }
            }
          }
          // Add new assignments (with notes and order)
          for (const sid of entry.addAssignments) {
            const idxInBlock = entry.block.soldierIds.indexOf(sid)
            const note = idxInBlock >= 0 ? (entry.block.soldierIdNotes?.[idxInBlock] ?? undefined) : undefined
            const isCommander = soldiers.find(s => s.id === sid)?.is_commander ?? false
            const order = isCommander ? 0 : idxInBlock >= 0 ? idxInBlock : 1
            await createAssignment(taskId, sid, order, note || undefined)
          }
        }
      }
      setApplied(true)
      onApplied?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהחלת שינויים')
    } finally {
      setApplying(false)
    }
  }

  const newCount = diff?.filter(e => e.status === 'new').length ?? 0
  const updatedCount = diff?.filter(e => e.status === 'updated').length ?? 0
  const sameCount = diff?.filter(e => e.status === 'same').length ?? 0
  const hasChanges = newCount > 0 || updatedCount > 0

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl p-6 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-5 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-navy">סנכרון מגוגל שיץ</h2>
            <p className="text-xs text-slate-400 mt-0.5">טווח: {isoDate(scheduleStart)} – {isoDate(scheduleEnd)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Idle state */}
          {!diff && !loading && !error && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-sm text-slate-600 mb-1">
                {'הגיליון יטוען, יושווה לשבצ"ק הנוכחי ויוצג הדיף לפני כל שינוי.'}
              </p>
              <p className="text-xs text-slate-400">רק שינויים ייכתבו ל-Firestore.</p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="text-center py-12 text-slate-500 text-sm">
              <div className="animate-spin text-3xl mb-3">⏳</div>
              טוען גיליון...
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}

          {/* Applied success */}
          {applied && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 text-center">
              {'✅ השינויים הוחלו בהצלחה — השבצ"ק עודכן.'}
            </div>
          )}

          {/* Diff */}
          {diff && !applied && (
            <div className="space-y-2">
              {/* Summary */}
              <div className="flex gap-3 mb-3 text-sm flex-wrap">
                {newCount > 0 && (
                  <span className="bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full font-semibold">
                    ✦ {newCount} חדשות
                  </span>
                )}
                {updatedCount > 0 && (
                  <span className="bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-1 rounded-full font-semibold">
                    ↻ {updatedCount} עדכונים
                  </span>
                )}
                {sameCount > 0 && (
                  <span className="bg-slate-50 text-slate-500 border border-slate-200 px-3 py-1 rounded-full">
                    = {sameCount} ללא שינוי
                  </span>
                )}
                {!hasChanges && (
                  <span className="text-green-700 font-semibold">{'✓ השבצ"ק מסונכרן — אין שינויים'}</span>
                )}
              </div>

              {/* Commander warnings */}
              {syncWarnings.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-xs space-y-1">
                  <div className="font-bold text-red-700 mb-1">🚨 שגיאות מפקדים:</div>
                  {syncWarnings.map((w, i) => (
                    <div key={i} className="text-red-600">{w}</div>
                  ))}
                </div>
              )}

              {/* Entries */}
              {diff.filter(e => e.status !== 'same').map((entry, i) => (
                <div
                  key={i}
                  className={`border rounded-xl p-3 text-sm ${STATUS_COLORS[entry.status]}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-semibold">
                      {entry.block.taskType} · {entry.block.date} · {String(entry.block.startHour).padStart(2, '0')}:00–{String(entry.block.endHour).padStart(2, '0')}:00
                    </div>
                    <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-white/60">
                      {STATUS_LABELS[entry.status]}
                    </span>
                  </div>

                  {/* Show only unmatched names as warnings */}
                  {entry.block.matchedNames.some(m => !m.full) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {entry.block.matchedNames.filter(m => !m.full).map((m, j) => (
                        <span key={j} className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                          {m.short} ⚠️ לא זוהה
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Assignment changes — show as replacements */}
                  {entry.status === 'updated' && (() => {
                    const name = (id: string) => soldiers.find(s => s.id === id)?.full_name ?? id
                    const adds = entry.addAssignments
                    const removes = entry.removeAssignments
                    const pairCount = Math.min(adds.length, removes.length)
                    const extraAdds = adds.slice(pairCount)
                    const extraRemoves = removes.slice(pairCount)
                    return (
                      <div className="mt-1 text-xs space-y-0.5">
                        {Array.from({ length: pairCount }, (_, i) => (
                          <div key={i} className="text-amber-700">
                            ⇄ {name(adds[i])} מחליף את {name(removes[i])}
                          </div>
                        ))}
                        {extraAdds.map((id, i) => (
                          <div key={`a${i}`} className="text-green-700">+ נוסף: {name(id)}</div>
                        ))}
                        {extraRemoves.map((id, i) => (
                          <div key={`r${i}`} className="text-red-600">− הוסר: {name(id)}</div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              ))}

              {/* Same entries (collapsed) */}
              {sameCount > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-slate-400 cursor-pointer">
                    הצג {sameCount} משימות ללא שינוי
                  </summary>
                  <div className="space-y-1.5 mt-1.5">
                    {diff.filter(e => e.status === 'same').map((entry, i) => (
                      <div key={i} className={`border rounded-xl p-2.5 text-xs ${STATUS_COLORS.same}`}>
                        {entry.block.taskType} · {entry.block.date} · {String(entry.block.startHour).padStart(2, '0')}:00–{String(entry.block.endHour).padStart(2, '0')}:00
                        · {entry.block.soldiers.join(', ')}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex gap-3 mt-4 shrink-0 pt-4 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 border border-slate-200 rounded-xl py-2.5 text-slate-600 text-sm">
            {applied ? 'סגור' : 'ביטול'}
          </button>

          {!diff && !applied && (
            <button
              onClick={fetchAndDiff}
              disabled={loading}
              className="flex-1 bg-navy text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40"
            >
              {loading ? '⏳ טוען...' : '📥 טען מגיליון'}
            </button>
          )}

          {diff && !applied && hasChanges && (
            <button
              onClick={applyChanges}
              disabled={applying}
              className="flex-1 bg-green-600 text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40"
            >
              {applying ? '⏳ מחיל...' : `החל ${newCount + updatedCount} שינויים`}
            </button>
          )}

          {diff && !applied && !hasChanges && (
            <button onClick={onClose} className="flex-1 bg-green-600 text-white rounded-xl py-2.5 font-semibold text-sm">
              ✓ מסונכרן
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
