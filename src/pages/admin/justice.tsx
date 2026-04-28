import { useState, useEffect, useMemo } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import JusticeTable from '@/components/admin/JusticeTable'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { schedulesRef, taskTypesRef } from '@/lib/firestore'
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
        />
      )}

      {tab === 'leave' && (
        <div className="overflow-x-auto">
          {leaveDates.length === 0
            ? <p className="text-slate-400 text-center py-8">בחר שבצ&quot;ק עם טווח תאריכים</p>
            : (
              <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
                <thead>
                  <tr className="bg-slate-50 text-right">
                    <th className="px-3 py-2 font-semibold sticky right-0 bg-slate-50 z-10 border-b border-slate-200">שם</th>
                    {leaveDates.map(d => (
                      <th key={d} className="px-2 py-2 text-center font-semibold border-b border-slate-200 min-w-[52px] text-xs">
                        {dayLabel(d)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-semibold border-b border-slate-200">סה&quot;כ</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSoldiers.map(s => {
                    const count = leaveDates.filter(d =>
                      finalLeave.some(r => r.soldier_id === s.id && r.date === d && r.status === 'approved')
                    ).length
                    return (
                      <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium sticky right-0 bg-white z-10 whitespace-nowrap border-l border-slate-200">
                          {s.full_name}
                          {s.is_commander && <span className="text-xs text-navy mr-1">★</span>}
                        </td>
                        {leaveDates.map(d => {
                          const onLeave = finalLeave.some(r => r.soldier_id === s.id && r.date === d && r.status === 'approved')
                          return (
                            <td key={d} className="px-1 py-1 text-center">
                              {onLeave
                                ? <span className="inline-block w-7 h-7 rounded-md bg-blue-100 text-blue-700 text-xs font-bold leading-7">✓</span>
                                : <span className="text-slate-200 text-xs">—</span>}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-center font-bold text-sm">
                          {count > 0 ? count : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    <td className="px-3 py-2 sticky right-0 bg-slate-50 z-10 text-slate-600 text-xs">בחוץ</td>
                    {leaveDates.map(d => {
                      const n = finalLeave.filter(r => r.date === d && r.status === 'approved').length
                      return (
                        <td key={d} className="px-1 py-2 text-center">
                          {n > 0
                            ? <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${n >= 8 ? 'bg-red-100 text-red-700' : n >= 6 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{n}</span>
                            : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                      )
                    })}
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
        </div>
      )}
    </AdminLayout>
  )
}
