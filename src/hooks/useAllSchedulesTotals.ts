import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { tasksRef, assignmentsRef } from '@/lib/firestore'
import type { Task, Assignment } from '@/types'

/**
 * Live totals across ALL schedules (no schedule filter).
 * Used by Justice & Leave pages to show cumulative numbers per soldier.
 */
export function useAllSchedulesTotals() {
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [allAssignments, setAllAssignments] = useState<Assignment[]>([])

  useEffect(() => {
    return onSnapshot(tasksRef(), snap => {
      setAllTasks(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          start_datetime: data.start_datetime?.toDate?.() ?? new Date(data.start_datetime),
          end_datetime: data.end_datetime?.toDate?.() ?? new Date(data.end_datetime),
          requires_commander: data.requires_commander ?? false,
        } as Task
      }))
    })
  }, [])

  useEffect(() => {
    return onSnapshot(assignmentsRef(), snap => {
      setAllAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)))
    })
  }, [])

  return { allTasks, allAssignments }
}
