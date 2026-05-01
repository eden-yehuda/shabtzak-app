import { useState } from 'react'
import type { Soldier, Task, Assignment } from '@/types'
import {
  groupIntoBlocks,
  resolveBlocks,
  diffBlocks,
  type SheetRow,
  type DiffEntry,
} from '@/utils/sheetParser'
import { createTask, createAssignment, deleteAssignment, assignmentsRef } from '@/lib/firestore'
import { getDocs, query, where } from 'firebase/firestore'

interface Props {
  scheduleId: string
  scheduleStart: Date
  scheduleEnd: Date
  soldiers: Soldier[]
  tasks: Task[]
  assignments: Assignment[]
  onClose: () => void
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
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diff, setDiff] = useState<DiffEntry[] | null>(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

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
      const entries = diffBlocks(resolved, tasks, assignments, scheduleId)
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
            difficulty: 'hard',
            start_datetime: startDate,
            end_datetime: endDate,
            required_people_count: block.soldierIds.length || 1,
            requires_commander: false,
            notes: '',
          })
          taskId = ref.id
          for (const sid of entry.block.soldierIds) {
            await createAssignment(taskId, sid)
          }
        } else if (entry.status === 'updated' && taskId) {
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
          // Add new assignments
          for (const sid of entry.addAssignments) {
            await createAssignment(taskId, sid)
          }
        }
      }
      setApplied(true)
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

                  {/* Soldier name resolution */}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {entry.block.matchedNames.map((m, j) => (
                      <span key={j} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        m.full ? 'bg-white/70' : 'bg-red-100 text-red-700'
                      }`}>
                        {m.short}{m.full && m.full !== m.short ? ` → ${m.full}` : ''}
                        {!m.full && ' ⚠️'}
                      </span>
                    ))}
                  </div>

                  {/* Assignment changes — show full names, not IDs */}
                  {entry.status === 'updated' && (
                    <div className="mt-1 text-xs space-y-0.5">
                      {entry.addAssignments.length > 0 && (
                        <div className="text-green-700">
                          + מצטרפים: {entry.addAssignments.map(id => soldiers.find(s => s.id === id)?.full_name ?? id).join(', ')}
                        </div>
                      )}
                      {entry.removeAssignments.length > 0 && (
                        <div className="text-red-600">
                          − מוסרים: {entry.removeAssignments.map(id => soldiers.find(s => s.id === id)?.full_name ?? id).join(', ')}
                        </div>
                      )}
                    </div>
                  )}
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
