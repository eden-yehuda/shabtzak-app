import { describe, it, expect } from 'vitest'
import { validateSchedule } from '@/utils/validation'
import type { Task, Assignment, Soldier, LeaveRequest } from '@/types'

const makeTask = (id: string, start: string, end: string): Task => ({
  id,
  schedule_id: 'sched1',
  task_name: 'שמירה',
  task_type: 'guard',
  difficulty: 'hard',
  start_datetime: new Date(start),
  end_datetime: new Date(end),
  required_people_count: 2,
  requires_commander: false,
})

const makeSoldier = (id: string, overrides: Partial<Soldier> = {}): Soldier => ({
  id,
  full_name: id,
  team: 'team1',
  is_active: true,
  is_commander: false,
  notes: '',
  fixed_home_ranges: [],
  ...overrides,
})

const noLeave: LeaveRequest[] = []

const makeLeave = (soldierId: string, date: string): LeaveRequest => ({
  id: `leave-${soldierId}-${date}`,
  soldier_id: soldierId,
  date,
  status: 'approved',
  is_final: true,
})

describe('validateSchedule', () => {
  it('flags double booking when soldier has overlapping tasks', () => {
    const tasks: Task[] = [
      makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00'),
      makeTask('t2', '2026-04-27T10:00', '2026-04-27T14:00'),
    ]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 },
      { id: 'a2', task_id: 't2', soldier_id: 's1', order: 0 },
    ]
    const soldiers: Soldier[] = [makeSoldier('s1')]
    const errors = validateSchedule(tasks, assignments, soldiers, noLeave)
    expect(errors.some(e => e.type === 'error' && e.soldier_id === 's1')).toBe(true)
  })

  it('flags insufficient rest (< 16 hours between tasks)', () => {
    const tasks: Task[] = [
      makeTask('t1', '2026-04-27T00:00', '2026-04-27T04:00'),
      makeTask('t2', '2026-04-27T08:00', '2026-04-27T12:00'),
    ]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 },
      { id: 'a2', task_id: 't2', soldier_id: 's1', order: 0 },
    ]
    const soldiers: Soldier[] = [makeSoldier('s1')]
    const errors = validateSchedule(tasks, assignments, soldiers, noLeave)
    expect(errors.some(e => e.type === 'error' && e.soldier_id === 's1')).toBe(true)
  })

  it('flags understaffed task', () => {
    const tasks: Task[] = [makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00')]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 },
      // only 1 assigned, required_people_count = 2
    ]
    const soldiers: Soldier[] = [makeSoldier('s1')]
    const errors = validateSchedule(tasks, assignments, soldiers, noLeave)
    expect(errors.some(e => e.type === 'error' && e.task_id === 't1')).toBe(true)
  })

  it('flags workload imbalance when gap exceeds 8 hours', () => {
    const tasks: Task[] = [
      makeTask('t1', '2026-04-27T08:00', '2026-04-27T22:00'), // 14h
      makeTask('t2', '2026-04-27T08:00', '2026-04-27T10:00'), // 2h
    ]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 },
      { id: 'a2', task_id: 't1', soldier_id: 's3', order: 1 },
      { id: 'a3', task_id: 't2', soldier_id: 's2', order: 0 },
      { id: 'a4', task_id: 't2', soldier_id: 's4', order: 1 },
    ]
    const soldiers: Soldier[] = [
      makeSoldier('s1'),
      makeSoldier('s2'),
      makeSoldier('s3'),
      makeSoldier('s4'),
    ]
    const errors = validateSchedule(tasks, assignments, soldiers, noLeave)
    expect(errors.some(e => e.type === 'error' && e.message.includes('שוויונית'))).toBe(true)
  })

  it('assigns severity tiers: double-booking=1, understaffed=2, rest=3', () => {
    // double booking (severity 1)
    const dbTasks: Task[] = [
      makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00'),
      makeTask('t2', '2026-04-27T10:00', '2026-04-27T14:00'),
    ]
    const dbAssign: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 },
      { id: 'a2', task_id: 't2', soldier_id: 's1', order: 0 },
    ]
    const dbErrors = validateSchedule(dbTasks, dbAssign, [makeSoldier('s1')], noLeave)
    expect(dbErrors.find(e => e.message.includes('כפול'))?.severity).toBe(1)

    // understaffed (severity 2)
    const usErrors = validateSchedule(
      [makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00')],
      [{ id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 }],
      [makeSoldier('s1')],
      noLeave
    )
    expect(usErrors.find(e => e.message.includes('חסרים'))?.severity).toBe(2)

    // insufficient rest (severity 3)
    const restErrors = validateSchedule(
      [
        makeTask('t1', '2026-04-27T00:00', '2026-04-27T04:00'),
        makeTask('t2', '2026-04-27T08:00', '2026-04-27T12:00'),
      ],
      [
        { id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 },
        { id: 'a2', task_id: 't2', soldier_id: 's1', order: 0 },
      ],
      [makeSoldier('s1')],
      noLeave
    )
    expect(restErrors.find(e => e.message.includes('מנוחה'))?.severity).toBe(3)
  })

  it('sorts errors by severity (most severe first)', () => {
    // Build a schedule with both an understaffed task (sev 2) and a double booking (sev 1)
    const tasks: Task[] = [
      makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00'),
      makeTask('t2', '2026-04-27T10:00', '2026-04-27T14:00'),
    ]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 },
      { id: 'a2', task_id: 't2', soldier_id: 's1', order: 0 },
      // t1 still understaffed (needs 2, has 1), t2 understaffed too
    ]
    const errors = validateSchedule(tasks, assignments, [makeSoldier('s1')], noLeave)
    const severities = errors.map(e => e.severity ?? 99)
    const sorted = [...severities].sort((a, b) => a - b)
    expect(severities).toEqual(sorted)
    expect(severities[0]).toBe(1) // most severe first
  })

  // ─── Home-time validation (homeLeaveHour-aware) ───────────────────────────
  describe('home-time checks with homeLeaveHour=14', () => {
    const HOME_HOUR = 14

    it('stayingHome: flags task on a full home day (both today and yesterday in leave)', () => {
      const tasks: Task[] = [makeTask('t1', '2026-05-06T16:00', '2026-05-06T20:00')] // after swap
      const assignments: Assignment[] = [{ id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 }]
      const leave = [
        makeLeave('s1', '2026-05-05'), // yesterday home
        makeLeave('s1', '2026-05-06'), // today home → stayingHome
      ]
      const errors = validateSchedule(tasks, assignments, [makeSoldier('s1')], leave, HOME_HOUR)
      expect(errors.some(e => e.soldier_id === 's1' && e.message.includes('בבית'))).toBe(true)
    })

    it('leavingToday: flags task that ends AFTER homeLeaveHour', () => {
      // Soldier's first home day → leaves at 14:00
      const tasks: Task[] = [makeTask('t1', '2026-05-06T12:00', '2026-05-06T18:00')] // ends 18:00 > 14
      const assignments: Assignment[] = [{ id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 }]
      const leave = [makeLeave('s1', '2026-05-06')] // only today → leavingToday
      const errors = validateSchedule(tasks, assignments, [makeSoldier('s1')], leave, HOME_HOUR)
      expect(errors.some(e => e.soldier_id === 's1' && e.message.includes('בבית'))).toBe(true)
    })

    it('leavingToday: does NOT flag task that ends at or before homeLeaveHour', () => {
      // Task from 08:00 to 14:00 — soldier still at base (leaves at 14:00)
      const tasks: Task[] = [makeTask('t1', '2026-05-06T08:00', '2026-05-06T14:00')]
      const assignments: Assignment[] = [{ id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 }]
      const leave = [makeLeave('s1', '2026-05-06')]
      const errors = validateSchedule(tasks, assignments, [makeSoldier('s1')], leave, HOME_HOUR)
      const homeErrors = errors.filter(e => e.soldier_id === 's1' && e.message.includes('בבית'))
      expect(homeErrors).toHaveLength(0)
    })

    it('returningToday: flags task that starts BEFORE homeLeaveHour', () => {
      // Yesterday in homeDates, today not → returning today at 14:00
      const tasks: Task[] = [makeTask('t1', '2026-05-07T08:00', '2026-05-07T12:00')] // starts 08:00 < 14
      const assignments: Assignment[] = [{ id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 }]
      const leave = [makeLeave('s1', '2026-05-06')] // yesterday home, today not → returningToday
      const errors = validateSchedule(tasks, assignments, [makeSoldier('s1')], leave, HOME_HOUR)
      expect(errors.some(e => e.soldier_id === 's1' && e.message.includes('בבית'))).toBe(true)
    })

    it('returningToday: does NOT flag task that starts at or after homeLeaveHour', () => {
      // Task starts at 14:00 — soldier has returned
      const tasks: Task[] = [makeTask('t1', '2026-05-07T14:00', '2026-05-07T22:00')]
      const assignments: Assignment[] = [{ id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 }]
      const leave = [makeLeave('s1', '2026-05-06')] // yesterday home → returningToday today
      const errors = validateSchedule(tasks, assignments, [makeSoldier('s1')], leave, HOME_HOUR)
      const homeErrors = errors.filter(e => e.soldier_id === 's1' && e.message.includes('בבית'))
      expect(homeErrors).toHaveLength(0)
    })
  })

  it('returns no errors for a valid schedule', () => {
    const tasks: Task[] = [
      makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00'),
      makeTask('t2', '2026-04-28T08:00', '2026-04-28T12:00'),
    ]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1', order: 0 },
      { id: 'a2', task_id: 't1', soldier_id: 's2', order: 1 },
      { id: 'a3', task_id: 't2', soldier_id: 's1', order: 0 },
      { id: 'a4', task_id: 't2', soldier_id: 's2', order: 1 },
    ]
    const soldiers: Soldier[] = [makeSoldier('s1'), makeSoldier('s2')]
    const errors = validateSchedule(tasks, assignments, soldiers, noLeave)
    expect(errors).toHaveLength(0)
  })
})
