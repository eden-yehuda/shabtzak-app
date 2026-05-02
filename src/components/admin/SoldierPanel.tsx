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
  onAssigned?: () => void
}

type StatusFilter = 'all' | 'present' | 'home' | 'returning' | 'leaving'

function isoDate(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

function getSoldierStatus(
  soldier: Soldier,
  taskDate: string | null,
  finalLeave: LeaveRequest[]
): { label: string; color: string } {
  if (!taskDate) return { label: 'נמצא', color: 'text-green-700 bg-green-50' }

  const isHome = finalLeave.some(r => r.soldier_id === soldier.id && r.date === taskDate && r.status === 'approved')
  const wasHome = finalLeave.some(r => r.soldier_id === soldier.id && r.date === addDays(taskDate, -1) && r.status === 'approved')
  const willLeave = finalLeave.some(r => r.soldier_id === soldier.id && r.date === taskDate && r.status === 'approved')

  if (isHome) return { label: 'בית', color: 'text-blue-700 bg-blue-50' }
  if (wasHome && !isHome) return { label: 'חוזר', color: 'text-teal-700 bg-teal-50' }
  if (willLeave) return { label: 'יוצא', color: 'text-amber-700 bg-amber-50' }
  return { label: 'נמצא', color: 'text-green-700 bg-green-50' }
}

export default function SoldierPanel({ soldiers, assignments, tasks, finalLeave, selectedTaskId, onAssigned }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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

    const status = getSoldierStatus(s, taskDate, finalLeave)
    return { soldier: s, taskCount, isAssignedToSelected, restHours, status }
  }), [soldiers, assignments, tasks, selectedTaskId, selectedTask, taskDate, finalLeave])

  const statusPriority = (label: string) => {
    if (label === 'נמצא' || label === 'חוזר') return 0
    if (label === 'יוצא') return 1
    return 2 // בית last
  }

  const filtered = useMemo(() => {
    let base = enriched
    if (statusFilter !== 'all') {
      base = enriched.filter(e => {
        if (statusFilter === 'present') return e.status.label === 'נמצא'
        if (statusFilter === 'home') return e.status.label === 'בית'
        if (statusFilter === 'returning') return e.status.label === 'חוזר'
        if (statusFilter === 'leaving') return e.status.label === 'יוצא'
        return true
      })
    }
    return [...base].sort((a, b) => {
      // 1. Assigned to selected task → always first
      if (a.isAssignedToSelected !== b.isAssignedToSelected)
        return a.isAssignedToSelected ? -1 : 1
      // 2. Present/returning before leaving before home
      const pA = statusPriority(a.status.label)
      const pB = statusPriority(b.status.label)
      if (pA !== pB) return pA - pB
      // 3. Fewest tasks → more available
      return a.taskCount - b.taskCount
    })
  }, [enriched, statusFilter])

  async function assign(soldierId: string) {
    if (!selectedTaskId || isSubmitting) return
    const already = assignments.some(a => a.task_id === selectedTaskId && a.soldier_id === soldierId)
    if (!already) {
      setIsSubmitting(true)
      try {
        await createAssignment(selectedTaskId, soldierId)
        onAssigned?.()
      }
      catch (err) { console.error(err) }
      finally { setIsSubmitting(false) }
    }
  }

  const statusOptions: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'כולם' },
    { key: 'present', label: 'נמצא' },
    { key: 'returning', label: 'חוזר' },
    { key: 'leaving', label: 'יוצא' },
    { key: 'home', label: 'בית' },
  ]

  return (
    <div className="bg-white rounded-xl shadow p-3 flex flex-col gap-2 max-h-[calc(100vh-5rem)] overflow-hidden" dir="rtl">
      <div className="text-xs font-bold text-slate-500">
        {selectedTaskId ? 'לחץ לשיבוץ' : 'בחר משימה לשיבוץ'}
      </div>

      {/* Status filter */}
      <div className="flex gap-1 flex-wrap">
        {statusOptions.map(o => (
          <button key={o.key} onClick={() => setStatusFilter(o.key)}
            className={`px-2 py-0.5 rounded-full text-xs font-semibold transition ${
              statusFilter === o.key ? 'bg-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="space-y-1 overflow-y-auto flex-1">
        {filtered.map(({ soldier, taskCount, isAssignedToSelected, restHours, status }) => {
          const isHome = status.label === 'בית'
          return (
            <button key={soldier.id} type="button"
              onClick={() => !isHome && assign(soldier.id)}
              disabled={!selectedTaskId || isAssignedToSelected || isHome}
              className={`w-full flex justify-between items-center px-2.5 py-2 rounded-lg border transition text-sm ${
                isAssignedToSelected ? 'bg-blue-50 border-blue-300 text-blue-700' :
                isHome ? 'bg-slate-50 border-slate-100 text-slate-400 cursor-default opacity-60' :
                !selectedTaskId ? 'bg-slate-50 border-slate-100 cursor-default' :
                'bg-slate-50 border-slate-200 hover:border-navy hover:bg-white'
              }`}>
              <div className="flex items-center gap-1.5 min-w-0">
                {soldier.is_commander && <span className="text-navy text-xs">★</span>}
                <span className="font-medium truncate">{soldier.full_name}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {restHours !== null && restHours < 8 && (
                  <span className="text-[10px] text-orange-600 font-semibold">{restHours.toFixed(0)}ש׳</span>
                )}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${status.color}`}>
                  {status.label}
                </span>
                <span className="text-[10px] text-slate-400">{taskCount}✓</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
