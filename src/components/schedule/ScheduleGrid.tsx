import { useMemo, useState, useEffect, useCallback } from 'react'
import type { Task, Assignment, Soldier, LeaveRequest } from '@/types'

interface Props {
  tasks: Task[]
  assignments: Assignment[]
  soldiers: Soldier[]
  finalLeave?: LeaveRequest[]
  currentSoldierId?: string | null
  builderMode?: boolean
  myTasksOnly?: boolean
  selectedTaskId?: string | null
  dayStartHour?: number
  homeLeaveHour?: number  // when soldiers swap (depart/return); defaults to dayStartHour
  onSelectTask?: (taskId: string) => void
  onRemoveSoldier?: (taskId: string, soldierId: string) => void
  onMoveTask?: (taskId: string, hourDelta: number) => void
  onResizeTask?: (taskId: string, endHourDelta: number) => void
  onDeleteTask?: (taskId: string) => void
  onMoveTaskToSlot?: (taskId: string, date: string, hour: number) => void
  onCreateTaskAtSlot?: (date: string, hour: number, taskType: string) => void
  onPairSoldiers?: (taskId: string, soldierIdA: string, soldierIdB: string) => void
  onUnpairSoldier?: (taskId: string, soldierId: string) => void
  onDeleteColumn?: (taskType: string) => void
}

// Visual order right-to-left (RTL)
const COLUMN_ORDER = ['תרג"ד', 'סיור', 'כוננות', 'כ"כ א', 'כ"כ ב', 'כ"כ ג', 'אחורית', 'ש"ג', 'של"ז']

// Colors per column type
const COL_STYLE: Record<string, { headBg: string; headText: string; cardBg: string; cardBorder: string; cardText: string; mineBg: string }> = {
  'תרג"ד':  { headBg: '#8B5E3C', headText: '#fff', cardBg: '#FDF3E7', cardBorder: '#E8C99A', cardText: '#4A2E0A', mineBg: '#6B4220' },
  'סיור':    { headBg: '#3B6E52', headText: '#fff', cardBg: '#E8F5EE', cardBorder: '#A8D5BC', cardText: '#1A3D2A', mineBg: '#2D5540' },
  'כוננות':  { headBg: '#4A5E88', headText: '#fff', cardBg: '#EAF0F8', cardBorder: '#B0C4E4', cardText: '#1A2D50', mineBg: '#38507A' },
  'כ"כ א':  { headBg: '#516B85', headText: '#fff', cardBg: '#EEF2F7', cardBorder: '#C4D3E3', cardText: '#1E3550', mineBg: '#3A5470' },
  'כ"כ ב':  { headBg: '#40787A', headText: '#fff', cardBg: '#EAF4F4', cardBorder: '#B5D5D5', cardText: '#153A3A', mineBg: '#2E6062' },
  'כ"כ ג':  { headBg: '#4A6878', headText: '#fff', cardBg: '#EBF2F6', cardBorder: '#B8CFDA', cardText: '#162535', mineBg: '#365060' },
  'אחורית': { headBg: '#7A6652', headText: '#fff', cardBg: '#F4EFE7', cardBorder: '#D8CBBA', cardText: '#3D2E18', mineBg: '#61503E' },
  'ש"ג':    { headBg: '#4A7A5E', headText: '#fff', cardBg: '#EAF3EE', cardBorder: '#B8D5C5', cardText: '#1A3828', mineBg: '#365E48' },
  'של"ז':   { headBg: '#635E88', headText: '#fff', cardBg: '#EDEAF6', cardBorder: '#C5C0DC', cardText: '#2A2448', mineBg: '#4D4870' },
}
const DEFAULT_COL_STYLE = { headBg: '#556070', headText: '#fff', cardBg: '#EEF0F2', cardBorder: '#C8CDD5', cardText: '#222D38', mineBg: '#3A4755' }

