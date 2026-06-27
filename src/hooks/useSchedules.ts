import { useEffect, useState } from 'react'
import { onSnapshot, orderBy, query, doc } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'
import { db } from '@/lib/firebase'
import type { Schedule } from '@/types'

// Convert raw Firestore Timestamps to Dates safely
function toDateSafe(v: unknown): Date | undefined {
  if (!v) return undefined
  if (v instanceof Date) return v
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') {
    return (v as { toDate(): Date }).toDate()
  }
  return undefined
}

function rawToSchedule(id: string, data: Record<string, unknown>): Schedule {
  return {
    ...data,
    id,
    start_datetime: toDateSafe(data.start_datetime) as Date,
    end_datetime: toDateSafe(data.end_datetime) as Date,
    updated_at: toDateSafe(data.updated_at),
  } as Schedule
}

// Active schedules only (is_archived !== true)
export function useSchedules(): Schedule[] {
  const [schedules, setSchedules] = useState<Schedule[]>([])

  useEffect(() => {
    const q = query(schedulesRef(), orderBy('start_datetime', 'desc'))
    return onSnapshot(q, snap => {
      setSchedules(
        snap.docs
          .map(d => rawToSchedule(d.id, d.data()))
          .filter(s => !s.is_archived)
      )
    })
  }, [])

  return schedules
}

// Archived schedules only (is_archived === true)
export function useArchivedSchedules(): Schedule[] {
  const [schedules, setSchedules] = useState<Schedule[]>([])

  useEffect(() => {
    const q = query(schedulesRef(), orderBy('start_datetime', 'desc'))
    return onSnapshot(q, snap => {
      setSchedules(
        snap.docs
          .map(d => rawToSchedule(d.id, d.data()))
          .filter(s => s.is_archived === true)
      )
    })
  }, [])

  return schedules
}

// Live subscription so UI updates when status / updated_at / etc. change
export function useSchedule(id: string | null): Schedule | null {
  const [schedule, setSchedule] = useState<Schedule | null>(null)

  useEffect(() => {
    if (!id) {
      setSchedule(null)
      return
    }
    return onSnapshot(doc(db, 'schedules', id), d => {
      if (!d.exists()) {
        setSchedule(null)
        return
      }
      setSchedule(rawToSchedule(d.id, d.data()))
    })
  }, [id])

  return schedule
}
