export interface TimeSlot {
  start: Date
  end: Date
}

export function doTasksOverlap(a: TimeSlot, b: TimeSlot): boolean {
  return a.start < b.end && b.start < a.end
}

export function hoursGap(endOfFirst: Date, startOfSecond: Date): number {
  return (startOfSecond.getTime() - endOfFirst.getTime()) / (1000 * 60 * 60)
}

/** Returns the duration of a task in hours */
export function taskDurationHours(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60)
}

export function formatHebrewDate(date: Date): string {
  return `${date.getUTCDate()}/${date.getUTCMonth() + 1}`
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

export function dateToKey(date: Date): string {
  return date.toISOString().slice(0, 10)  // 'YYYY-MM-DD'
}
