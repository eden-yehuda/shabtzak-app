import { describe, it, expect } from 'vitest'
import { validateSchedule } from '@/utils/validation'
import type { Task, Assignment } from '@/types'

const makeTask = (id: string, start: string, end: string): Task => ({
  id,
  schedule_id: 'sched1',
  task_name: 'שמירה',
  task_type: 'guard',
  difficulty: 'hard',
  start_datetime: new Date(start),
  end_datetime: new Date(end),
  required_people_count: 2,
})

describe('validateSchedule', () => {
  it('flags double booking when soldier has overlapping tasks', () => {
    const tasks: Task[] = [
      makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00'),
      makeTask('t2', '2026-04-27T10:00', '2026-04-27T14:00'),
    ]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1' },
      { id: 'a2', task_id: 't2', soldier_id: 's1' },
    ]
    const errors = validateSchedule(tasks, assignments)
    expect(errors.some(e => e.type === 'error' && e.soldier_id === 's1')).toBe(true)
  })

  it('flags insufficient rest (< 6 hours between tasks)', () => {
    const tasks: Task[] = [
      makeTask('t1', '2026-04-27T00:00', '2026-04-27T04:00'),
      makeTask('t2', '2026-04-27T08:00', '2026-04-27T12:00'),
    ]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1' },
      { id: 'a2', task_id: 't2', soldier_id: 's1' },
    ]
    const errors = validateSchedule(tasks, assignments)
    expect(errors.some(e => e.type === 'warning' && e.soldier_id === 's1')).toBe(true)
  })

  it('flags understaffed task', () => {
    const tasks: Task[] = [makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00')]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1' },
      // only 1 assigned, required_people_count = 2
    ]
    const errors = validateSchedule(tasks, assignments)
    expect(errors.some(e => e.type === 'error' && e.task_id === 't1')).toBe(true)
  })

  it('returns no errors for a valid schedule', () => {
    const tasks: Task[] = [
      makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00'),
      makeTask('t2', '2026-04-27T20:00', '2026-04-28T00:00'),
    ]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1' },
      { id: 'a2', task_id: 't1', soldier_id: 's2' },
      { id: 'a3', task_id: 't2', soldier_id: 's1' },
      { id: 'a4', task_id: 't2', soldier_id: 's2' },
    ]
    const errors = validateSchedule(tasks, assignments)
    expect(errors).toHaveLength(0)
  })
})