const HOURS_PER_DAY = 24

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

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export default function ScheduleGrid({
  tasks, assignments, soldiers, finalLeave = [],
  currentSoldierId, builderMode, myTasksOnly, selectedTaskId, dayStartHour = 2, homeLeaveHour, onSelectTask, onRemoveSoldier,
  onMoveTask, onResizeTask, onDeleteTask, onMoveTaskToSlot, onCreateTaskAtSlot,
  onPairSoldiers, onUnpairSoldier, onDeleteColumn,
}: Props) {
  const DAY_START_HOUR = dayStartHour
  // HOME_LEAVE_START: when soldiers swap (depart/return). Defaults to DAY_START_HOUR.
  // For שבוע 2: DAY_START_HOUR=2 (military day boundary) but HOME_LEAVE_START=14 (swap time).
  const HOME_LEAVE_START = homeLeaveHour ?? DAY_START_HOUR
  const DAY_HOURS = Array.from({ length: HOURS_PER_DAY }, (_, i) => (i + DAY_START_HOUR) % HOURS_PER_DAY)
  function hourToRowIndex(hour: number): number {
    return (hour - DAY_START_HOUR + HOURS_PER_DAY) % HOURS_PER_DAY
  }
  const HOME_LEAVE_START_ROW = hourToRowIndex(HOME_LEAVE_START)
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(() => new Date())
  const [pairingCandidate, setPairingCandidate] = useState<{ taskId: string; soldierId: string } | null>(null)

  const todayStr = useMemo(() => isoDate(new Date()), [])

  // Military day: if current hour is before DAY_START_HOUR, the "now" belongs to the previous calendar day
  const nowMilitaryDay = useMemo(() => {
    const d = new Date(now)
    if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1)
    return isoDate(d)
  }, [now, DAY_START_HOUR])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(id)
  }, [])

  function toggleDay(day: string) {
    setCollapsedDays(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }
  const { days, allColumns } = useMemo(() => {
    if (tasks.length === 0 && (!myTasksOnly || !currentSoldierId || finalLeave.length === 0)) {
      return { days: [], allColumns: [] }
    }

    const typeSet = new Set(tasks.map(t => t.task_type))
    const cols = COLUMN_ORDER.filter(c => typeSet.has(c))
    typeSet.forEach(c => { if (!cols.includes(c)) cols.push(c) })

    // In soldier-facing view: hide a day only if NO task on that day has any assignments at all.
    // (If at least one task is assigned, show the entire day with all its tasks.)
    let visibleTasks = tasks
    if (!builderMode) {
      const dayHasAnyAssignment: Record<string, boolean> = {}
      for (const t of tasks) {
        const d = isoDate(t.start_datetime)
        if (assignments.some(a => a.task_id === t.id)) dayHasAnyAssignment[d] = true
      }
      visibleTasks = tasks.filter(t => dayHasAnyAssignment[isoDate(t.start_datetime)])
    }

    // In my-tasks mode: also include days the soldier is home (so we can show בית block)
    const taskDays = new Set(visibleTasks.map(t => isoDate(t.start_datetime)))
    if (myTasksOnly && currentSoldierId) {
      finalLeave
        .filter(r => r.soldier_id === currentSoldierId && r.status === 'approved')
        .forEach(r => taskDays.add(r.date))
    }

    const sortedDays = Array.from(taskDays).sort()
    if (sortedDays.length === 0) return { days: [], allColumns: [] }

    // Ensure columns has at least one entry even if all days are home days
    if (cols.length === 0) cols.push(...COLUMN_ORDER)

    return { days: sortedDays, allColumns: cols }
  }, [tasks, assignments, finalLeave, myTasksOnly, currentSoldierId, builderMode])

  // Time line: show only when nowMilitaryDay is actually in the grid.
  // If we're before the schedule starts (e.g. 00:31 on day 1 when schedule starts at 14:00),
  // nowMilitaryDay is yesterday (not in grid) — don't show the line at all.
  const nowLineDay = useMemo(() => {
    return days.includes(nowMilitaryDay) ? nowMilitaryDay : ''
  }, [nowMilitaryDay, days])

  const nowLineHour = useMemo(() => now.getHours(), [now])

  // Auto-collapse past days when day list becomes known
  useEffect(() => {
    setCollapsedDays(prev => {
      const next = new Set(prev)
      for (const day of days) {
        if (day < todayStr) next.add(day)
      }
      return next
    })
  }, [days, todayStr])

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

  type AssignedSoldier = Soldier & { note?: string; alternating_group?: number }

  function assignedFor(task: Task): AssignedSoldier[] {
    const result: AssignedSoldier[] = []
    for (const a of assignments.filter(a => a.task_id === task.id).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))) {
      const s = soldierMap[a.soldier_id]
      if (s) result.push({ ...s, note: a.note, alternating_group: a.alternating_group })
    }
    // If any commander is assigned, commanders always appear first
    const hasCommander = result.some(s => s.is_commander)
    if (hasCommander) {
      result.sort((a, b) => (a.is_commander ? 0 : 1) - (b.is_commander ? 0 : 1))
    }
    return result
  }

  const handlePairToggle = useCallback((taskId: string, soldier: AssignedSoldier) => {
    if (soldier.alternating_group != null) {
      onUnpairSoldier?.(taskId, soldier.id)
      return
    }
    if (!pairingCandidate) {
      setPairingCandidate({ taskId, soldierId: soldier.id })
    } else if (pairingCandidate.taskId === taskId && pairingCandidate.soldierId !== soldier.id) {
      onPairSoldiers?.(taskId, pairingCandidate.soldierId, soldier.id)
      setPairingCandidate(null)
    } else {
      setPairingCandidate(null)
    }
  }, [pairingCandidate, onPairSoldiers, onUnpairSoldier])

  function isHomeDay(dateStr: string, soldierId: string): boolean {
    return finalLeave.some(r => r.date === dateStr && r.soldier_id === soldierId && r.status === 'approved')
  }

  // Returns true if the soldier is still home on this day due to leave from previous day
  // (i.e., soldier left previous day and returns at 10:00 today — rows 02:00–09:00 are "בית")
  function isReturnMorning(dateStr: string, soldierId: string): boolean {
    const prevDay = addDays(dateStr, -1)
    return isHomeDay(prevDay, soldierId) && !isHomeDay(dateStr, soldierId)
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
        const soldierReturning = currentSoldierId ? isReturnMorning(day, currentSoldierId) : false

        // Columns for THIS day only: types that have at least one task starting today
        // or overflowing from previous day
        const prevDayTasksForCols = tasksByDay[addDays(day, -1)] ?? []
        const overflowTypes = new Set(prevDayTasksForCols
          .filter(t => {
            const endDateStr = isoDate(t.end_datetime)
            const endH = t.end_datetime.getHours()
            return endDateStr === day && endH > DAY_START_HOUR
          })
          .map(t => t.task_type)
        )
        const dayTypeSet = new Set([...dayTasks.map(t => t.task_type), ...Array.from(overflowTypes)])
        const columns = allColumns.filter(c => dayTypeSet.has(c))

        // Build per-column task lookup
        // taskAtRow[col][rowIndex] = task that STARTS at that row
        // overflowRowSpan[col][rowIndex] = custom rowspan override for tasks that overflow from prev day
        const taskAtRow: Record<string, Record<number, Task>> = {}
        const covered: Record<string, Set<number>> = {}
        const overflowRowSpan: Record<string, number> = {} // col → rowSpan for row-0 overflow tasks

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

        // Detect tasks from previous day that overflow into this day (end_datetime falls on today after 02:00)
        for (const prevTask of prevDayTasksForCols) {
          const endDateStr = isoDate(prevTask.end_datetime)
          const endH = prevTask.end_datetime.getHours()
          if (endDateStr === day && endH > DAY_START_HOUR) {
            const col = prevTask.task_type
            if (taskAtRow[col] !== undefined && !taskAtRow[col][0]) {
              const rows = endH - DAY_START_HOUR // how many rows (hours) it occupies at start of this day
              taskAtRow[col][0] = prevTask
              overflowRowSpan[col] = rows
              for (let r = 1; r < rows; r++) covered[col].add(r)
            }
          }
        }

        // בית block coverage (my-tasks mode only)
        // soldierHome: rows HOME_LEAVE_START_ROW..23 are "בית"
        // soldierReturning: rows 0..HOME_LEAVE_START_ROW-1 are still "בית"
        const homeRowStart = soldierHome ? HOME_LEAVE_START_ROW : -1
        const returnRowEnd = soldierReturning ? HOME_LEAVE_START_ROW - 1 : -1 // rows 0..returnRowEnd

        const isCollapsed = collapsedDays.has(day)

        return (
          <div key={day} className="mb-8">
            {/* Day header */}
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => toggleDay(day)}
                className="text-slate-400 hover:text-navy text-xs leading-none px-1 py-0.5 rounded hover:bg-slate-100 transition select-none"
                title={isCollapsed ? 'הצג' : 'הסתר'}
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
              <h3 className="font-bold text-navy text-base">{formatDate(dayDate)}</h3>
              {soldierHome && (
                <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-0.5 rounded-full">
                  🏠 בית
                </span>
              )}
              {soldierReturning && !soldierHome && (
                <span className="bg-green-50 text-green-700 text-xs font-semibold px-3 py-0.5 rounded-full">
                  ↩ חוזר {formatHour(HOME_LEAVE_START)}
                </span>
              )}
              {helper && (
                <div className="flex gap-2 text-xs text-slate-500 flex-wrap">
                  {helper.leaving.length > 0 && (
                    <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                      יציאה הביתה ב-{formatHour(HOME_LEAVE_START)}: {helper.leaving.join(', ')}
                    </span>
                  )}
                  {helper.returning.length > 0 && (
                    <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                      חזרה מהבית (עד {formatHour(HOME_LEAVE_START)}): {helper.returning.join(', ')}
                    </span>
                  )}
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    נוכחים: {helper.present}
                  </span>
                </div>
              )}
            </div>

            {!isCollapsed && <table className="w-full border-collapse text-xs table-fixed" dir="rtl">
              <colgroup>
                <col style={{ width: '48px' }} />
                {columns.map(col => (
                  <col key={col} style={{ width: `${100 / columns.length}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-slate-300 bg-slate-700 text-white px-1 py-1.5 text-center text-xs font-bold rounded-tr-sm">שעה</th>
                  {columns.map(col => {
                    const cs = COL_STYLE[col] ?? DEFAULT_COL_STYLE
                    return (
                      <th key={col} className="border border-slate-300 px-1 py-1.5 text-center text-xs font-bold relative" style={{ backgroundColor: cs.headBg, color: cs.headText }}>
                        {col}
                        {builderMode && onDeleteColumn && (
                          <button
                            onClick={() => onDeleteColumn(col)}
                            className="absolute top-0.5 left-0.5 text-[9px] opacity-40 hover:opacity-100"
                            title={`מחק עמודת ${col}`}
                          >
                            ×
                          </button>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Trim leading/trailing empty rows using dayTasks directly
                  let firstOccupiedRow = 0
                  let lastOccupiedRow = HOURS_PER_DAY - 1
                  if (dayTasks.length > 0) {
                    const startRows = dayTasks.map(t => hourToRowIndex(t.start_datetime.getHours()))
                    const endRows = dayTasks.map(t => {
                      const sr = hourToRowIndex(t.start_datetime.getHours())
                      const dur = Math.max(1, Math.round((t.end_datetime.getTime() - t.start_datetime.getTime()) / 3600000))
                      return Math.min(sr + dur - 1, HOURS_PER_DAY - 1)
                    })
                    // If there are overflow tasks from previous day, they occupy row 0 — include it
                    if (overflowTypes.size > 0) startRows.push(0)
                    firstOccupiedRow = Math.min(...startRows)
                    // In builder mode keep bottom open so new tasks can be placed; in view mode trim bottom too
                    if (!builderMode) lastOccupiedRow = Math.min(Math.max(...endRows), HOURS_PER_DAY - 1)
                  }
                  const visibleHours = DAY_HOURS.slice(firstOccupiedRow, lastOccupiedRow + 1)

                  // Track if home block rendered (only once per section)
                  let homeBlockRendered = false
                  let returnBlockRendered = false

                  return visibleHours.map((hour) => {
                    const rowIndex = hourToRowIndex(hour)
                    // בית block: returning morning (rows 0..returnRowEnd)
                    if (myTasksOnly && soldierReturning && rowIndex <= returnRowEnd && !returnBlockRendered) {
                      returnBlockRendered = true
                      const span = returnRowEnd + 1
                      return (
                        <tr key={rowIndex}>
                          <td className="border border-slate-300 px-1 font-mono text-xs font-bold h-8 text-center align-middle bg-slate-700 text-slate-200">
                            {formatHour(hour)}
                          </td>
                          <td
                            colSpan={columns.length}
                            rowSpan={span}
                            className="border border-blue-200 bg-blue-50 text-center align-middle"
                          >
                            <div className="text-blue-700 font-bold text-sm py-1">🏠 בית</div>
                            <div className="text-blue-500 text-xs">{formatHour(DAY_START_HOUR)}–{formatHour(HOME_LEAVE_START)}</div>
                          </td>
                        </tr>
                      )
                    }
                    if (myTasksOnly && soldierReturning && rowIndex <= returnRowEnd) return null

                    // בית block: home day (rows HOME_LEAVE_START_ROW..23)
                    if (myTasksOnly && soldierHome && rowIndex >= homeRowStart && !homeBlockRendered) {
                      homeBlockRendered = true
                      const span = HOURS_PER_DAY - homeRowStart
                      return (
                        <tr key={rowIndex}>
                          <td className="border border-slate-300 px-1 font-mono text-xs font-bold h-8 text-center align-middle bg-slate-700 text-slate-200">
                            {formatHour(hour)}
                          </td>
                          <td
                            colSpan={columns.length}
                            rowSpan={span}
                            className="border border-blue-200 bg-blue-50 text-center align-middle"
                          >
                            <div className="text-blue-700 font-bold text-sm py-1">🏠 בית</div>
                            <div className="text-blue-500 text-xs">{formatHour(HOME_LEAVE_START)}–{formatHour(HOME_LEAVE_START)}</div>
                          </td>
                        </tr>
                      )
                    }
                    if (myTasksOnly && soldierHome && rowIndex >= homeRowStart) return null

                    const isCurrentHour = day === nowLineDay && hour === nowLineHour
                    const nowPct = `${(now.getMinutes() / 60) * 100}%`

                    return (
                      <tr key={rowIndex}>
                        <td className="border border-slate-300 px-1 font-mono text-xs font-bold h-8 text-center align-middle relative bg-slate-700 text-slate-200">
                          {formatHour(hour)}
                          {isCurrentHour && (
                            <div className="absolute left-0 right-0 pointer-events-none z-20" style={{ top: nowPct }}>
                              <div className="border-t-2 border-dashed border-red-400 opacity-50" />
                            </div>
                          )}
                        </td>
                        {columns.map(col => {
                          if (covered[col].has(rowIndex)) return null

                          const task = taskAtRow[col][rowIndex] ?? null

                          if (!task) {
                            // Empty cell — in builder mode:
                            // 1. If a task is selected and same column → click to move
                            // 2. If no task selected and onCreateTaskAtSlot exists → click to create new task in this column
                            const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null
                            const canMoveTo = builderMode && selectedTask && onMoveTaskToSlot && selectedTask.task_type === col
                            const canCreate = builderMode && !selectedTaskId && onCreateTaskAtSlot
                            const handleClick = canMoveTo
                              ? () => onMoveTaskToSlot!(selectedTaskId!, day, hour)
                              : canCreate
                                ? () => onCreateTaskAtSlot!(day, hour, col)
                                : undefined
                            const cursorClass = canMoveTo ? 'cursor-copy hover:bg-sky-50' : canCreate ? 'cursor-cell hover:bg-emerald-50' : ''
                            return (
                              <td
                                key={col}
                                className={`border border-slate-200 bg-slate-100 h-8 relative ${cursorClass}`}
                                onClick={handleClick}
                                title={canCreate ? `יצירת משימה ב-${col} ${formatHour(hour)}` : undefined}
                              >
                                {isCurrentHour && (
                                  <div className="absolute left-0 right-0 pointer-events-none z-20" style={{ top: nowPct }}>
                                    <div className="border-t-2 border-dashed border-red-400 opacity-50" />
                                  </div>
                                )}
                              </td>
                            )
                          }

                          const cs = COL_STYLE[col] ?? DEFAULT_COL_STYLE

                          // Bug fix: overflowRowSpan only applies to the task at rowIndex === 0
                          // (a previous-day task overflowing into this day). For regular tasks,
                          // always compute duration from actual start/end times.
                          const durationHours = (rowIndex === 0 && overflowRowSpan[col] !== undefined)
                            ? overflowRowSpan[col]
                            : Math.max(1, Math.round(
                                (task.end_datetime.getTime() - task.start_datetime.getTime()) / 3600000
                              ))
                          const rowSpan = Math.min(durationHours, HOURS_PER_DAY - rowIndex)
                          const timeLabel = task.time_display ?? `${formatHour(task.start_datetime.getHours())}–${formatHour(task.end_datetime.getHours())}`
                          const assigned = assignedFor(task)

                          // In soldier-facing view: don't filter individual tasks here —
                          // entire days with unassigned tasks are filtered out at the days-list level above

                          const isMine = currentSoldierId ? assigned.some(s => s.id === currentSoldierId) : false
                          const missing = task.required_people_count - assigned.length
                          const commanderMissing = task.requires_commander && !assigned.some(s => s.is_commander)

                          const isMachlaket3 = task.notes === 'מחלקה 3'
                          const isSelected = task.id === selectedTaskId
                          let cardExtraClass = ''
                          let cardStyle: React.CSSProperties = {}
                          if (isMachlaket3) {
                            cardStyle = { backgroundColor: 'rgba(203,213,225,0.35)', borderColor: 'rgba(148,163,184,0.5)', color: '#64748b' }
                          } else if (isSelected) {
                            cardExtraClass = 'bg-sky-100 border-sky-400 ring-2 ring-sky-400'
                          } else if (builderMode && commanderMissing) {
                            cardExtraClass = 'bg-red-100 border-red-400 text-red-900'
                          } else if (builderMode && missing > 0) {
                            cardExtraClass = 'bg-orange-100 border-orange-400 text-orange-900'
                          } else if (isMine) {
                            cardStyle = { backgroundColor: cs.mineBg, borderColor: cs.mineBg, color: '#fff' }
                          } else {
                            cardStyle = { backgroundColor: cs.cardBg, borderColor: cs.cardBorder, color: cs.cardText }
                          }

                          // Time indicator within task cell (current time may fall anywhere in the rowSpan)
                          const nowRowIndex = day === nowLineDay ? hourToRowIndex(nowLineHour) : -1
                          const nowInTask = nowRowIndex >= rowIndex && nowRowIndex < rowIndex + rowSpan
                          const taskNowPct = nowInTask
                            ? `${((nowRowIndex - rowIndex + now.getMinutes() / 60) / rowSpan) * 100}%`
                            : null

                          // Edit buttons — shown inside the selected card in builderMode
                          const showEditBar = builderMode && isSelected && (onMoveTask || onResizeTask || onDeleteTask)

                          return (
                            <td
                              key={col}
                              rowSpan={rowSpan}
                              className={`border border-slate-200 p-1 align-top h-8 relative ${onSelectTask ? 'cursor-pointer' : ''}`}
                              onClick={onSelectTask ? () => onSelectTask(task.id) : undefined}
                            >
                              {taskNowPct && (
                                <div className="absolute left-0 right-0 pointer-events-none z-20" style={{ top: taskNowPct }}>
                                  <div className="border-t-2 border-dashed border-red-400 opacity-50" />
                                </div>
                              )}
                              <div
                                className={`rounded-md border shadow-sm px-1.5 py-1 text-center h-full min-h-[28px] flex flex-col justify-center transition ${cardExtraClass}`}
                                style={cardStyle}
                              >
                                <div className="space-y-0.5">
                                  <div className="text-[9px] mb-0.5 opacity-60" dir="ltr">{timeLabel}</div>
                                  {isMachlaket3 ? (
                                    <div className="text-xs font-semibold text-slate-500">מחלקה 3</div>
                                  ) : (
                                    <>
                                      {(() => {
                                        // Group alternating soldiers into display rows
                                        const rows: AssignedSoldier[][] = []
                                        const seen = new Set<string>()
                                        for (const s of assigned) {
                                          if (seen.has(s.id)) continue
                                          seen.add(s.id)
                                          if (s.alternating_group != null) {
                                            const partners = assigned.filter(
                                              p => p.id !== s.id && p.alternating_group === s.alternating_group && !seen.has(p.id)
                                            )
                                            for (const p of partners) seen.add(p.id)
                                            rows.push([s, ...partners])
                                          } else {
                                            rows.push([s])
                                          }
                                        }
                                        return rows.map((row, rowIdx) => (
                                          <div
                                            key={row[0].id}
                                            className={`text-xs leading-snug flex items-center justify-center flex-wrap gap-x-0.5 ${rowIdx === 0 ? 'font-bold' : ''}`}
                                          >
                                            {row.map((s, si) => (
                                              <span key={s.id} className="flex items-center gap-0.5">
                                                {si > 0 && <span className="opacity-40 font-normal">/</span>}
                                                <span>{s.full_name}</span>
                                                {s.note && (
                                                  <span
                                                    title={s.note}
                                                    className="inline-flex items-center text-[9px] font-semibold px-1 py-0 rounded cursor-default select-none bg-white/40"
                                                  >
                                                    {s.note}
                                                  </span>
                                                )}
                                              </span>
                                            ))}
                                            {builderMode && onRemoveSoldier && (
                                              <button
                                                onClick={e => { e.stopPropagation(); onRemoveSoldier(task.id, row[0].id) }}
                                                className="opacity-40 hover:opacity-100 hover:text-red-500 leading-none"
                                              >
                                                ×
                                              </button>
                                            )}
                                          </div>
                                        ))
                                      })()}
                                      {task.notes && task.notes !== 'מחלקה 3' && (
                                        <div className="text-[10px] font-semibold mt-0.5 border-t border-current/20 pt-0.5">{task.notes}</div>
                                      )}
                                      {builderMode && missing > 0 && (
                                        <div className="text-orange-600 font-semibold text-[10px]">לא שובץ</div>
                                      )}
                                      {builderMode && commanderMissing && (
                                        <div className="text-red-600 font-semibold">★?</div>
                                      )}
                                    </>
                                  )}
                                </div>

                                {/* Edit action bar — visible only when task is selected in builder mode */}
                                {showEditBar && (
                                  <div
                                    className="flex gap-0.5 justify-center mt-1 pt-1 border-t border-sky-200 flex-wrap"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {onMoveTask && (
                                      <>
                                        <button
                                          title="הזז שעה אחת קודם"
                                          onClick={() => onMoveTask(task.id, -1)}
                                          className="text-[10px] bg-white/80 border border-sky-200 rounded px-1 py-0.5 hover:bg-sky-50 text-sky-800"
                                        >↑−1ש</button>
                                        <button
                                          title="הזז שעה אחת קדימה"
                                          onClick={() => onMoveTask(task.id, 1)}
                                          className="text-[10px] bg-white/80 border border-sky-200 rounded px-1 py-0.5 hover:bg-sky-50 text-sky-800"
                                        >↓+1ש</button>
                                      </>
                                    )}
                                    {onResizeTask && (
                                      <>
                                        <button
                                          title="קצר סיום שעה אחת"
                                          onClick={() => onResizeTask(task.id, -1)}
                                          className="text-[10px] bg-white/80 border border-slate-200 rounded px-1 py-0.5 hover:bg-slate-50 text-slate-700"
                                        >◀−1</button>
                                        <button
                                          title="האריך סיום שעה אחת"
                                          onClick={() => onResizeTask(task.id, 1)}
                                          className="text-[10px] bg-white/80 border border-slate-200 rounded px-1 py-0.5 hover:bg-slate-50 text-slate-700"
                                        >▶+1</button>
                                      </>
                                    )}
                                    {onDeleteTask && (
                                      <button
                                        title="מחק משימה"
                                        onClick={() => {
                                          if (confirm('למחוק את המשימה ואת כל השיבוצים שלה?')) {
                                            onDeleteTask(task.id)
                                          }
                                        }}
                                        className="text-[10px] bg-red-50 border border-red-200 rounded px-1 py-0.5 hover:bg-red-100 text-red-600"
                                      >🗑 מחק</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>}
          </div>
        )
      })}
    </div>
  )
}
