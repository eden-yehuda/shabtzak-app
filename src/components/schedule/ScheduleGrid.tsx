import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
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
  showAllDays?: boolean   // when true, skip the 4-day rolling window in soldier-facing view
  onSelectTask?: (taskId: string) => void
  onRemoveSoldier?: (taskId: string, soldierId: string) => void
  onEditAssignmentNote?: (taskId: string, soldierId: string, currentNote: string) => void
  onToggleActingCommander?: (taskId: string, soldierId: string, makeCommander: boolean) => void
  onMoveTask?: (taskId: string, hourDelta: number) => void
  onResizeTask?: (taskId: string, endHourDelta: number) => void
  onResizeTaskStart?: (taskId: string, startHourDelta: number) => void
  onDeleteTask?: (taskId: string) => void
  onMoveTaskToSlot?: (taskId: string, date: string, hour: number) => void
  onCreateTaskAtSlot?: (date: string, hour: number, taskType: string) => void
  onPairSoldiers?: (taskId: string, soldierIdA: string, soldierIdB: string) => void
  onUnpairSoldier?: (taskId: string, soldierId: string) => void
  onDeleteColumn?: (taskType: string) => void
  onEditColumn?: (taskType: string) => void
  columnOrder?: string[]                          // custom column order (set by user drag)
  onReorderColumns?: (newOrder: string[]) => void // fires when user drags columns
  minDate?: string                                // hide days before this YYYY-MM-DD (tasks still overflow into first day)
  taskErrors?: Record<string, string[]>   // task_id → error messages (builderMode red marking)
}

// Visual order right-to-left (RTL)
const COLUMN_ORDER = ['כ"כ א', 'כ"כ ב', 'כ"כ ג', 'סיור', 'תרג"ד', 'בלת"מ', 'כוננות', 'אחורית', 'ש"ג', 'של"ז', 'תורן רס"פ', 'תורן מטבח']

// Colors per column type
const COL_STYLE: Record<string, { headBg: string; headText: string; cardBg: string; cardBorder: string; cardText: string; mineBg: string }> = {
  'תרג"ד':    { headBg: '#8B5E3C', headText: '#fff', cardBg: '#FDF3E7', cardBorder: '#E8C99A', cardText: '#4A2E0A', mineBg: '#6B4220' },
  'סיור':      { headBg: '#3B6E52', headText: '#fff', cardBg: '#E8F5EE', cardBorder: '#A8D5BC', cardText: '#1A3D2A', mineBg: '#2D5540' },
  'כוננות':    { headBg: '#4A5E88', headText: '#fff', cardBg: '#EAF0F8', cardBorder: '#B0C4E4', cardText: '#1A2D50', mineBg: '#38507A' },
  'כ"כ א':    { headBg: '#516B85', headText: '#fff', cardBg: '#EEF2F7', cardBorder: '#C4D3E3', cardText: '#1E3550', mineBg: '#3A5470' },
  'כ"כ ב':    { headBg: '#40787A', headText: '#fff', cardBg: '#EAF4F4', cardBorder: '#B5D5D5', cardText: '#153A3A', mineBg: '#2E6062' },
  'כ"כ ג':    { headBg: '#4A6878', headText: '#fff', cardBg: '#EBF2F6', cardBorder: '#B8CFDA', cardText: '#162535', mineBg: '#365060' },
  'בלת"מ':    { headBg: '#4A6878', headText: '#fff', cardBg: '#EBF2F6', cardBorder: '#B8CFDA', cardText: '#162535', mineBg: '#365060' },
  'אחורית':   { headBg: '#7A6652', headText: '#fff', cardBg: '#F4EFE7', cardBorder: '#D8CBBA', cardText: '#3D2E18', mineBg: '#61503E' },
  'ש"ג':      { headBg: '#4A7A5E', headText: '#fff', cardBg: '#EAF3EE', cardBorder: '#B8D5C5', cardText: '#1A3828', mineBg: '#365E48' },
  'של"ז':     { headBg: '#635E88', headText: '#fff', cardBg: '#EDEAF6', cardBorder: '#C5C0DC', cardText: '#2A2448', mineBg: '#4D4870' },
  'תורן רס"פ': { headBg: '#A85D5D', headText: '#fff', cardBg: '#F8E9E9', cardBorder: '#E0B5B5', cardText: '#4D1F1F', mineBg: '#7A3F3F' },
  'תורן מטבח': { headBg: '#6B7A40', headText: '#fff', cardBg: '#F0F4E4', cardBorder: '#C8D5A0', cardText: '#2E3518', mineBg: '#505D28' },
}
const DEFAULT_COL_STYLE = { headBg: '#556070', headText: '#fff', cardBg: '#EEF0F2', cardBorder: '#C8CDD5', cardText: '#222D38', mineBg: '#3A4755' }

