import { useState, useMemo } from 'react'
import type { Soldier, Assignment, Task, LeaveRequest } from '@/types'
import { createAssignment } from '@/lib/firestore'
import { hoursGap } from '@/utils/dateUtils'

interface Props {
  soldiers: Soldier[]
  assignments: Assignment[]
  tasks: Task[]
  finalLeave: LeaveRequest[]
  selectedTaskId: string | null
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

function getSoldierStatus(soldier: Soldier, taskDate: string | null, finalLeave: LeaveRequest[]): { label: string; color: string } {
  if (!taskDate) return { label: 'נמצא', color: 'text-green-700 bg-green-50' }
  const isHome = finalLeave.some(r => r.soldier_id === soldier.id && r.date === taskDate && r.status === 'approved')
  const wasHome = finalLeave.some(r => r.soldier_id === soldier.id && r.date === addDays(taskDate, -1) && r.status === 'approved')
  if (isHome) return { label: 'בית', color: 'text-blue-700 bg-blue-50' }
  if (wasHome && !isHome) return { label: 'חוזר', color: 'text-teal-700 bg-teal-50' }
  return { label: 'נמצא', color: 'text-green-700 bg-green-50' }
}

function statusPriority(label: string) {
  if (label === 'נמצא' || label === 'חוזר') return 0
  if (label === 'יוצא') return 1
  return 2 // בית last
}

export default function SoldierPanel({ soldiers, assignments, tasks, finalLeave, selectedTaskId, onAssigned }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId) ?? null, [tasks, selectedTaskId])
  const taskDate = selectedTask ? isoDate(selectedTask.start_datetime) : null

  const enriched = useMemo(() => soldiers.filter(s => s.is_active).map(s => {
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
        t.end_datetime > selectedTask.start_datetime
      )
    }

    const status = getSoldierStatus(s, taskDate, finalLeave)
    return { soldier: s, taskCount, isAssignedToSelected, restHours, status, isConcurrent }
  }), [soldiers, assignments, tasks, selectedTaskId, selectedTask, taskDate, finalLeave])

  // Sort by relevance: assigned first, then by status, then by task count
  const sorted = useMemo(() => [...enriched].sort((a, b) => {
    if (a.isAssignedToSelected !== b.isAssignedToSelected) return a.isAssignedToSelected ? -1 : 1
    const pA = statusPriority(a.status.label)
    const pB = statusPriority(b.status.label)
    if (pA !== pB) return pA - pB
    return a.taskCount - b.taskCount
  }), [enriched])

  // Split into commanders and soldiers lists (relevant role first in each section)
  const commanderList = useMemo(() =>
    [...sorted].sort((a, b) => {
      // Assigned always first
      if (a.isAssignedToSelected !== b.isAssignedToSelected) return a.isAssignedToSelected ? -1 : 1
      // Commanders before soldiers
      if (a.soldier.is_commander !== b.soldier.is_commander) return a.soldier.is_commander ? -1 : 1
      const pA = statusPriority(a.status.label)
      const pB = statusPriority(b.status.label)
      if (pA !== pB) return pA - pB
      return a.taskCount - b.taskCount
    }),
    [sorted]
  )

  const soldierList = useMemo(() =>
    [...sorted].sort((a, b) => {
      // Assigned always first
      if (a.isAssignedToSelected !== b.isAssignedToSelected) return a.isAssignedToSelected ? -1 : 1
      // Non-commanders before commanders
      if (a.soldier.is_commander !== b.soldier.is_commander) return a.soldier.is_commander ? 1 : -1
      const pA = statusPriority(a.status.label)
      const pB = statusPriority(b.status.label)
      if (pA !== pB) return pA - pB
      return a.taskCount - b.taskCount
    }),
    [sorted]
  )

  const requiresCommander = selectedTask?.requires_commander ?? false

  async function assign(soldierId: string) {
    if (!selectedTaskId || isSubmitting) return
    const already = assignments.some(a => a.task_id === selectedTaskId && a.soldier_id === soldierId)
    if (!already) {
      setIsSubmitting(true)
      try {
        await createAssignment(selectedTaskId, soldierId)
        await onAssigned?.(selectedTaskId, soldierId)
      } catch (err) { console.error(err) }
      finally { setIsSubmitting(false) }
    }
  }

  // Task info summary
  const taskAssigned = selectedTask ? assignments.filter(a => a.task_id === selectedTaskId).length : 0
  const taskRequired = selectedTask?.required_people_count ?? 0
  const commanderAssigned = selectedTask ? assignments.some(a =>
    a.task_id === selectedTaskId &&
    soldiers.find(s => s.id === a.soldier_id)?.is_commander
  ) : false

  function renderSoldierButton(item: typeof sorted[0]) {
    const { soldier, taskCount, isAssignedToSelected, restHours, status, isConcurrent } = item
    const isHome = status.label === 'בית'
    return (
      <button key={soldier.id} type="button"
        onClick={() => !isHome && assign(soldier.id)}
        disabled={!selectedTaskId || isAssignedToSelected || isHome}
        className={`w-full flex flex-col items-stretch gap-0.5 px-2 py-1.5 rounded-lg border transition text-sm ${
          isAssignedToSelected ? 'bg-blue-50 border-blue-300 text-blue-700' :
          isHome ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-default opacity-60' :
          !selectedTaskId ? 'bg-slate-50 border-slate-100 cursor-default' :
          'bg-slate-50 border-slate-200 hover:border-navy hover:bg-white'
        }`}>
        {/* Top: name + primary status */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {soldier.is_commander && <span className="text-navy text-xs shrink-0">★</span>}
            <span className="font-medium truncate text-right">{soldier.full_name}</span>
          </div>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${status.color}`}>
            {status.label}
          </span>
        </div>
        {/* Bottom: secondary info (only when relevant) */}
        {(isConcurrent || (restHours !== null && restHours < 8) || taskCount > 0) && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 justify-end">
            {restHours !== null && restHours < 8 && (
              <span className="text-orange-600 font-semibold">{restHours.toFixed(0)}ש׳</span>
            )}
            {isConcurrent && (
              <span className="font-semibold px-1 py-0.5 rounded-full text-orange-700 bg-orange-50">
                ב.ז
              </span>
            )}
            <span className="text-slate-400">{taskCount}✓</span>
          </div>
        )}
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
        <div className="text-xs font-bold text-slate-400 text-center py-2">בחר משימה לשיבוץ</div>
      )}

      {/* Soldiers list - split into sections when task requires commander */}
      <div className="flex flex-col gap-2 overflow-y-auto flex-1">
        {requiresCommander ? (
          <>
            {/* Commander section */}
            <div>
              <div className="text-[10px] font-bold text-navy uppercase tracking-wide mb-1 px-1 flex items-center gap-1">
                <span>★</span>
                <span>מפקד</span>
                <span className="text-slate-400 normal-case font-normal">— הצג קודם מפקדים</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {commanderList.map(item => renderSoldierButton(item))}
              </div>
            </div>

            <div className="border-t border-slate-200 my-1" />

            {/* Soldier section */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 px-1">
                לוחמים — הצג קודם לוחמים
              </div>
              <div className="grid grid-cols-2 gap-1">
                {soldierList.map(item => renderSoldierButton(item))}
              </div>
            </div>
          </>
        ) : (
          /* Single list when no commander required */
          <div className="grid grid-cols-2 gap-1">
            {soldierList.map(item => renderSoldierButton(item))}
          </div>
        )}
      </div>
    </div>
  )
}
