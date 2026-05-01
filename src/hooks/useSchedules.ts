import { useEffect, useState } from 'react'
import { onSnapshot, orderBy, query, doc, getDoc } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'
import { db } from '@/lib/firebase'
import type { Schedule } from '@/types'

export function useSchedules(): Schedule[] {
  const [schedules, setSchedules] = useState<Schedule[]>([])

  useEffect(() => {
    const q = query(schedulesRef(), orderBy('start_datetime', 'desc'))
    return onSnapshot(q, snap => {
      setSchedules(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          start_datetime: data.start_datetime.toDate(),
          end_datetime: data.end_datetime.toDate(),
        } as Schedule
      }))
    })
  }, [])

  return schedules
}

export function useSchedule(id: string | null): Schedule | null {
  const [schedule, setSchedule] = useState<Schedule | null>(null)

  useEffect(() => {
    if (!id) return
    getDoc(doc(db, 'schedules', id)).then(d => {
      if (!d.exists()) return
      const data = d.data()
      setSchedule({
        id: d.id,
        ...data,
        start_datetime: data.start_datetime.toDate(),
        end_datetime: data.end_datetime.toDate(),
      } as Schedule)
    })
  }, [id])

  return schedule
}