const HOURS_PER_DAY = 24

function formatHour(h: number): string {
  return String(h).padStart(2, '0') + ':00'
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
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

// Military date: if the task starts before dayStartHour it belongs to the PREVIOUS military day.
// e.g. with day_start_hour=6, a 02:00 task belongs to the previous day's column.
function militaryDate(d: Date, dayStartHour: number): string {
  if (d.getHours() < dayStartHour) {
    const prev = new Date(d)
    prev.setDate(prev.getDate() - 1)
    return isoDate(prev)
  }
  return isoDate(d)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export default function ScheduleGrid({
  tasks, assignments, soldiers, finalLeave = [],
  currentSoldierId, builderMode, myTasksOnly, selectedTaskId, dayStartHour = 2, homeLeaveHour, showAllDays, onSelectTask, onRemoveSoldier, onEditAssignmentNote, onToggleActingCommander,
  onMoveTask, onResizeTask, onResizeTaskStart, onDeleteTask, onMoveTaskToSlot, onCreateTaskAtSlot,
  onPairSoldiers, onUnpairSoldier, onDeleteColumn, onEditColumn, columnOrder, onReorderColumns, minDate, taskErrors,
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

  // Column drag-to-reorder state (builder mode only)
  const [dragColType, setDragColType] = useState<string | null>(null)
  const [dragOverColType, setDragOverColType] = useState<string | null>(null)
  const [openColMenu, setOpenColMenu] = useState<string | null>(null)

  function handleColDrop(dropOnCol: string) {
    if (!dragColType || dragColType === dropOnCol) { setDragColType(null); setDragOverColType(null); return }
    const newOrder = [...allColumns]
    const fromIdx = newOrder.indexOf(dragColType)
    const toIdx   = newOrder.indexOf(dropOnCol)
    if (fromIdx === -1 || toIdx === -1) return
    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, dragColType)
    onReorderColumns?.(newOrder)
    setDragColType(null)
    setDragOverColType(null)
  }

  // Drag-to-resize. Row height = 32px (h-8). Snap to 0.5h → 16px per snap unit.
  const ROW_HEIGHT_PX = 32
  const SNAP_PX = ROW_HEIGHT_PX / 2 // 16px = half hour
  const DRAG_THRESHOLD_PX = 6      // min movement to distinguish drag from click

  // Resize drag (end-time handle)
  const [drag, setDrag] = useState<{
    taskId: string
    startY: number
    deltaHalfHours: number  // in 0.5h units (1 = 30 min, 2 = 60 min)
  } | null>(null)

  // Move drag (card body)
  const [moveDrag, setMoveDrag] = useState<{
    taskId: string
    startY: number
    deltaHalfHours: number
    isDragging: boolean
  } | null>(null)

  // Prevent td's onClick from firing when a drag just completed
  const dragOccurredRef = useRef(false)

  useEffect(() => {
    if (!drag) return
    function onMove(ev: MouseEvent | TouchEvent) {
      if (!drag) return
      const clientY = 'touches' in ev ? ev.touches[0]?.clientY ?? drag.startY : ev.clientY
      const dy = clientY - drag.startY
      const delta = Math.round(dy / SNAP_PX)
      if (delta !== drag.deltaHalfHours) {
        setDrag({ ...drag, deltaHalfHours: delta })
      }
    }
    function onUp() {
      if (!drag) return
      const { taskId, deltaHalfHours } = drag
      setDrag(null)
      if (deltaHalfHours === 0 || !onResizeTask) return
      onResizeTask(taskId, deltaHalfHours * 0.5) // pass hours (e.g. 0.5, -1, 1.5)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [drag, onResizeTask, SNAP_PX])

  useEffect(() => {
    if (!moveDrag) return
    function onMove(ev: MouseEvent | TouchEvent) {
      if (!moveDrag) return
      const clientY = 'touches' in ev ? ev.touches[0]?.clientY ?? moveDrag.startY : ev.clientY
      const dy = clientY - moveDrag.startY
      const delta = Math.round(dy / SNAP_PX)
      const isDragging = moveDrag.isDragging || Math.abs(dy) > DRAG_THRESHOLD_PX
      if (delta !== moveDrag.deltaHalfHours || isDragging !== moveDrag.isDragging) {
        setMoveDrag({ ...moveDrag, deltaHalfHours: delta, isDragging })
      }
    }
    function onUp() {
      if (!moveDrag) return
      const { taskId, deltaHalfHours, isDragging } = moveDrag
      setMoveDrag(null)
      if (isDragging) {
        if (deltaHalfHours !== 0 && onMoveTask) {
          dragOccurredRef.current = true
          onMoveTask(taskId, deltaHalfHours * 0.5)
        }
        // Even if delta=0 (no net movement), mark as drag so click doesn't double-fire
        if (isDragging) dragOccurredRef.current = true
      }
      // If !isDragging: it was a plain click — let the td onClick handle selection naturally
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [moveDrag, onMoveTask, SNAP_PX, DRAG_THRESHOLD_PX])

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
    const orderList = columnOrder ?? COLUMN_ORDER
    const cols = orderList.filter(c => typeSet.has(c))
    typeSet.forEach(c => { if (!cols.includes(c)) cols.push(c) })

    // In soldier-facing view: hide a day only if NO task on that day has any assignments at all.
    // (If at least one task is assigned, show the entire day with all its tasks.)
    let visibleTasks = tasks
    if (!builderMode) {
      const dayHasAnyAssignment: Record<string, boolean> = {}
      for (const t of tasks) {
        const d = militaryDate(t.start_datetime, dayStartHour)
        if (assignments.some(a => a.task_id === t.id)) dayHasAnyAssignment[d] = true
      }
      visibleTasks = tasks.filter(t => dayHasAnyAssignment[militaryDate(t.start_datetime, dayStartHour)])
    }

    // In my-tasks mode: also include days the soldier is home (so we can show בית block)
    const taskDays = new Set(visibleTasks.map(t => militaryDate(t.start_datetime, dayStartHour)))
    if (myTasksOnly && currentSoldierId) {
      finalLeave
        .filter(r => r.soldier_id === currentSoldierId && r.status === 'approved')
        .forEach(r => taskDays.add(r.date))
    }

    let sortedDays = Array.from(taskDays).sort()

    // Hide days before minDate (tasks starting before minDate still overflow into the first visible day)
    if (minDate) sortedDays = sortedDays.filter(d => d >= minDate)

    // Soldier-facing view: only show today and the next 3 calendar days (4-day window).
    // Skipped when showAllDays is true (admin "view full" mode) or in builderMode.
    if (!builderMode && !showAllDays && sortedDays.length > 0) {
      const today = isoDate(new Date())
      const horizon = (() => {
        const d = new Date()
        d.setDate(d.getDate() + 3)
        return isoDate(d)
      })()
      sortedDays = sortedDays.filter(d => d >= today && d <= horizon)
    }

    if (sortedDays.length === 0) return { days: [], allColumns: [] }

    // Ensure columns has at least one entry even if all days are home days
    if (cols.length === 0) cols.push(...COLUMN_ORDER)

    return { days: sortedDays, allColumns: cols }
  }, [tasks, assignments, finalLeave, myTasksOnly, currentSoldierId, builderMode, showAllDays, columnOrder, minDate])

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
      // Use military date so tasks starting before day_start_hour belong to previous column
      const key = militaryDate(t.start_datetime, DAY_START_HOUR)
      if (!m[key]) m[key] = []
      m[key].push(t)
    }
    return m
  }, [tasks, DAY_START_HOUR])

  // is_designated_commander = should be displayed as the task's commander (BOLD).
  // Set when (a) explicitly marked acting commander, OR (b) auto-promoted real commander
  // in a task type that opts in to commander promotion. Otherwise — false (no bold).
  type AssignedSoldier = Soldier & {
    note?: string
    alternating_group?: number
    is_acting_commander?: boolean
    is_designated_commander?: boolean
  }

  // Task types where commanders should NOT be auto-promoted / shown as the leader.
  // (כ"כ ב = independent duty rotation. בלת"מ = unplanned response, no commander designation.)
  const NO_COMMANDER_PROMOTION_TYPES = new Set(['כ"כ ב', 'בלת"מ'])

  function assignedFor(task: Task): AssignedSoldier[] {
    const result: AssignedSoldier[] = []
    for (const a of assignments.filter(a => a.task_id === task.id).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))) {
      const s = soldierMap[a.soldier_id]
      if (s) result.push({ ...s, note: a.note, alternating_group: a.alternating_group, is_acting_commander: a.is_acting_commander ?? false })
    }
    // Per-task acting commander always takes priority — promoted to first AND marked as designated
    if (result.some(s => s.is_acting_commander)) {
      result.sort((a, b) => (a.is_acting_commander ? 0 : 1) - (b.is_acting_commander ? 0 : 1))
      result.forEach(s => { s.is_designated_commander = !!s.is_acting_commander })
      return result
    }
    // No acting commander: auto-promote a real commander only in non-opt-out task types
    if (!NO_COMMANDER_PROMOTION_TYPES.has(task.task_type) && result.some(s => s.is_commander)) {
      result.sort((a, b) => (a.is_commander ? 0 : 1) - (b.is_commander ? 0 : 1))
      result.forEach(s => { s.is_designated_commander = !!s.is_commander })
    }
    // Otherwise (no acting, no auto-promotion) → no one is designated → no bold
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
    const prev = new Date(dateStr + 'T12:00:00')
    prev.setDate(prev.getDate() - 1)
    const prevStr = isoDate(prev)

    // All approved leave records for this date
    const homeToday = new Set(
      finalLeave.filter(r => r.date === dateStr && r.status === 'approved').map(r => r.soldier_id)
    )
    const homeYesterday = new Set(
      finalLeave.filter(r => r.date === prevStr && r.status === 'approved').map(r => r.soldier_id)
    )

    const stayingHome: string[] = [] // home both days
    const leavingToday: string[] = [] // home today, was here yesterday
    const returning: string[] = []   // was home yesterday, here today
    const present: string[] = []     // here both days

    for (const s of soldiers) {
      if (!s.is_active) continue
      const isHome = homeToday.has(s.id)
      const wasHome = homeYesterday.has(s.id)
      if (isHome && wasHome) stayingHome.push(s.full_name)
      else if (isHome) leavingToday.push(s.full_name)
      else if (wasHome) returning.push(s.full_name)
      else present.push(s.full_name)
    }
    return { leavingToday, stayingHome, returning, present }
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
            // Round UP so half-hour tasks still get a visible row
            const durationHours = Math.max(1, Math.ceil(
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
            </div>

            {/* Status panel: present / returning / leaving / at home, stacked vertically */}
            {helper && !isCollapsed && (
              <div className="flex flex-col gap-1 mb-2 text-xs">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 flex flex-wrap items-baseline gap-x-2">
                  <span className="font-bold text-emerald-800 shrink-0">✅ נמצאים ({helper.present.length}):</span>
                  <span className="text-emerald-700">{helper.present.length > 0 ? helper.present.join(', ') : '—'}</span>
                </div>
                {helper.returning.length > 0 && (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-1.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="font-bold text-teal-800 shrink-0">↩ חוזרים ב-{formatHour(HOME_LEAVE_START)} ({helper.returning.length}):</span>
                    <span className="text-teal-700">{helper.returning.join(', ')}</span>
                  </div>
                )}
                {helper.leavingToday.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="font-bold text-amber-800 shrink-0">⤴ יוצאים ב-{formatHour(HOME_LEAVE_START)} ({helper.leavingToday.length}):</span>
                    <span className="text-amber-700">{helper.leavingToday.join(', ')}</span>
                  </div>
                )}
                {helper.stayingHome.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="font-bold text-blue-800 shrink-0">🏠 בבית ({helper.stayingHome.length}):</span>
                    <span className="text-blue-700">{helper.stayingHome.join(', ')}</span>
                  </div>
                )}
              </div>
            )}

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
                    const isDragOver = dragOverColType === col && dragColType !== col
                    return (
                      <th
                        key={col}
                        className={`border border-slate-300 px-1 py-1.5 text-center text-xs font-bold relative select-none transition-all ${isDragOver ? 'ring-2 ring-white ring-inset opacity-80' : ''}`}
                        style={{ backgroundColor: cs.headBg, color: cs.headText, cursor: builderMode && onReorderColumns ? 'grab' : 'default' }}
                        draggable={!!(builderMode && onReorderColumns)}
                        onDragStart={builderMode && onReorderColumns ? (e) => { e.dataTransfer.effectAllowed = 'move'; setDragColType(col) } : undefined}
                        onDragOver={builderMode && onReorderColumns ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverColType(col) } : undefined}
                        onDrop={builderMode && onReorderColumns ? (e) => { e.preventDefault(); handleColDrop(col) } : undefined}
                        onDragEnd={builderMode && onReorderColumns ? () => { setDragColType(null); setDragOverColType(null) } : undefined}
                      >
                        {builderMode && onReorderColumns && (
                          <span className="absolute top-0.5 right-0.5 text-[8px] opacity-30 select-none pointer-events-none">⠿</span>
                        )}
                        {col}
                        {builderMode && (onDeleteColumn || onEditColumn) && (
                          <div className="absolute top-0.5 left-0.5">
                            <button
                              onClick={e => { e.stopPropagation(); setOpenColMenu(openColMenu === col ? null : col) }}
                              className="text-[11px] leading-none px-0.5 opacity-50 hover:opacity-100 rounded"
                              title="אפשרויות עמודה"
                            >⋯</button>
                            {openColMenu === col && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setOpenColMenu(null)} />
                                <div className="absolute top-5 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 min-w-[120px] py-1 text-right" dir="rtl">
                                  {onEditColumn && (
                                    <button
                                      onClick={e => { e.stopPropagation(); setOpenColMenu(null); onEditColumn(col) }}
                                      className="w-full text-right px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                    >✏️ ערוך עמודה</button>
                                  )}
                                  {onDeleteColumn && (
                                    <button
                                      onClick={e => { e.stopPropagation(); setOpenColMenu(null); onDeleteColumn(col) }}
                                      className="w-full text-right px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                                    >🗑 מחק עמודה</button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Compute visible row range:
                  // - Builder mode: always show from row 0 (= dayStartHour) so all days start at the same hour.
                  //   Bottom stays open (HOURS_PER_DAY - 1) so new tasks can be placed anywhere.
                  // - View mode (soldiers): trim both top and bottom to only what's needed.
                  let firstOccupiedRow = 0
                  let lastOccupiedRow = HOURS_PER_DAY - 1
                  if (!builderMode && dayTasks.length > 0) {
                    const startRows = dayTasks.map(t => hourToRowIndex(t.start_datetime.getHours()))
                    const endRows = dayTasks.map(t => {
                      const sr = hourToRowIndex(t.start_datetime.getHours())
                      const dur = Math.max(1, Math.round((t.end_datetime.getTime() - t.start_datetime.getTime()) / 3600000))
                      return Math.min(sr + dur - 1, HOURS_PER_DAY - 1)
                    })
                    if (overflowTypes.size > 0) startRows.push(0)
                    firstOccupiedRow = Math.min(...startRows)
                    lastOccupiedRow = Math.min(Math.max(...endRows), HOURS_PER_DAY - 1)
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
                            : Math.max(1, Math.ceil(
                                (task.end_datetime.getTime() - task.start_datetime.getTime()) / 3600000
                              ))
                          const rowSpan = Math.min(durationHours, HOURS_PER_DAY - rowIndex)
                          const timeLabel = task.time_display ?? `${formatTime(task.start_datetime)}–${formatTime(task.end_datetime)}`
                          const assigned = assignedFor(task)

                          // In soldier-facing view: don't filter individual tasks here —
                          // entire days with unassigned tasks are filtered out at the days-list level above

                          const isMine = currentSoldierId ? assigned.some(s => s.id === currentSoldierId) : false
                          const missing = task.required_people_count - assigned.length
                          const commanderMissing = task.requires_commander && !assigned.some(s => s.is_commander)
                          const errorsForTask = (builderMode && taskErrors) ? (taskErrors[task.id] ?? []) : []
                          const hasTaskErrors = errorsForTask.length > 0

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
                          const showEditBar = builderMode && isSelected && (onMoveTask || onResizeTask || onResizeTaskStart || onDeleteTask)

                          const canMoveDrag = builderMode && !!onMoveTask
                          return (
                            <td
                              key={col}
                              rowSpan={rowSpan}
                              className={`border border-slate-200 p-1 align-top h-8 relative ${onSelectTask ? 'cursor-pointer' : ''}`}
                              onClick={onSelectTask ? () => {
                                if (dragOccurredRef.current) { dragOccurredRef.current = false; return }
                                onSelectTask(task.id)
                              } : undefined}
                            >
                              {taskNowPct && (
                                <div className="absolute left-0 right-0 pointer-events-none z-20" style={{ top: taskNowPct }}>
                                  <div className="border-t-2 border-dashed border-red-400 opacity-50" />
                                </div>
                              )}
                              {/* Live resize drag preview */}
                              {drag?.taskId === task.id && drag.deltaHalfHours !== 0 && (
                                <div className="absolute inset-x-1 top-1 bottom-1 pointer-events-none z-30 rounded-md border-2 border-dashed border-blue-500 bg-blue-100/50 flex items-center justify-center text-xs font-bold text-blue-800">
                                  {drag.deltaHalfHours > 0 ? '+' : ''}{(drag.deltaHalfHours * 0.5).toFixed(1)}ש
                                </div>
                              )}
                              {/* Live move drag preview */}
                              {moveDrag?.taskId === task.id && moveDrag.isDragging && (
                                <div className="absolute inset-x-1 top-1 bottom-1 pointer-events-none z-30 rounded-md border-2 border-dashed border-green-500 bg-green-100/50 flex items-center justify-center text-xs font-bold text-green-800">
                                  {moveDrag.deltaHalfHours > 0 ? '+' : ''}{moveDrag.deltaHalfHours !== 0 ? (moveDrag.deltaHalfHours * 0.5).toFixed(1) + 'ש' : '↕'}
                                </div>
                              )}
                              <div
                                className={`rounded-md border shadow-sm px-1.5 py-1 text-center h-full min-h-[28px] flex flex-col justify-center transition relative ${cardExtraClass} ${hasTaskErrors ? 'ring-2 ring-red-500 ring-offset-1' : ''} ${canMoveDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                style={cardStyle}
                                onMouseDown={canMoveDrag ? (e: React.MouseEvent) => {
                                  e.preventDefault()
                                  setMoveDrag({ taskId: task.id, startY: e.clientY, deltaHalfHours: 0, isDragging: false })
                                } : undefined}
                                onTouchStart={canMoveDrag ? (e: React.TouchEvent) => {
                                  const t = e.touches[0]
                                  if (!t) return
                                  setMoveDrag({ taskId: task.id, startY: t.clientY, deltaHalfHours: 0, isDragging: false })
                                } : undefined}
                              >
                                {/* Single resize handle at the bottom — drag to change end time (snaps to 30 min) */}
                                {builderMode && isSelected && onResizeTask && (
                                  <div
                                    onMouseDown={e => {
                                      e.stopPropagation()
                                      e.preventDefault()
                                      setDrag({ taskId: task.id, startY: e.clientY, deltaHalfHours: 0 })
                                    }}
                                    onTouchStart={e => {
                                      e.stopPropagation()
                                      const t = e.touches[0]
                                      if (!t) return
                                      setDrag({ taskId: task.id, startY: t.clientY, deltaHalfHours: 0 })
                                    }}
                                    title="גרור למעלה לקיצור / למטה להארכה (קפיצות של חצי שעה)"
                                    className="absolute bottom-0 inset-x-0 h-4 cursor-ns-resize bg-orange-500 hover:bg-orange-600 z-10 flex items-center justify-center rounded-b select-none"
                                  >
                                    <span className="text-white text-[10px] font-bold leading-none">⇅ גרור</span>
                                  </div>
                                )}
                                <div className="space-y-0.5">
                                  {hasTaskErrors && (
                                    <div className="absolute top-0 right-0 z-20 text-red-600 text-[11px] leading-none px-0.5"
                                      title={errorsForTask.join('\n')}>⚠️</div>
                                  )}
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
                                        return rows.map((row) => {
                                          // Bold only when this row contains the designated commander
                                          // (acting OR auto-promoted real commander). NOT just by row position.
                                          const isCommanderRow = row.some(s => s.is_designated_commander)
                                          return (
                                          <div
                                            key={row[0].id}
                                            className={`text-xs leading-snug flex items-center justify-center flex-wrap gap-x-0.5 ${isCommanderRow ? 'font-bold' : ''}`}
                                          >
                                            {row.map((s, si) => (
                                              <span key={s.id} className="flex items-center gap-0.5">
                                                {si > 0 && <span className="opacity-40 font-normal">/</span>}
                                                {builderMode && s.is_designated_commander && (
                                                  <span className="text-[11px] leading-none text-yellow-600" title="מפקד הכוח במשימה זו">★</span>
                                                )}
                                                <span>{s.full_name}</span>
                                                {s.note && (
                                                  <span
                                                    title={s.note}
                                                    className="inline-flex items-center text-[9px] font-semibold px-1 py-0 rounded cursor-default select-none bg-white/40"
                                                  >
                                                    {s.note}
                                                  </span>
                                                )}
                                                {builderMode && onToggleActingCommander && (
                                                  <button
                                                    onClick={e => { e.stopPropagation(); onToggleActingCommander(task.id, s.id, !s.is_acting_commander) }}
                                                    title={s.is_acting_commander ? 'הסר ★ מפקד' : 'סמן כמפקד הכוח במשימה זו'}
                                                    className={`text-[10px] leading-none ${s.is_acting_commander ? 'text-yellow-600 opacity-80 hover:opacity-100' : 'opacity-25 hover:opacity-100'}`}
                                                  >
                                                    {s.is_acting_commander ? '☆' : '★'}
                                                  </button>
                                                )}
                                              </span>
                                            ))}
                                            {builderMode && onEditAssignmentNote && (
                                              <button
                                                onClick={e => { e.stopPropagation(); onEditAssignmentNote(task.id, row[0].id, row[0].note ?? '') }}
                                                title={row[0].note ? `הערה: ${row[0].note} (לחץ לעריכה)` : 'הוסף הערה'}
                                                className="opacity-40 hover:opacity-100 hover:text-navy text-[10px] leading-none"
                                              >
                                                ✎
                                              </button>
                                            )}
                                            {builderMode && onRemoveSoldier && (
                                              <button
                                                onClick={e => { e.stopPropagation(); onRemoveSoldier(task.id, row[0].id) }}
                                                className="opacity-40 hover:opacity-100 hover:text-red-500 leading-none"
                                              >
                                                ×
                                              </button>
                                            )}
                                          </div>
                                          )
                                        })
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

                                {/* Edit action bar — only delete button (resize is via drag handles) */}
                                {showEditBar && (
                                  <div
                                    className="flex gap-0.5 justify-center mt-1 pt-1 border-t border-sky-200 flex-wrap"
                                    onClick={e => e.stopPropagation()}
                                  >
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
