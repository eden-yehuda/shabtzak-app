import { useMemo } from 'react'
import ScheduleCell from './ScheduleCell'
import type { Task, Assignment, Soldier, LeaveRequest } from '@/types'

interface Props {
  tasks: Task[]
  assignments: Assignment[]
  soldiers: Soldier[]
  finalLeave?: LeaveRequest[]
  currentSoldierId?: string | null
  builderMode?: boolean
  selectedTaskId?: string | null
  onSelectTask?: (taskId: string) => void
  onRemoveSoldier?: (taskId: string, soldierId: string) => void
}

function formatTime(d: Date) {
  return d.toTimeString().slice(0, 5)
}

function formatDate(d: Date) {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function ScheduleGrid({
  tasks, assignments, soldiers, finalLeave = [],
  currentSoldierId, builderMode, selectedTaskId, onSelectTask, onRemoveSoldier,
}: Props) {
  const { days, columns, grid, daySlots } = useMemo(() => {
    if (tasks.length === 0) return { days: [], columns: [], grid: {} as Record<string, Record<string, Record<string, Task | null>>>, daySlots: {} as Record<string, string[]> }

    const colNames = Array.from(new Set(tasks.map(t => t.task_type))).sort()

    const byDay: Record<string, Task[]> = {}
    for (const t of tasks) {
      const key = isoDate(t.start_datetime)
      if (!byDay[key]) byDay[key] = []
      byDay[key].push(t)
    }

    const sortedDays = Object.keys(byDay).sort()

    const daySlots: Record<string, string[]> = {}
    for (const day of sortedDays) {
      const dayTasks = byDay[day]
      const slots = Array.from(new Set(dayTasks.map(t => formatTime(t.start_datetime) + '–' + formatTime(t.end_datetime))))
        .sort()
      daySlots[day] = slots
    }

    const grid: Record<string, Record<string, Record<string, Task | null>>> = {}
    for (const day of sortedDays) {
      const dayTasks = byDay[day]
      grid[day] = {}
      for (const slot of daySlots[day]) {
        grid[day][slot] = {}
        for (const col of colNames) {
          const task = dayTasks.find(t => {
            const tSlot = formatTime(t.start_datetime) + '–' + formatTime(t.end_datetime)
            return tSlot === slot && t.task_type === col
          }) ?? null
          grid[day][slot][col] = task
        }
      }
    }

    return { days: sortedDays, columns: colNames, grid, daySlots }
  }, [tasks])

  const soldierMap = useMemo(() => {
    const m: Record<string, Soldier> = {}
    for (const s of soldiers) m[s.id] = s
    return m
  }, [soldiers])

  function assignedFor(task: Task): Soldier[] {
    return assignments
      .filter(a => a.task_id === task.id)
      .map(a => soldierMap[a.soldier_id])
      .filter(Boolean)
  }

  function helperForDay(dateStr: string) {
    const leaving = finalLeave
      .filter(r => r.date === dateStr && r.status === 'approved')
      .map(r => soldierMap[r.soldier_id]?.full_name)
      .filter(Boolean) as string[]

    const prev = new Date(dateStr + 'T12:00:00')
    prev.setDate(prev.getDate() - 1)
    const prevStr = isoDate(prev)

    const returning = finalLeave
      .filter(r => r.date === prevStr && r.status === 'approved')
      .filter(r => !finalLeave.some(f => f.date === dateStr && f.soldier_id === r.soldier_id && f.status === 'approved'))
      .map(r => soldierMap[r.soldier_id]?.full_name)
      .filter(Boolean) as string[]

    const totalActive = soldiers.filter(s => s.is_active).length
    const present = totalActive - leaving.length
    return { leaving, returning, present }
  }

  const CHANGEOVER = '10:00'

  if (days.length === 0) {
    return <p className="text-slate-400 text-center py-8">אין משימות בשבצ&quot;ק זה</p>
  }

  return (
    <div className="overflow-x-auto">
      {days.map(day => {
        const slots = daySlots[day] ?? []
        const helper = builderMode ? helperForDay(day) : null
        const dayDate = new Date(day + 'T12:00:00')

        return (
          <div key={day} className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-bold text-navy text-base">{formatDate(dayDate)}</h3>
              {helper && (
                <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
                  {helper.leaving.length > 0 && (
                    <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                      יוצאים 10:00: {helper.leaving.join(', ')}
                    </span>
                  )}
                  {helper.returning.length > 0 && (
                    <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                      חוזרים 10:00: {helper.returning.join(', ')}
                    </span>
                  )}
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    נוכחים: {helper.present}
                  </span>
                </div>
              )}
            </div>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-right">
                  <th className="border border-slate-200 px-3 py-2 w-28">שעות</th>
                  {columns.map(col => (
                    <th key={col} className="border border-slate-200 px-3 py-2">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map(slot => {
                  const isChangeover = slot.startsWith(CHANGEOVER)
                  return (
                    <tr
                      key={slot}
                      className={isChangeover && builderMode ? 'bg-yellow-50' : ''}
                    >
                      <td className={`border border-slate-200 px-3 py-2 font-mono text-xs font-semibold ${
                        isChangeover && builderMode ? 'text-yellow-700' : 'text-slate-600'
                      }`}>
                        {slot}
                        {isChangeover && builderMode && <span className="block text-yellow-600 text-xs">⟳ חילוף</span>}
                      </td>
                      {columns.map(col => {
                        const task = grid[day]?.[slot]?.[col] ?? null
                        const assigned = task ? assignedFor(task) : []
                        return (
                          <ScheduleCell
                            key={col}
                            task={task}
                            assigned={assigned}
                            currentSoldierId={currentSoldierId}
                            builderMode={builderMode}
                            isSelected={!!task && task.id === selectedTaskId}
                            onClick={task && onSelectTask ? () => onSelectTask(task.id) : undefined}
                            onRemoveSoldier={task && onRemoveSoldier
                              ? (sid) => onRemoveSoldier(task.id, sid)
                              : undefined}
                          />
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
