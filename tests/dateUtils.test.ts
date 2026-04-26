import { describe, it, expect } from 'vitest'
import { doTasksOverlap, formatHebrewDate, hoursGap } from '@/utils/dateUtils'

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
