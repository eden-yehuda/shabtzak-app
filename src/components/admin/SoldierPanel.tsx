import { useState, useMemo } from 'react'
import type { Soldier, Assignment, Task, LeaveRequest } from '@/types'
import { createAssignment } from '@/lib/firestore'
import { hoursGap, isSoldierInactiveOnDate } from '@/utils/dateUtils'
import { isAllowedConcurrent } from '@/utils/validation'

interface Props {
  soldiers: Soldier[]
  assignments: Assignment[]
  tasks: Task[]
  finalLeave: LeaveRequest[]
  selectedTaskId: string | null
  homeLeaveHour?: number  // hour when soldiers swap (default 2 — same as DAY_START)
  onAssigned?: (taskId: string, soldierId: string) => Promise<void>
}

function isoDate(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

function fmtHourRange(t: Task): string {
  const fmt = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  return `${fmt(t.start_datetime)}–${fmt(t.end_datetime)}`
}

function fmtDay(dateStr: string): string {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  const d = new Date(dateStr + 'T12:00:00')
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

// More granular status: distinguishes "leaving today" / "staying home" / "returning today" / "present"
type HomeStatus = 'present' | 'leavingToday' | 'stayingHome' | 'returningToday'
interface StatusInfo { label: string; color: string; key: HomeStatus }

function getSoldierStatus(soldier: Soldier, taskDate: string | null, finalLeave: LeaveRequest[]): StatusInfo {
  if (!taskDate) return { label: 'נמצא', color: 'text-green-700 bg-green-50', key: 'present' }
  const isHomeToday = finalLeave.some(r => r.soldier_id === soldier.id && r.date === taskDate && r.status === 'approved')
  const wasHomeYesterday = finalLeave.some(r => r.soldier_id === soldier.id && r.date === addDays(taskDate, -1) && r.status === 'approved')
  if (isHomeToday && wasHomeYesterday) return { label: 'בבית', color: 'text-blue-700 bg-blue-50', key: 'stayingHome' }
  if (isHomeToday && !wasHomeYesterday) return { label: 'יוצא', color: 'text-amber-700 bg-amber-50', key: 'leavingToday' }
  if (!isHomeToday && wasHomeYesterday) return { label: 'חוזר', color: 'text-teal-700 bg-teal-50', key: 'returningToday' }
  return { label: 'נמצא', color: 'text-green-700 bg-green-50', key: 'present' }
}

// Availability rank — lower = more preferred for assignment
function availabilityRank(item: { status: StatusInfo; hoursToday: number }): number {
  if (item.status.key === 'stayingHome') return 5
  if (item.status.key === 'leavingToday') return 4
  if (item.status.key === 'returningToday') return 3
  if (item.hoursToday > 0) return 2 // available but already has tasks today
  return 1 // best: fully available, no tasks today
}

// Decide whether soldier (with given status) can be assigned to the selected task,
// based on the task's time vs the home-leave swap hour.
function canAssignByLeaveStatus(status: HomeStatus, task: Task | null, homeLeaveHour: number): boolean {
  if (!task) return true // no task selected → no constraint here
  if (status === 'present') return true
  if (status === 'stayingHome') return false // fully home both days — never assignable
  // leavingToday: available BEFORE swap hour → task must END by homeLeaveHour
  if (status === 'leavingToday') {
    const endH = task.end_datetime.getHours()
    const endDay = isoDate(task.end_datetime)
    const startDay = isoDate(task.start_datetime)
    // task ends same day at or before the swap hour
    return endDay === startDay && endH <= homeLeaveHour
  }
  // returningToday: available AFTER swap hour → task must START at/after homeLeaveHour
  if (status === 'returningToday') {
    const startH = task.start_datetime.getHours()
    return startH >= homeLeaveHour
  }
  return false
}

export default function SoldierPanel({ soldiers, assignments, tasks, finalLeave, selectedTaskId, homeLeaveHour = 2, onAssigned }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [soldierModalId, setSoldierModalId] = useState<string | null>(null)
  const [othersOpen, setOthersOpen] = useState(false)

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId])
  const taskDate = selectedTask ? isoDate(selectedTask.start_datetime) : null

  const enriched = useMemo(() => soldiers.filter(s => {
    if (!s.is_active) return false
    // Hide soldiers who are inactive on the selected task's day (per-day hiding)
    if (taskDate && isSoldierInactiveOnDate(s, taskDate)) return false
    return true
  }).map(s => {
    const myAssignments = assignments.filter(a => a.soldier_id === s.id)
    const myTasks = myAssignments.map(a => tasks.find(t => t.id === a.task_id)).filter((t): t is Task => !!t)
    const taskCount = myTasks.length
    const isAssignedToSelected = selectedTaskId ? myAssignments.some(a => a.task_id === selectedTaskId) : false

    let restHours: number | null = null
    if (selectedTask) {
      const prev = myTasks.filter(t => t.end_datetime <= selectedTask.start_datetime)
        .sort((a, b) => b.end_datetime.getTime() - a.end_datetime.getTime())
      if (prev.length > 0) restHours = hoursGap(prev[0].end_datetime, selectedTask.start_datetime)
    }

    let isConcurrent = false
    if (selectedTask) {
      isConcurrent = myTasks.some(t =>
        t.id !== selectedTaskId &&
        t.start_datetime < selectedTask.end_datetime &&
        t.end_datetime > selectedTask.start_datetime &&
        !isAllowedConcurrent(t.task_type, selectedTask.task_type)
      )
    }

    // Hours already assigned that day (the day of the selected task)
    let hoursToday = 0
    if (taskDate) {
      for (const t of myTasks) {
        if (isoDate(t.start_datetime) === taskDate) {
          hoursToday += (t.end_datetime.getTime() - t.start_datetime.getTime()) / 3_600_000
        }
      }
    }

    const status = getSoldierStatus(s, taskDate, finalLeave)
    return { soldier: s, taskCount, isAssignedToSelected, restHours, status, isConcurrent, hoursToday }
  }), [soldiers, assignments, tasks, selectedTaskId, selectedTask, taskDate, finalLeave])

  type Item = typeof enriched[number]

  // Within a section: assigned-first, then by availability rank, then by MOST REST (descending),
  // then optionally commander preference, then by total task count.
  // Rest hours = time since soldier's last task ended before the selected task starts.
  // null restHours = soldier has never worked yet → effectively infinite rest → top of list.
  function sortByAvailability(items: Item[], commandersFirst: boolean): Item[] {
    return [...items].sort((a, b) => {
      if (a.isAssignedToSelected !== b.isAssignedToSelected) return a.isAssignedToSelected ? -1 : 1
      // Commanders always before non-commanders (primary sort after assigned)
      if (commandersFirst && a.soldier.is_commander !== b.soldier.is_commander)
        return a.soldier.is_commander ? -1 : 1
      const ra = availabilityRank(a)
      const rb = availabilityRank(b)
      if (ra !== rb) return ra - rb
      // More rest = better. null = infinite rest = best.
      const restA = a.restHours ?? Number.POSITIVE_INFINITY
      const restB = b.restHours ?? Number.POSITIVE_INFINITY
      if (restA !== restB) return restB - restA
      return a.taskCount - b.taskCount
    })
  }

  // Recommended = actually available for THIS task. Rest is NOT a filter — it only
  // affects ranking (sortByAvailability favors more rest). A soldier is irrelevant
  // ONLY if assigned concurrently, fully home that day, or (leaving/returning) not
  // available during the task's time window.
  function isRecommended(item: Item): boolean {
    if (item.isConcurrent) return false                  // משובץ במקביל
    if (item.status.key === 'stayingHome') return false  // בבית (יום שלם)
    // יוצא/חוזר — מומלץ רק אם זמין בפועל בחלון הזמן של המשימה
    if (!canAssignByLeaveStatus(item.status.key, selectedTask, homeLeaveHour)) return false
    return true
  }

  // When no task selected: single flat list (ranking is meaningless without a task).
  const unifiedList = useMemo(() => sortByAvailability(enriched, true), [enriched])

  // When a task IS selected: split into recommended (top, always open) and the rest (collapsed).
  const recommended = useMemo(
    () => selectedTaskId ? sortByAvailability(enriched.filter(isRecommended), true) : [],
    [enriched, selectedTaskId]
  )
  const others = useMemo(
    () => selectedTaskId ? sortByAvailability(enriched.filter(x => !isRecommended(x)), true) : [],
    [enriched, selectedTaskId]
  )

  const requiresCommander = selectedTask?.requires_commander ?? false

  async function assign(soldierId: string) {
    if (!selectedTaskId || isSubmitting) return
    const already = assignments.some(a => a.task_id === selectedTaskId && a.soldier_id === soldierId)
    if (already) return

    // Pre-assignment checks — collect warnings
    const item = enriched.find(x => x.soldier.id === soldierId)
    const warnings: string[] = []

    if (item && selectedTask) {
      // 1. Assigned during home leave
      if (item.status.key === 'stayingHome') {
        warnings.push('⚠️ החייל בבית באותו יום (יציאה מאושרת)')
      }
      // 2. Back-to-back (0h rest)
      if (item.restHours !== null && item.restHours <= 0) {
        warnings.push('⚠️ ברצף — החייל יוצא ממשימה ישירות לזו')
      }
      // 3. 8h-8h pattern (rest < 8h)
      else if (item.restHours !== null && item.restHours < 8) {
        warnings.push(`⚠️ רק ${item.restHours.toFixed(0)}ש׳ מנוחה מהמשימה הקודמת (8-8)`)
      }
    }

    if (warnings.length > 0) {
      const proceed = window.confirm(`${warnings.join('\n')}\n\nלשבץ בכל זאת?`)
      if (!proceed) return
    }

    setIsSubmitting(true)
    try {
      await createAssignment(selectedTaskId, soldierId)
      await onAssigned?.(selectedTaskId, soldierId)
    } catch (err) { console.error(err) }
    finally { setIsSubmitting(false) }
  }

  // Task summary
  const taskAssigned = selectedTask ? assignments.filter(a => a.task_id === selectedTaskId).length : 0
  const taskRequired = selectedTask?.required_people_count ?? 0
  const commanderAssigned = selectedTask ? assignments.some(a =>
    a.task_id === selectedTaskId &&
    soldiers.find(s => s.id === a.soldier_id)?.is_commander
  ) : false

  // Soldier modal: show all assignments of a single soldier (no task selected)
  const modalSoldier = soldierModalId ? soldiers.find(s => s.id === soldierModalId) ?? null : null
  const modalAssignments = useMemo(() => {
    if (!soldierModalId) return [] as Array<{ task: Task; date: string }>
    const list: Array<{ task: Task; date: string }> = []
    for (const a of assignments) {
      if (a.soldier_id !== soldierModalId) continue
      const t = tasks.find(x => x.id === a.task_id)
      if (t) list.push({ task: t, date: isoDate(t.start_datetime) })
    }
    return list.sort((a, b) => a.task.start_datetime.getTime() - b.task.start_datetime.getTime())
  }, [soldierModalId, assignments, tasks])

  const modalLeaveDays = useMemo(() => {
    if (!soldierModalId) return [] as string[]
    return finalLeave
      .filter(r => r.soldier_id === soldierModalId && r.status === 'approved')
      .map(r => r.date)
      .sort()
  }, [soldierModalId, finalLeave])

  function renderSoldierButton(item: Item) {
    const { soldier, taskCount, isAssignedToSelected, restHours, status, isConcurrent, hoursToday } = item
    // Soft warning only — DO NOT disable. The שבצקיסט may want to override.
    const violatesLeave = !canAssignByLeaveStatus(status.key, selectedTask, homeLeaveHour)
    // If no task is selected → clicking opens the soldier modal
    const handleClick = () => {
      if (!selectedTaskId) {
        setSoldierModalId(soldier.id)
        return
      }
      assign(soldier.id)
    }
    const disabled = selectedTaskId ? isAssignedToSelected : false
    return (
      <button key={soldier.id} type="button"
        onClick={handleClick}
        disabled={disabled}
        className={`w-full flex flex-col items-stretch gap-1 px-2 py-1.5 rounded-lg border transition text-sm ${
          isAssignedToSelected ? 'bg-blue-50 border-blue-300 text-blue-700' :
          violatesLeave ? 'bg-blue-50 border-blue-200 hover:border-navy hover:bg-blue-100 cursor-pointer' :
          isConcurrent ? 'bg-red-50 border-red-300' :
          !selectedTaskId ? 'bg-slate-50 border-slate-100 hover:bg-slate-100 cursor-pointer' :
          'bg-slate-50 border-slate-200 hover:border-navy hover:bg-white'
        }`}
        title={
          violatesLeave ? `⚠ ${status.label} — לא צפוי להיות זמין, אבל ניתן לשבץ בכל זאת` :
          isConcurrent ? '⚠ משובץ במקביל למשימה אחרת' :
          !selectedTaskId ? 'לחץ לראות שיבוצים' : undefined
        }>
        {/* Row 1: full name (entire width) — RED line-through if concurrent */}
        <div className="flex items-center gap-1 text-right">
          {soldier.is_commander && <span className="text-navy text-xs shrink-0">★</span>}
          <span className={`font-medium truncate flex-1 text-right ${isConcurrent ? 'line-through decoration-red-500 decoration-2 text-red-700' : ''}`}>
            {soldier.full_name}
          </span>
        </div>
        {/* Row 2: status + counters */}
        <div className="flex items-center gap-1 text-[10px] justify-end flex-wrap">
          {hoursToday > 0 && (
            <span className="font-semibold px-1 py-0.5 rounded text-purple-700 bg-purple-50" title="שעות שכבר שובצו לו היום">
              {hoursToday}ש׳ היום
            </span>
          )}
          {restHours !== null && restHours < 8 && (
            <span className="text-orange-600 font-semibold">מנוחה {restHours.toFixed(0)}ש׳</span>
          )}
          <span className={`font-semibold px-1.5 py-0.5 rounded-full ${status.color}`}>
            {status.label}
          </span>
          <span className="text-slate-400">סה״כ {taskCount}</span>
        </div>
      </button>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow p-3 flex flex-col gap-2 max-h-[calc(100vh-5rem)] overflow-hidden" dir="rtl">

      {/* Task summary */}
      {selectedTask ? (
        <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs border border-slate-200">
          <div className="font-bold text-slate-700 truncate">{selectedTask.task_name}</div>
          <div className="text-slate-500 mt-0.5 flex items-center gap-2">
            <span>{taskAssigned}/{taskRequired} משובצים</span>
            {requiresCommander && (
              <span className={commanderAssigned ? 'text-green-600' : 'text-red-500 font-semibold'}>
                {commanderAssigned ? '★ מפקד ✓' : '★ חסר מפקד'}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xs font-bold text-slate-500 text-center py-2">
          לחץ על משימה לשיבוץ או על חייל לראות את שיבוציו
        </div>
      )}

      {/* Soldiers list */}
      <div className="flex flex-col gap-2 overflow-y-auto flex-1">
        {selectedTaskId ? (
          <>
            {/* Recommended */}
            <div className="text-[11px] font-bold text-emerald-700 px-1">⭐ מומלצים ({recommended.length})</div>
            {recommended.length > 0 ? (
              <div className="grid grid-cols-2 gap-1">
                {recommended.map(item => renderSoldierButton(item))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic px-1">אין חיילים מומלצים זמינים</p>
            )}

            {/* Others (collapsible) */}
            <button onClick={() => setOthersOpen(o => !o)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-700 px-1 border-t border-slate-200 pt-2 mt-1 text-right">
              {othersOpen ? '▼' : '▶'} שאר החיילים ({others.length})
            </button>
            {othersOpen && (
              <div className="grid grid-cols-2 gap-1">
                {others.map(item => renderSoldierButton(item))}
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {unifiedList.map(item => renderSoldierButton(item))}
          </div>
        )}
      </div>

      {/* Modal: soldier's assignments + leave */}
      {modalSoldier && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSoldierModalId(null)} />
          <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-2xl z-50 w-[28rem] max-w-[90vw] max-h-[80vh] overflow-y-auto p-5" dir="rtl">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-bold text-navy flex items-center gap-1">
                  {modalSoldier.is_commander && <span>★</span>}
                  {modalSoldier.full_name}
                </h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  סה״כ {modalAssignments.length} משימות • {modalLeaveDays.length} ימי בית
                </div>
              </div>
              <button onClick={() => setSoldierModalId(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
            </div>

            {modalAssignments.length === 0 && modalLeaveDays.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">אין שיבוצים או ימי בית בשבצ״ק זה</p>
            )}

            {modalAssignments.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-bold text-slate-500 mb-2">שיבוצים:</div>
                <div className="flex flex-col gap-1">
                  {modalAssignments.map(({ task }) => (
                    <div key={task.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-100">
                      <span className="font-bold text-slate-700 flex-1">{task.task_type}</span>
                      <span className="text-slate-500">{fmtDay(isoDate(task.start_datetime))}</span>
                      <span className="font-mono text-slate-600">{fmtHourRange(task)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {modalLeaveDays.length > 0 && (
              <div>
                <div className="text-xs font-bold text-slate-500 mb-2">ימי בית:</div>
                <div className="flex flex-wrap gap-1">
                  {modalLeaveDays.map(d => (
                    <span key={d} className="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 font-semibold">
                      🏠 {fmtDay(d)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
