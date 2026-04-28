import type { Task, Assignment, Soldier, LeaveRequest, ValidationError } from '@/types'
import { doTasksOverlap, hoursGap } from './dateUtils'

const MIN_REST_HOURS = 8
const MAX_HOUR_IMBALANCE = 4

export function validateSchedule(
  tasks: Task[],
  assignments: Assignment[],
  soldiers: Soldier[],
  finalLeave: LeaveRequest[]
): ValidationError[] {
  const errors: ValidationError[] = []
  const soldierMap: Record<string, Soldier> = {}
  for (const s of soldiers) soldierMap[s.id] = s

  // Build: soldier_id → tasks[]
  const soldierTasks: Record<string, Task[]> = {}
  for (const a of assignments) {
    const task = tasks.find(t => t.id === a.task_id)
    if (!task) continue
    if (!soldierTasks[a.soldier_id]) soldierTasks[a.soldier_id] = []
    soldierTasks[a.soldier_id].push(task)
  }

  // Build: approved final leave dates per soldier (from finalLeave + fixed_home_ranges)
  const homeDates: Record<string, Set<string>> = {}

  for (const r of finalLeave) {
    if (r.status !== 'approved') continue
    if (!homeDates[r.soldier_id]) homeDates[r.soldier_id] = new Set()
    homeDates[r.soldier_id].add(r.date)
  }

  for (const s of soldiers) {
    for (const range of s.fixed_home_ranges ?? []) {
      if (!range.from || !range.to) continue
      const from = new Date(range.from)
      const to = new Date(range.to)
      const cur = new Date(from)
      while (cur <= to) {
        if (!homeDates[s.id]) homeDates[s.id] = new Set()
        homeDates[s.id].add(cur.toISOString().split('T')[0])
        cur.setDate(cur.getDate() + 1)
      }
    }
  }

  // 1. Assignment during home time (error)
  for (const a of assignments) {
    const task = tasks.find(t => t.id === a.task_id)
    if (!task) continue
    const taskDate = task.start_datetime.toISOString().split('T')[0]
    if (homeDates[a.soldier_id]?.has(taskDate)) {
      const soldier = soldierMap[a.soldier_id]
      errors.push({
        type: 'error',
        soldier_id: a.soldier_id,
        task_id: a.task_id,
        message: `${soldier?.full_name ?? a.soldier_id}: משובץ ל-${task.task_name} בתאריך שהוא בבית`,
      })
    }
  }

  // 2. Double booking + rest check (per soldier)
  for (const [soldier_id, stasks] of Object.entries(soldierTasks)) {
    const sorted = [...stasks].sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (doTasksOverlap(
          { start: sorted[i].start_datetime, end: sorted[i].end_datetime },
          { start: sorted[j].start_datetime, end: sorted[j].end_datetime }
        )) {
          errors.push({
            type: 'error',
            soldier_id,
            message: `שיבוץ כפול: ${sorted[i].task_name} ו-${sorted[j].task_name}`,
          })
        }
      }
      if (i + 1 < sorted.length) {
        const gap = hoursGap(sorted[i].end_datetime, sorted[i + 1].start_datetime)
        if (gap >= 0 && gap < MIN_REST_HOURS) {
          errors.push({
            type: 'warning',
            soldier_id,
            message: `מנוחה קצרה (${gap.toFixed(1)}h): ${sorted[i].task_name} → ${sorted[i + 1].task_name}`,
          })
        }
      }
    }
  }

  // 3. Understaffed tasks (error)
  const taskCount: Record<string, number> = {}
  for (const a of assignments) taskCount[a.task_id] = (taskCount[a.task_id] || 0) + 1
  for (const task of tasks) {
    const count = taskCount[task.id] || 0
    if (count < task.required_people_count) {
      errors.push({
        type: 'error',
        task_id: task.id,
        message: `${task.task_name}: חסרים ${task.required_people_count - count} חיילים`,
      })
    }
  }

  // 4. Commander required but missing (error)
  for (const task of tasks) {
    if (!task.requires_commander) continue
    const assignedSoldiers = assignments
      .filter(a => a.task_id === task.id)
      .map(a => soldierMap[a.soldier_id])
      .filter((s): s is Soldier => !!s)
    const hasCommander = assignedSoldiers.some(s => s.is_commander)
    if (!hasCommander) {
      errors.push({
        type: 'error',
        task_id: task.id,
        message: `${task.task_name}: נדרש מפקד — אף מפקד לא משובץ`,
      })
    }
  }

  // 5. Returning soldier not assigned after 10:00 (warning)
  const tasksByDate: Record<string, Task[]> = {}
  for (const t of tasks) {
    const d = t.start_datetime.toISOString().split('T')[0]
    if (!tasksByDate[d]) tasksByDate[d] = []
    tasksByDate[d].push(t)
  }
  for (const [dateStr, dayTasks] of Object.entries(tasksByDate)) {
    const prev = new Date(dateStr + 'T12:00:00')
    prev.setDate(prev.getDate() - 1)
    const prevStr = prev.toISOString().split('T')[0]
    for (const s of soldiers) {
      if (!s.is_active) continue
      const wasHome = homeDates[s.id]?.has(prevStr)
      const isHome = homeDates[s.id]?.has(dateStr)
      if (wasHome && !isHome) {
        const after10 = dayTasks.filter(t => t.start_datetime.getHours() >= 10)
        const isAssigned = assignments.some(a =>
          a.soldier_id === s.id && after10.some(t => t.id === a.task_id)
        )
        if (!isAssigned) {
          errors.push({
            type: 'warning',
            soldier_id: s.id,
            message: `${s.full_name} חוזר ב-${dateStr} — לא משובץ לאחר 10:00`,
          })
        }
      }
    }
  }

  // 6. Workload imbalance (warning)
  const soldierHours = Object.entries(soldierTasks).map(([soldier_id, stasks]) => ({
    soldier_id,
    hours: stasks.reduce((sum, t) => sum + hoursGap(t.start_datetime, t.end_datetime), 0),
  }))
  if (soldierHours.length >= 2) {
    const max = Math.max(...soldierHours.map(s => s.hours))
    const min = Math.min(...soldierHours.map(s => s.hours))
    if (max - min > MAX_HOUR_IMBALANCE) {
      errors.push({
        type: 'warning',
        message: `חלוקה לא שוויונית: הפרש ${(max - min).toFixed(1)} שעות`,
      })
    }
  }

  return errors
}
