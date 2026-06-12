import type { Task, Assignment, Soldier, LeaveRequest, ValidationError } from '@/types'
import { doTasksOverlap, hoursGap } from './dateUtils'

const MAX_HOUR_IMBALANCE = 12

// Task types that count as "rest" — standby/on-call, not an active operational mission.
// REST types: do NOT trigger rest requirements afterward, and may overlap with other tasks
// without generating a double-booking error.
const REST_TASK_TYPES = new Set(['כוננות', 'כוננות א', 'כוננות ב', 'בלת"מ', 'כ"כ ב'])

function isRestType(task: Task): boolean {
  return REST_TASK_TYPES.has(task.task_type) || REST_TASK_TYPES.has(task.task_name)
}

// Operational mission types that require a 1:2 rest ratio before the next operational mission.
// (e.g. 8h patrol → 16h rest before the next patrol/attack)
const OPERATIONAL_TASK_TYPES = new Set(['סיור', 'התקפי'])

function isOperationalType(task: Task): boolean {
  return OPERATIONAL_TASK_TYPES.has(task.task_type) || OPERATIONAL_TASK_TYPES.has(task.task_name)
}

// Pairs of task types that are explicitly allowed to overlap for the same soldier.
export const ALLOWED_CONCURRENT_TYPES: Array<[string, string]> = [
  ['תורן רס"פ', 'כ"כ ב'],
]

export function isAllowedConcurrent(typeA: string, typeB: string): boolean {
  return ALLOWED_CONCURRENT_TYPES.some(([a, b]) =>
    (a === typeA && b === typeB) || (a === typeB && b === typeA)
  )
}

