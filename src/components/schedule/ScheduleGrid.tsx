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

// Visual order right-to-left (RTL): כ"כ א → כ"כ ב → אחורית → ש"ג → של"ז
const COLUMN_ORDER = ['כ"כ א', 'כ"כ ב', 'אחורית', 'ש"ג', 'של"ז']

// Military day: 02:00–01:59 (24 rows starting at 02:00)
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
  // Use local date (Israel timezone) — NOT UTC — to avoid midnight-crossover bugs
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

export default function ScheduleGrid({
  tasks, assignments, soldiers, finalLeave = [],
  currentSoldierId, builderMode, selectedTaskId, onSelectTask, onRemoveSoldier,
}: Props) {
  const { days, columns } = useMemo(() => {
    if (tasks.length === 0) return { days: [], columns: [] }

    // Collect all unique task types, sorted by the fixed Excel column order
    const typeSet = new Set(tasks.map(t => t.task_type))
    const cols = COLUMN_ORDER.filter(c => typeSet.has(c))
    // Append any unknown types at the end
    typeSet.forEach(c => { if (!cols.includes(c)) cols.push(c) })

    const sortedDays = Array.from(new Set(tasks.map(t => isoDate(t.start_datetime)))).sort()
    return { days: sortedDays, columns: cols }
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

  // Returns soldiers sorted by their assignment order (index 0 = task commander)
  function assignedFor(task: Task): Soldier[] {
    return assignments
      .filter(a => a.task_id === task.id)
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      .map(a => soldierMap[a.soldier_id])
      .filter((s): s is Soldier => !!s)
  }

  function isHomeDay(dateStr: string, soldierId: string): boolean {
    return finalLeave.some(r => r.date === dateStr && r.soldier_id === soldierId && r.status === 'approved')
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
    <div className="overflow-x-auto" dir="rtl">
      {days.map(day => {
        const dayTasks = tasksByDay[day] ?? []
        const helper = builderMode ? helperForDay(day) : null
        const dayDate = new Date(day + 'T12:00:00')
        const soldierHome = currentSoldierId ? isHomeDay(day, currentSoldierId) : false

        // Build per-column lookup: rowIndex → task, covered rows set
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
            {/* Day header */}
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-bold text-navy text-base">{formatDate(dayDate)}</h3>
              {soldierHome && (
                <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-0.5 rounded-full">
                  🏠 בית
                </span>
              )}
              {helper && (
                <div className="flex gap-2 text-xs text-slate-500 flex-wrap">
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

            <table className="w-full border-collapse text-xs table-fixed" dir="rtl">
              <colgroup>
                <col style={{ width: '52px' }} />
                {columns.map(col => (
                  <col key={col} style={{ width: `${100 / columns.length}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-1 py-1 text-center text-xs font-semibold">שעה</th>
                  {columns.map(col => (
                    <th key={col} className="border border-slate-200 px-1 py-1 text-center text-xs font-semibold">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAY_HOURS.map((hour, rowIndex) => {
                  const isChangeover = hour === 10 && builderMode
                  return (
                    <tr key={rowIndex} className={isChangeover ? 'bg-yellow-50' : ''}>
                      <td className={`border border-slate-200 px-1 font-mono text-xs font-semibold h-7 text-center align-middle ${
                        isChangeover ? 'text-yellow-700' : 'text-slate-400'
                      }`}>
                        {formatHour(hour)}
                        {isChangeover && (
                          <span className="block text-yellow-600" style={{ fontSize: '9px' }}>⟳ חילוף</span>
                        )}
                      </td>
                      {columns.map(col => {
                        if (covered[col].has(rowIndex)) return null

                        const task = taskAtRow[col][rowIndex] ?? null

                        if (!task) {
                          return (
                            <td key={col} className="border border-slate-100 bg-slate-50 h-7" />
                          )
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
                            className={`border border-slate-200 px-2 py-1 text-center align-middle transition ${
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
                              {assigned.map((s, idx) => (
                                <div
                                  key={s.id}
                                  className={`text-xs leading-snug ${idx === 0 ? 'font-bold' : ''} ${isMine ? 'text-white' : 'text-slate-800'}`}
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
