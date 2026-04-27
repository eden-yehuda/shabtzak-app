import { useEffect, useState } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import JusticeTable from '@/components/admin/JusticeTable'
import { useSoldiers } from '@/hooks/useSoldiers'
import { getDocs } from 'firebase/firestore'
import { tasksRef, assignmentsRef, taskTypesRef } from '@/lib/firestore'
import type { Task, Assignment, TaskType } from '@/types'

export default function Justice() {
  const soldiers = useSoldiers(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    Promise.all([
      getDocs(tasksRef()),
      getDocs(assignmentsRef()),
      getDocs(taskTypesRef()),
    ]).then(([taskSnap, assignSnap, typeSnap]) => {
      if (!mounted) return
      setTasks(taskSnap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id, ...data,
          start_datetime: data.start_datetime.toDate(),
          end_datetime: data.end_datetime.toDate(),
        } as Task
      }))
      setAssignments(assignSnap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)))
      setTaskTypes(typeSnap.docs.map(d => ({ id: d.id, ...d.data() } as TaskType)))
      setLoading(false)
    }).catch(err => {
      console.error('Failed to load justice data', err)
      if (mounted) setLoading(false)
    })
    return () => { mounted = false }
  }, [])

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-navy mb-6">טבלת צדק</h1>
      <p className="text-sm text-slate-500 mb-4">אדום = עומס יתר, ירוק = מתחת לממוצע. מחושב על כלל ההיסטוריה.</p>
      {loading ? (
        <p className="text-slate-400 text-sm">טוען נתונים...</p>
      ) : (
        <JusticeTable soldiers={soldiers} tasks={tasks} assignments={assignments} taskTypes={taskTypes} />
      )}
    </AdminLayout>
  )
}