function prevDateStr(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export function validateSchedule(
  tasks: Task[],
  assignments: Assignment[],
  soldiers: Soldier[],
  finalLeave: LeaveRequest[],
  homeLeaveHour = 0
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

  // ─── 1. Assignment during home time ─────────────────────────────────
  // Mirrors SoldierPanel logic (getSoldierStatus + canAssignByLeaveStatus):
  //   stayingHome  (isHome && wasHome)  → fully away all day → always error
  //   leavingToday (isHome && !wasHome) → at base until homeLeaveHour → error if task ends after swap
  //   returningToday (!isHome && wasHome) → away until homeLeaveHour → error if task starts before swap
  for (const a of assignments) {
    const task = tasks.find(t => t.id === a.task_id)
    if (!task) continue

    const taskDateStr = task.start_datetime.toISOString().split('T')[0]
    const yestStr     = prevDateStr(taskDateStr)
    const isHomeOnDate = homeDates[a.soldier_id]?.has(taskDateStr) ?? false
    const wasHomeYest  = homeDates[a.soldier_id]?.has(yestStr)    ?? false

    let homeError = false
    if (isHomeOnDate && wasHomeYest) {
      // stayingHome — soldier is away the entire day, never assignable
      homeError = true
    } else if (homeLeaveHour > 0) {
      // Hour-based checks only when the swap hour is configured (homeLeaveHour > 0).
      // Without a configured swap hour we can't know exactly when the soldier leaves/returns,
      // so we don't flag leavingToday / returningToday cases.
      if (isHomeOnDate && !wasHomeYest) {
        // leavingToday — soldier leaves at homeLeaveHour; error if task extends past that
        const taskEndDate = task.end_datetime.toISOString().split('T')[0]
        const taskEndH    = task.end_datetime.getHours()
        if (taskEndDate !== taskDateStr || taskEndH > homeLeaveHour) homeError = true
      } else if (!isHomeOnDate && wasHomeYest) {
        // returningToday — soldier returns at homeLeaveHour; error if task starts before that
        if (task.start_datetime.getHours() < homeLeaveHour) homeError = true
      }
    }

    if (homeError) {
      const soldier = soldierMap[a.soldier_id]
      errors.push({
        type: 'error',
        severity: 1,
        soldier_id: a.soldier_id,
        task_id: a.task_id,
        message: `${soldier?.full_name ?? a.soldier_id}: משובץ ל-${task.task_name} בתאריך שהוא בבית`,
      })
    }
  }

  // ─── 2. Overlapping tasks (same soldier in two tasks at the same time) ───
  // REST types (כוננות א/ב, כ"כ ב, בלת"מ) may legitimately overlap with other tasks — skip them.
  for (const [soldier_id, stasks] of Object.entries(soldierTasks)) {
    const sorted = [...stasks].sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (isRestType(sorted[i]) || isRestType(sorted[j])) continue  // rest can overlap anything
        if (
          doTasksOverlap(
            { start: sorted[i].start_datetime, end: sorted[i].end_datetime },
            { start: sorted[j].start_datetime, end: sorted[j].end_datetime }
          ) &&
          !isAllowedConcurrent(sorted[i].task_type, sorted[j].task_type)
        ) {
          errors.push({
            type: 'error',
            severity: 1,
            soldier_id,
            task_id: sorted[i].id,
            message: `${soldierMap[soldier_id]?.full_name ?? soldier_id}: שיבוץ כפול — ${sorted[i].task_name} ו-${sorted[j].task_name}`,
          })
        }
      }
    }
  }

  // ─── 3. Insufficient rest before operational missions (1:2 ratio) ──────
  // Applies only when the NEXT task is an OPERATIONAL mission (סיור, התקפי).
  // REST types (כוננות, כ"כ ב, בלת"מ) are filtered out of the sequence — they count as rest time.
  // The required rest = 2 × the duration of the upcoming operational mission.
  // Example: before an 8h patrol, need 16h rest from the end of the previous non-rest task.
  for (const [soldier_id, stasks] of Object.entries(soldierTasks)) {
    const nonRestShifts = stasks
      .filter(t => !isRestType(t))
      .sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())
    for (let i = 0; i + 1 < nonRestShifts.length; i++) {
      const prev = nonRestShifts[i]
      const next = nonRestShifts[i + 1]
      if (!isOperationalType(next)) continue  // 1:2 only applies before operational missions
      const nextDuration = hoursGap(next.start_datetime, next.end_datetime)
      const minRest = nextDuration * 2        // need 2× the upcoming mission's duration as rest
      const gap = hoursGap(prev.end_datetime, next.start_datetime)
      if (gap >= 0 && gap < minRest) {
        errors.push({
          type: 'error',
          severity: 3,
          soldier_id,
          task_id: next.id,
          message: `${soldierMap[soldier_id]?.full_name ?? soldier_id}: רק ${gap.toFixed(0)}ש׳ מנוחה לפני ${next.task_name} (נדרש ${minRest.toFixed(0)}ש׳ — יחס 1:2)`,
        })
      }
    }
  }

  // ─── 4. Understaffed tasks ──────────────────────────────────────────
  const taskCount: Record<string, number> = {}
  for (const a of assignments) taskCount[a.task_id] = (taskCount[a.task_id] || 0) + 1
  for (const task of tasks) {
    const count = taskCount[task.id] || 0
    if (count < task.required_people_count) {
      errors.push({
        type: 'error',
        severity: 2,
        task_id: task.id,
        message: `${task.task_name}: חסרים ${task.required_people_count - count} חיילים`,
      })
    }
  }

  // ─── 5. Commander required but missing ──────────────────────────────
  for (const task of tasks) {
    if (!task.requires_commander) continue
    const taskAssignments = assignments.filter(a => a.task_id === task.id)
    // A task has a commander if any assigned soldier is_commander (profile) OR is_acting_commander (★ per-task)
    const hasCommander = taskAssignments.some(a => {
      if (a.is_acting_commander) return true
      return soldierMap[a.soldier_id]?.is_commander ?? false
    })
    if (!hasCommander) {
      errors.push({
        type: 'error',
        severity: 2,
        task_id: task.id,
        message: `${task.task_name}: נדרש מפקד — אף מפקד לא משובץ`,
      })
    }
  }

  // ─── 6. Workload imbalance (only soldiers who were PRESENT at least one schedule day) ──
  // Determine the schedule's day range
  const allDates = tasks.map(t => t.start_datetime.toISOString().split('T')[0])
  const scheduleDays = Array.from(new Set(allDates)).sort()
  if (scheduleDays.length > 0) {
    // For each active soldier: count days they were PRESENT in this schedule (i.e., not on leave that day)
    const presenceDays: Record<string, number> = {}
    for (const s of soldiers) {
      if (!s.is_active) continue
      let presentCount = 0
      for (const day of scheduleDays) {
        if (!homeDates[s.id]?.has(day)) presentCount++
      }
      if (presentCount > 0) presenceDays[s.id] = presentCount
    }

    // Hours per present soldier, prorated by their presence ratio
    const presentSoldierIds = Object.keys(presenceDays)
    const fullPresence = scheduleDays.length
    const normalizedHours = presentSoldierIds.map(sid => {
      const tasks_ = soldierTasks[sid] ?? []
      const hours = tasks_.reduce((sum, t) => sum + hoursGap(t.start_datetime, t.end_datetime), 0)
      // Normalize by presence ratio so soldiers who were home most of the time aren't unfairly compared
      const presenceRatio = presenceDays[sid] / fullPresence
      const normalized = presenceRatio > 0 ? hours / presenceRatio : hours
      return { sid, hours, normalized }
    })

    if (normalizedHours.length >= 2) {
      const max = Math.max(...normalizedHours.map(s => s.normalized))
      const min = Math.min(...normalizedHours.map(s => s.normalized))
      if (max - min > MAX_HOUR_IMBALANCE) {
        const maxSoldier = normalizedHours.find(s => s.normalized === max)
        const minSoldier = normalizedHours.find(s => s.normalized === min)
        const maxName = soldierMap[maxSoldier?.sid ?? '']?.full_name ?? '?'
        const minName = soldierMap[minSoldier?.sid ?? '']?.full_name ?? '?'
        errors.push({
          type: 'error',
          severity: 4,
          message: `חלוקה לא שוויונית בין לוחמים נוכחים: ${maxName} עומס מנורמל ${max.toFixed(0)}ש׳, ${minName} ${min.toFixed(0)}ש׳ (הפרש ${(max - min).toFixed(0)}ש׳)`,
        })
      }
    }
  }

  // ─── Sort errors by severity (most severe first), then chronologically ───
  const taskById = new Map(tasks.map(t => [t.id, t]))
  errors.sort((a, b) => {
    const sa = a.severity ?? 99
    const sb = b.severity ?? 99
    if (sa !== sb) return sa - sb
    const ta = a.task_id ? taskById.get(a.task_id)?.start_datetime.getTime() ?? Infinity : Infinity
    const tb = b.task_id ? taskById.get(b.task_id)?.start_datetime.getTime() ?? Infinity : Infinity
    return ta - tb
  })

  return errors
}
