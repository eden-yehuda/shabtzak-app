import { describe, it, expect } from 'vitest'
import { doTasksOverlap, formatHebrewDate, hoursGap, isSoldierInactiveOnDate } from '@/utils/dateUtils'
import type { Soldier } from '@/types'

describe('doTasksOverlap', () => {
  it('returns true when tasks fully overlap', () => {
    const a = { start: new Date('2026-04-27T08:00'), end: new Date('2026-04-27T12:00') }
    const b = { start: new Date('2026-04-27T10:00'), end: new Date('2026-04-27T14:00') }
    expect(doTasksOverlap(a, b)).toBe(true)
  })

  it('returns false when tasks are adjacent (no gap)', () => {
    const a = { start: new Date('2026-04-27T08:00'), end: new Date('2026-04-27T12:00') }
    const b = { start: new Date('2026-04-27T12:00'), end: new Date('2026-04-27T16:00') }
    expect(doTasksOverlap(a, b)).toBe(false)
  })

  it('returns false when tasks are completely separate', () => {
    const a = { start: new Date('2026-04-27T08:00'), end: new Date('2026-04-27T10:00') }
    const b = { start: new Date('2026-04-27T14:00'), end: new Date('2026-04-27T18:00') }
    expect(doTasksOverlap(a, b)).toBe(false)
  })
})

describe('hoursGap', () => {
  it('returns hours between end of first and start of second', () => {
    const end = new Date('2026-04-27T08:00')
    const start = new Date('2026-04-27T14:00')
    expect(hoursGap(end, start)).toBe(6)
  })
})

describe('formatHebrewDate', () => {
  it('formats date as DD/MM', () => {
    expect(formatHebrewDate(new Date('2026-04-27T12:00:00Z'))).toBe('27/4')
  })
})

describe('isSoldierInactiveOnDate', () => {
  const base: Soldier = {
    id: 's1', full_name: 'חייל', team: '', is_active: true,
    is_commander: false, notes: '', fixed_home_ranges: [],
  }

  it('returns false when soldier has no inactive_ranges', () => {
    expect(isSoldierInactiveOnDate(base, '2026-06-07')).toBe(false)
  })

  it('returns true when date is inside a range (inclusive start)', () => {
    const s = { ...base, inactive_ranges: [{ from: '2026-06-07', to: '2026-06-10' }] }
    expect(isSoldierInactiveOnDate(s, '2026-06-07')).toBe(true)
  })

  it('returns true when date is inside a range (inclusive end)', () => {
    const s = { ...base, inactive_ranges: [{ from: '2026-06-07', to: '2026-06-10' }] }
    expect(isSoldierInactiveOnDate(s, '2026-06-10')).toBe(true)
  })

  it('returns false when date is outside the range', () => {
    const s = { ...base, inactive_ranges: [{ from: '2026-06-07', to: '2026-06-10' }] }
    expect(isSoldierInactiveOnDate(s, '2026-06-11')).toBe(false)
  })

  it('ignores ranges with empty from/to', () => {
    const s = { ...base, inactive_ranges: [{ from: '', to: '' }] }
    expect(isSoldierInactiveOnDate(s, '2026-06-07')).toBe(false)
  })

  it('returns true if any of multiple ranges matches', () => {
    const s = { ...base, inactive_ranges: [
      { from: '2026-06-01', to: '2026-06-02' },
      { from: '2026-06-09', to: '2026-06-12' },
    ] }
    expect(isSoldierInactiveOnDate(s, '2026-06-10')).toBe(true)
  })
})
