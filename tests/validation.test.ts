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
