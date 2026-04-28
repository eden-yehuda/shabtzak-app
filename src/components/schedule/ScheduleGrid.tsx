import { useMemo } from 'react'
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

// Military day starts at 02:00
const DAY_START_HOUR = 2
const HOURS_PER_DAY = 24
const DAY_HOURS = Array.from({ length: HOURS_PER_DAY }, (_, i) => (i + DAY_START_HOUR) % HOURS_PER_DAY)

function hourToRowIndex(hour: number): number {
  return (hour - DAY_START_HOUR + HOURS_PER_DAY) % HOURS_PER_DAY
}

function formatHour(h: number): string {
  return String(h).padStart(2, '0') + ':00'
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
  const { days, columns } = useMemo(() => {
    if (tasks.length === 0) return { days: [], columns: [] }
    const colNames = Array.from(new Set(tasks.map(t => t.task_type))).sort()
    const sortedDays = Array.from(new Set(tasks.map(t => isoDate(t.start_datetime)))).sort()
    return { days: sortedDays, columns: colNames }
  }, [tasks])

  const soldierMap = useMemo(() => {
    const m: Record<string, Soldier> = {}
    for (const s of soldiers) m[s.id] = s
    return m
  }, [soldiers])

  const tasksByDay = useMemo(() => {
    const m: Record<string, Task[]> = {}
    for (const t of tasks) {
      const key = isoDate(t.start_datetime)
      if (!m[key]) m[key] = []
      m[key].push(t)
    }
    return m
  }, [tasks])

  function assignedFor(task: Task): Soldier[] {
    return assignments
      .filter(a => a.task_id === task.id)
      .map(a => soldierMap[a.soldier_id])
      .filter((s): s is Soldier => !!s)
  }

  function helperForDay(dateStr: string) {
    const leaving = finalLeave
      .filter(r => r.date === dateStr && r.status === 'approved')
      .map(r => soldierMap[r.soldier_id]?.full_name)
      .filter((n): n is string => !!n)

    const prev = new Date(dateStr + 'T12:00:00')
    prev.setDate(prev.getDate() - 1)
    const prevStr = isoDate(prev)

    const returning = finalLeave
      .filter(r => r.date === prevStr && r.status === 'approved')
      .filter(r => !finalLeave.some(f => f.date === dateStr && f.soldier_id === r.soldier_id && f.status === 'approved'))
      .map(r => soldierMap[r.soldier_id]?.full_name)
      .filter((n): n is string => !!n)

    const totalActive = soldiers.filter(s => s.is_active).length
    const present = totalActive - leaving.length
    return { leaving, returning, present }
  }

  if (days.length === 0) {
    return <p className="text-slate-400 text-center py-8">אין משימות בשבצ&quot;ק זה</p>
  }

  return (
    <div className="overflow-x-auto">
      {days.map(day => {
        const dayTasks = tasksByDay[day] ?? []
        const helper = builderMode ? helperForDay(day) : null
        const dayDate = new Date(day + 'T12:00:00')

        // For each column: map rowIndex → task, and track covered rows
        const taskAtRow: Record<string, Record<number, Task>> = {}
        const covered: Record<string, Set<number>> = {}

        for (const col of columns) {
          taskAtRow[col] = {}
          covered[col] = new Set()
          for (const task of dayTasks.filter(t => t.task_type === col)) {
            const rowStart = hourToRowIndex(task.start_datetime.getHours())
            const durationHours = Math.max(1, Math.round(
              (task.end_datetime.getTime() - task.start_datetime.getTime()) / 3600000
            ))
            taskAtRow[col][rowStart] = task
            for (let r = rowStart + 1; r < Math.min(rowStart + durationHours, HOURS_PER_DAY); r++) {
              covered[col].add(r)
            }
          }
        }

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

            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-right">
                  <th className="border border-slate-200 px-2 py-1 w-14 text-xs">שעה</th>
                  {columns.map(col => (
                    <th key={col} className="border border-slate-200 px-2 py-1 text-xs">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAY_HOURS.map((hour, rowIndex) => {
                  const isChangeover = hour === 10 && builderMode
                  return (
                    <tr key={rowIndex} className={isChangeover ? 'bg-yellow-50' : ''}>
                      <td className={`border border-slate-200 px-2 font-mono text-xs font-semibold h-7 leading-none align-middle ${
                        isChangeover ? 'text-yellow-700' : 'text-slate-400'
                      }`}>
                        {formatHour(hour)}
                        {isChangeover && <span className="block text-yellow-600" style={{ fontSize: '9px' }}>⟳ חילוף</span>}
                      </td>
                      {columns.map(col => {
                        if (covered[col].has(rowIndex)) return null

                        const task = taskAtRow[col][rowIndex] ?? null

                        if (!task) {
                          return <td key={col} className="border border-slate-100 bg-slate-50 h-7" />
                        }

                        const durationHours = Math.max(1, Math.round(
                          (task.end_datetime.getTime() - task.start_datetime.getTime()) / 3600000
                        ))
                        const rowSpan = Math.min(durationHours, HOURS_PER_DAY - rowIndex)
                        const assigned = assignedFor(task)
                        const isMine = currentSoldierId ? assigned.some(s => s.id === currentSoldierId) : false
                        const missing = task.required_people_count - assigned.length
                        const commanderMissing = task.requires_commander && !assigned.some(s => s.is_commander)

                        return (
                          <td
                            key={col}
                            rowSpan={rowSpan}
                            className={`border border-slate-200 px-2 py-1 align-top transition ${
                              onSelectTask ? 'cursor-pointer' : ''
                            } ${
                              task.id === selectedTaskId ? 'bg-blue-50 ring-2 ring-navy ring-inset' :
                              isMine ? 'bg-navy text-white' :
                              commanderMissing ? 'bg-red-50' :
                              missing > 0 ? 'bg-orange-50' :
                              'bg-white'
                            }`}
                            onClick={onSelectTask ? () => onSelectTask(task.id) : undefined}
                          >
                            <div className="space-y-0.5">
                              {assigned.map(s => (
                                <div
                                  key={s.id}
                                  className={`text-xs leading-snug ${s.is_commander ? 'font-bold' : ''}`}
                                >
                                  {s.full_name}
                                  {builderMode && onRemoveSoldier && (
                                    <button
                                      onClick={e => { e.stopPropagation(); onRemoveSoldier(task.id, s.id) }}
                                      className="mr-1 text-slate-300 hover:text-red-500 leading-none"
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              ))}
                              {missing > 0 && (
                                <div className="text-orange-600 font-semibold">−{missing}</div>
                              )}
                              {commanderMissing && (
                                <div className="text-red-600 font-semibold">★?</div>
                              )}
                            </div>
                          </td>
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
