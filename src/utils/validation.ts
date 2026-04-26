import type { Task, Assignment, ValidationError } from '@/types'
import { doTasksOverlap, hoursGap } from './dateUtils'

const MIN_REST_HOURS = 6
const MAX_HOUR_IMBALANCE = 4

export function validateSchedule(
  tasks: Task[],
  assignments: Assignment[]
): ValidationError[] {
  const errors: ValidationError[] = []

  // Build lookup: soldier_id → tasks[]
  const soldierTasks: Record<string, Task[]> = {}
  for (const a of assignments) {
    const task = tasks.find(t => t.id === a.task_id)
    if (!task) continue
    if (!soldierTasks[a.soldier_id]) soldierTasks[a.soldier_id] = []
    soldierTasks[a.soldier_id].push(task)
  }

  // 1. Double booking + rest check per soldier
  for (const [soldier_id, stasks] of Object.entries(soldierTasks)) {
    const sorted = [...stasks].sort(
      (a, b) => a.start_datetime.getTime() - b.start_datetime.getTime()
    )
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (doTasksOverlap(
          { start: sorted[i].start_datetime, end: sorted[i].end_datetime },
          { start: sorted[j].start_datetime, end: sorted[j].end_datetime }
        )) {
          errors.push({
            type: 'error',
            soldier_id,
            message: `שיבוץ כפול: ${sorted[i].task_name} ו-${sorted[j].task_name} חופפים`,
          })
        }
      }
      if (i + 1 < sorted.length) {
        const gap = hoursGap(sorted[i].end_datetime, sorted[i + 1].start_datetime)
        if (gap >= 0 && gap < MIN_REST_HOURS) {
          errors.push({
            type: 'warning',
            soldier_id,
            message: `מנוחה קצרה: ${gap.toFixed(1)} שעות בין ${sorted[i].task_name} ל-${sorted[i + 1].task_name}`,
          })
        }
      }
    }
  }

  // 2. Understaffed tasks
  const taskAssignmentCount: Record<string, number> = {}
  for (const a of assignments) {
    taskAssignmentCount[a.task_id] = (taskAssignmentCount[a.task_id] || 0) + 1
  }
  for (const task of tasks) {
    const count = taskAssignmentCount[task.id] || 0
    if (count < task.required_people_count) {
      errors.push({
        type: 'error',
        task_id: task.id,
        message: `${task.task_name}: דרושים ${task.required_people_count}, שובצו ${count}`,
      })
    }
  }

  // 3. Workload imbalance
  const soldierHours = Object.entries(soldierTasks).map(([soldier_id, stasks]) => ({
    soldier_id,
    hours: stasks.reduce((sum, t) =>
      sum + hoursGap(t.start_datetime, t.end_datetime), 0),
  }))
  if (soldierHours.length >= 2) {
    const max = Math.max(...soldierHours.map(s => s.hours))
    const min = Math.min(...soldierHours.map(s => s.hours))
    if (max - min > MAX_HOUR_IMBALANCE) {
      errors.push({
        type: 'warning',
        message: `חלוקה לא שוויונית: הפרש של ${(max - min).toFixed(1)} שעות בין החיילים`,
      })
    }
  }

  return errors
}
