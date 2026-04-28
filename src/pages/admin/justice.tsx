import { useState, useEffect } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import JusticeTable from '@/components/admin/JusticeTable'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { schedulesRef, taskTypesRef } from '@/lib/firestore'
import type { Schedule, TaskType } from '@/types'

export default function JusticePage() {
  const soldiers = useSoldiers(false)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [filter, setFilter] = useState<'all' | 'commanders' | 'soldiers'>('all')

  useEffect(() => {
    return onSnapshot(query(schedulesRef(), orderBy('start_datetime', 'desc')), snap => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        start_datetime: d.data().start_datetime?.toDate(),
        end_datetime: d.data().end_datetime?.toDate(),
      } as Schedule))
      setSchedules(list)
      if (!selectedId && list.length > 0) setSelectedId(list[0].id)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return onSnapshot(taskTypesRef(), snap => {
      setTaskTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskType)))
    })
  }, [])

  const { tasks, assignments } = useScheduleTasks(selectedId || null)

  return (
    <AdminLayout>
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <h1 className="text-xl font-bold text-navy">טבלת צדק</h1>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
        >
          {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="flex gap-1">
          {(['all', 'commanders', 'soldiers'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm ${filter === f ? 'bg-navy text-white' : 'bg-slate-100'}`}>
              {f === 'all' ? 'הכל' : f === 'commanders' ? 'מפקדים' : 'לוחמים'}
            </button>
          ))}
        </div>
      </div>
      <JusticeTable
        tasks={tasks}
        assignments={assignments}
        soldiers={soldiers}
        taskTypes={taskTypes}
        filter={filter}
      />
    </AdminLayout>
  )
}
