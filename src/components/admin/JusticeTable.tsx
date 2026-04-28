import { useMemo } from 'react'
import type { Task, Assignment, Soldier, TaskType } from '@/types'
import { taskDurationHours } from '@/utils/dateUtils'

interface Props {
  tasks: Task[]
  assignments: Assignment[]
  soldiers: Soldier[]
  taskTypes: TaskType[]
  filter: 'all' | 'commanders' | 'soldiers'
  taskTypeFilter: string // '' = all task types
}

const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

function formatTaskHeader(task: Task) {
  const d = task.start_datetime
  const day = DAY_NAMES[d.getDay()]
  const time = `${String(d.getHours()).padStart(2, '0')}:00`
  return { day, time, label: `${day} ${time}` }
}

export default function JusticeTable({ tasks, assignments, soldiers, taskTypes, filter, taskTypeFilter }: Props) {
  const { rows, columns, typeMap } = useMemo(() => {
    const typeMap: Record<string, TaskType> = {}
    for (const tt of taskTypes) typeMap[tt.name] = tt

    const filteredTasks = (taskTypeFilter ? tasks.filter(t => t.task_type === taskTypeFilter) : tasks)
      .slice()
      .sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())

    const filteredSoldiers = soldiers.filter(s => {
      if (!s.is_active) return false
      if (filter === 'commanders') return s.is_commander
      if (filter === 'soldiers') return !s.is_commander
      return true
    })

    const rows = filteredSoldiers.map(s => {
      const assignedTaskIds = new Set(
        assignments.filter(a => a.soldier_id === s.id).map(a => a.task_id)
      )
      const hoursByTask: Record<string, number> = {}
      let totalHours = 0
      for (const t of filteredTasks) {
        if (assignedTaskIds.has(t.id)) {
          const h = taskDurationHours(t.start_datetime, t.end_datetime)
          hoursByTask[t.id] = h
          totalHours += h
        }
      }
      return { soldier: s, hoursByTask, totalHours }
    }).sort((a, b) => b.totalHours - a.totalHours)

    return { rows, columns: filteredTasks, typeMap }
  }, [tasks, assignments, soldiers, taskTypes, filter, taskTypeFilter])

  const avgHours = rows.length > 0
    ? rows.reduce((sum, r) => sum + r.totalHours, 0) / rows.length
    : 0

  if (columns.length === 0) {
    return <p className="text-slate-400 text-center py-8">אין נתונים</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
        <thead>
          <tr className="bg-slate-50 text-right">
            <th className="px-3 py-2 font-semibold sticky right-0 bg-slate-50 z-10 border-b border-slate-200">שם</th>
            {columns.map(task => {
              const tt = typeMap[task.task_type]
              const { day, time } = formatTaskHeader(task)
              return (
                <th
                  key={task.id}
                  className={`px-2 py-2 font-semibold text-center border-b border-slate-200 ${tt?.is_emphasized ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex flex-col items-center gap-0.5 min-w-[52px]">
                    {tt && <span style={{ color: tt.color }} className="text-[10px]">● {task.task_type}</span>}
                    <span className="text-xs">{day}</span>
                    <span className="text-[10px] text-slate-500">{time}</span>
                  </div>
                </th>
              )
            })}
            <th className="px-3 py-2 font-semibold text-center border-b border-slate-200">סה&quot;כ ש׳</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ soldier, hoursByTask, totalHours }) => {
            const isHigh = avgHours > 0 && totalHours > avgHours * 1.2
            const isLow = avgHours > 0 && totalHours > 0 && totalHours < avgHours * 0.8
            return (
              <tr
                key={soldier.id}
                className={`border-b border-slate-100 ${isHigh ? 'bg-red-50' : isLow ? 'bg-green-50' : 'hover:bg-slate-50'}`}
              >
                <td className={`px-3 py-2 font-medium sticky right-0 z-10 whitespace-nowrap border-l border-slate-200 ${
                  isHigh ? 'bg-red-50' : isLow ? 'bg-green-50' : 'bg-white'
                }`}>
                  {soldier.full_name}
                  {soldier.is_commander && <span className="text-xs text-navy mr-1">★</span>}
                </td>
                {columns.map(task => {
                  const h = hoursByTask[task.id]
                  const tt = typeMap[task.task_type]
                  return (
                    <td
                      key={task.id}
                      className={`px-2 py-2 text-center ${tt?.is_emphasized ? 'bg-blue-50' : ''}`}
                    >
                      {h ? <span className="font-semibold text-navy">{h}h</span> : <span className="text-slate-300">—</span>}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-center font-bold">
                  {totalHours > 0 ? `${totalHours}h` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
