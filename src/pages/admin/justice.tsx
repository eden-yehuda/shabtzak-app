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
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('')

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

  const usedTaskTypes = Array.from(new Set(tasks.map(t => t.task_type))).sort()

  return (
    <AdminLayout>
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <h1 className="text-xl font-bold text-navy">טבלת צדק</h1>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
        >
          {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Soldier type filter */}
      <div className="flex flex-wrap gap-2 mb-3">
        {(['all', 'commanders', 'soldiers'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === f ? 'bg-navy text-white' : 'bg-slate-100 text-slate-700'}`}>
            {f === 'all' ? 'כולם' : f === 'commanders' ? 'מפקדים' : 'לוחמים'}
          </button>
        ))}
        <span className="w-px bg-slate-300 mx-1 self-stretch" />
        <button
          onClick={() => setTaskTypeFilter('')}
          className={`px-3 py-1.5 rounded-lg text-sm ${taskTypeFilter === '' ? 'bg-navy text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          כל המשימות
        </button>
        {usedTaskTypes.map(tt => (
          <button
            key={tt}
            onClick={() => setTaskTypeFilter(tt)}
            className={`px-3 py-1.5 rounded-lg text-sm ${taskTypeFilter === tt ? 'bg-navy text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            {tt}
          </button>
        ))}
      </div>

      <JusticeTable
        tasks={tasks}
        assignments={assignments}
        soldiers={soldiers}
        taskTypes={taskTypes}
        filter={filter}
        taskTypeFilter={taskTypeFilter}
      />
    </AdminLayout>
  )
}
