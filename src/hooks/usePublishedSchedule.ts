import { useEffect, useState } from 'react'
import { onSnapshot, query, where, orderBy, limit } from 'firebase/firestore'
import { publishedVersionsRef } from '@/lib/firestore'
import type { Task, Assignment } from '@/types'

/**
 * Returns the LATEST published snapshot (tasks + assignments) for a schedule.
 * Soldier-facing pages use this — never the live working copy in `tasks`/`assignments`.
 */
export function usePublishedSchedule(scheduleId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!scheduleId) {
      setTasks([])
      setAssignments([])
      setLoading(false)
      return
    }
    setLoading(true)
    const q = query(
      publishedVersionsRef(),
      where('schedule_id', '==', scheduleId),
      orderBy('published_at', 'desc'),
      limit(1)
    )
    return onSnapshot(q, snap => {
      if (snap.empty) {
        setTasks([])
        setAssignments([])
        setLoading(false)
        return
      }
      const data = snap.docs[0].data()
      const ts: Task[] = (data.tasks ?? []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        schedule_id: scheduleId,
        task_type: t.task_type as string,
        task_name: t.task_name as string,
        start_datetime: (t.start_datetime as { toDate(): Date }).toDate(),
        end_datetime: (t.end_datetime as { toDate(): Date }).toDate(),
        requires_commander: (t.requires_commander as boolean) ?? false,
        required_people_count: (t.required_people_count as number) ?? 0,
        notes: (t.notes as string) ?? '',
      } as Task))
      const as: Assignment[] = (data.assignments ?? []).map((a: Record<string, unknown>) => ({
        id: a.id as string,
        task_id: a.task_id as string,
        soldier_id: a.soldier_id as string,
        order: (a.order as number) ?? 1,
        ...(a.alternating_group ? { alternating_group: a.alternating_group as number } : {}),
        ...(a.note ? { note: a.note as string } : {}),
      } as Assignment))
      setTasks(ts)
      setAssignments(as)
      setLoading(false)
    })
  }, [scheduleId])

  return { tasks, assignments, loading }
}
