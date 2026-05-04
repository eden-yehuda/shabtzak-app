import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { publishedVersionsRef } from '@/lib/firestore'
import type { Task, Assignment } from '@/types'

/**
 * Returns the LATEST published snapshot (tasks + assignments) for a schedule.
 * Soldier-facing pages use this — never the live working copy in `tasks`/`assignments`.
 *
 * NOTE: We avoid `orderBy` in the Firestore query (would require a composite index).
 * Instead we fetch all snapshots for this schedule and pick the latest client-side.
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
    const q = query(publishedVersionsRef(), where('schedule_id', '==', scheduleId))
    return onSnapshot(q, snap => {
      if (snap.empty) {
        setTasks([])
        setAssignments([])
        setLoading(false)
        return
      }
      // Pick the latest snapshot client-side (sort by published_at desc)
      const sorted = [...snap.docs].sort((a, b) => {
        const ta = a.data().published_at?.toMillis?.() ?? 0
        const tb = b.data().published_at?.toMillis?.() ?? 0
        return tb - ta
      })
      const data = sorted[0].data()
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
        ...(a.is_acting_commander ? { is_acting_commander: true } : {}),
      } as Assignment))
      setTasks(ts)
      setAssignments(as)
      setLoading(false)
    })
  }, [scheduleId])

  return { tasks, assignments, loading }
}
