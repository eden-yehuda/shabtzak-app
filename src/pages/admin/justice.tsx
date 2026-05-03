import { useState, useEffect, useMemo } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import JusticeTable from '@/components/admin/JusticeTable'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { useAllSchedulesTotals } from '@/hooks/useAllSchedulesTotals'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { schedulesRef, taskTypesRef } from '@/lib/firestore'
import { taskDurationHours } from '@/utils/dateUtils'
import type { Schedule, TaskType } from '@/types'

const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

function isoDate(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

function daysInRange(from: Date, to: Date): string[] {
  const days: string[] = []
  const cur = new Date(from)
  cur.setHours(12, 0, 0, 0)
  const end = new Date(to)
  end.setHours(12, 0, 0, 0)
  while (cur <= end) {
    days.push(isoDate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

export default function JusticePage() {
  const soldiers = useSoldiers(false)
  const finalLeave = useFinalLeave()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [filter, setFilter] = useState<'all' | 'commanders' | 'soldiers'>('all')
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('')
  const [tab, setTab] = useState<'justice' | 'leave'>('justice')

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
  const { allTasks, allAssignments } = useAllSchedulesTotals()

  const usedTaskTypes = Array.from(new Set(tasks.map(t => t.task_type))).sort()

  const selectedSchedule = schedules.find(s => s.id === selectedId)

  // Dates for leave tab — schedule date range
  const leaveDates = useMemo(() => {
    if (!selectedSchedule?.start_datetime || !selectedSchedule?.end_datetime) return []
    return daysInRange(selectedSchedule.start_datetime, selectedSchedule.end_datetime)
  }, [selectedSchedule])

  const sortedSoldiers = useMemo(() =>
    [...soldiers]
      .filter(s => {
        if (!s.is_active) return false
        if (filter === 'commanders') return s.is_commander
        if (filter === 'soldiers') return !s.is_commander
        return true
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')),
    [soldiers, filter]
  )

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

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-slate-200">
        <button
          onClick={() => setTab('justice')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${tab === 'justice' ? 'border-navy text-navy' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          משימות
        </button>
        <button
          onClick={() => setTab('leave')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${tab === 'leave' ? 'border-navy text-navy' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          יציאות
        </button>
      </div>

      {/* Soldier type filter (shared) */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(['all', 'commanders', 'soldiers'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm ${filter === f ? 'bg-navy text-white' : 'bg-slate-100 text-slate-700'}`}>
            {f === 'all' ? 'כולם' : f === 'commanders' ? 'מפקדים' : 'לוחמים'}
          </button>
        ))}

        {tab === 'justice' && (
          <>
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
          </>
        )}
      </div>

      {tab === 'justice' && (
        <JusticeTable
          tasks={tasks}
          assignments={assignments}
          soldiers={soldiers}
          taskTypes={taskTypes}
          filter={filter}
          taskTypeFilter={taskTypeFilter}
          allTasks={allTasks}
          allAssignments={allAssignments}
        />
      )}

      {tab === 'leave' && (
        <LeaveSummary
          soldiers={sortedSoldiers}
          finalLeave={finalLeave}
          allTasks={allTasks}
          allAssignments={allAssignments}
        />
      )}
    </AdminLayout>
  )
}

// Summary view: per soldier, days at home vs days on tasks (across all schedules)
function LeaveSummary({
  soldiers, finalLeave, allTasks, allAssignments,
}: {
  soldiers: Array<{ id: string; full_name: string; is_commander: boolean }>
  finalLeave: Array<{ soldier_id: string; date: string; status: string }>
  allTasks: Array<{ id: string; start_datetime: Date; end_datetime: Date }>
  allAssignments: Array<{ task_id: string; soldier_id: string }>
}) {
  // Days each soldier had a task assignment
  const taskDaysBySoldier = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    const taskById = new Map(allTasks.map(t => [t.id, t]))
    for (const a of allAssignments) {
      const t = taskById.get(a.task_id)
      if (!t) continue
      if (!map[a.soldier_id]) map[a.soldier_id] = new Set()
      map[a.soldier_id].add(isoDate(t.start_datetime))
    }
    return map
  }, [allTasks, allAssignments])

  // Days each soldier was at home (approved leave)
  const homeDaysBySoldier = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const r of finalLeave) {
      if (r.status !== 'approved') continue
      if (!map[r.soldier_id]) map[r.soldier_id] = new Set()
      map[r.soldier_id].add(r.date)
    }
    return map
  }, [finalLeave])

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse w-full max-w-2xl">
        <thead>
          <tr className="bg-slate-50 text-right">
            <th className="px-4 py-2 font-semibold border-b border-slate-200">שם</th>
            <th className="px-4 py-2 text-center font-semibold border-b border-slate-200">🏠 ימי בית</th>
            <th className="px-4 py-2 text-center font-semibold border-b border-slate-200">📋 ימי משימות</th>
            <th className="px-4 py-2 text-center font-semibold border-b border-slate-200">סה&quot;כ ימים</th>
          </tr>
        </thead>
        <tbody>
          {soldiers.map(s => {
            const homeDays = homeDaysBySoldier[s.id]?.size ?? 0
            const taskDays = taskDaysBySoldier[s.id]?.size ?? 0
            return (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium whitespace-nowrap">
                  {s.full_name}
                  {s.is_commander && <span className="text-xs text-navy mr-1">★</span>}
                </td>
                <td className="px-4 py-2 text-center">
                  {homeDays > 0
                    ? <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">{homeDays}</span>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-2 text-center">
                  {taskDays > 0
                    ? <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">{taskDays}</span>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-2 text-center font-bold text-slate-700">
                  {homeDays + taskDays}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
