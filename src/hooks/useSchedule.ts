import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { tasksRef, assignmentsRef } from '@/lib/firestore'
import type { Task, Assignment } from '@/types'

export function useScheduleTasks(scheduleId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])

  useEffect(() => {
    if (!scheduleId) return
    const qTasks = query(tasksRef(), where('schedule_id', '==', scheduleId))
    const unsubTasks = onSnapshot(qTasks, snap => {
      setTasks(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          start_datetime: data.start_datetime.toDate(),
          end_datetime: data.end_datetime.toDate(),
        } as Task
      }))
    })
    return unsubTasks
  }, [scheduleId])

  useEffect(() => {
    if (!scheduleId || tasks.length === 0) return
    const taskIds = tasks.map(t => t.id)
    // Firestore 'in' query max 30 items — chunk if needed
    const chunks: string[][] = []
    for (let i = 0; i < taskIds.length; i += 30) chunks.push(taskIds.slice(i, i + 30))

    const unsubs = chunks.map(chunk => {
      const q = query(assignmentsRef(), where('task_id', 'in', chunk))
      return onSnapshot(q, snap => {
        setAssignments(prev => {
          const others = prev.filter(a => !chunk.includes(a.task_id))
          const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment))
          return [...others, ...fresh]
        })
      })
    })
    return () => unsubs.forEach(u => u())
  }, [tasks, scheduleId])

  return { tasks, assignments }
}
