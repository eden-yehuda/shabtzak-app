import { useMemo } from 'react'
import type { Task, Assignment, Soldier, TaskType } from '@/types'
import { taskDurationHours } from '@/utils/dateUtils'

interface Props {
  tasks: Task[]
  assignments: Assignment[]
  soldiers: Soldier[]
  taskTypes: TaskType[]
  filter: 'all' | 'commanders' | 'soldiers'
}

export default function JusticeTable({ tasks, assignments, soldiers, taskTypes, filter }: Props) {
  const { rows, columns } = useMemo(() => {
    const usedTypeNames = Array.from(new Set(tasks.map(t => t.task_type)))
    const columns = taskTypes
      .filter(tt => usedTypeNames.includes(tt.name))
      .sort((a, b) => {
        if (a.is_emphasized && !b.is_emphasized) return -1
        if (!a.is_emphasized && b.is_emphasized) return 1
        return a.name.localeCompare(b.name, 'he')
      })

    const filteredSoldiers = soldiers.filter(s => {
      if (!s.is_active) return false
      if (filter === 'commanders') return s.is_commander
      if (filter === 'soldiers') return !s.is_commander
      return true
    })

    const rows = filteredSoldiers.map(s => {
      const myAssignments = assignments.filter(a => a.soldier_id === s.id)
      const myTasks = myAssignments
        .map(a => tasks.find(t => t.id === a.task_id))
        .filter((t): t is Task => !!t)

      const hoursByType: Record<string, number> = {}
      for (const col of columns) {
        const typeTasks = myTasks.filter(t => t.task_type === col.name)
        hoursByType[col.name] = typeTasks.reduce(
          (sum, t) => sum + taskDurationHours(t.start_datetime, t.end_datetime), 0
        )
      }

      const totalHours = Object.values(hoursByType).reduce((a, b) => a + b, 0)
      const totalTasks = myTasks.length

      return { soldier: s, hoursByType, totalHours, totalTasks }
    }).sort((a, b) => b.totalHours - a.totalHours)

    return { rows, columns }
  }, [tasks, assignments, soldiers, taskTypes, filter])

  const avgHours = rows.length > 0
    ? rows.reduce((sum, r) => sum + r.totalHours, 0) / rows.length
    : 0

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 text-right">
            <th className="px-3 py-2 font-semibold sticky right-0 bg-slate-50">שם</th>
            {columns.map(col => (
              <th
                key={col.name}
                className={`px-3 py-2 font-semibold text-center ${col.is_emphasized ? 'bg-blue-50' : ''}`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span style={{ color: col.color }}>●</span>
                  <span>{col.name}</span>
                </div>
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-center">סה&quot;כ שעות</th>
            <th className="px-3 py-2 font-semibold text-center">משימות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ soldier, hoursByType, totalHours, totalTasks }) => {
            const isHigh = avgHours > 0 && totalHours > avgHours * 1.2
            const isLow = avgHours > 0 && totalHours < avgHours * 0.8
            return (
              <tr
                key={soldier.id}
                className={`border-b border-slate-100 ${
                  isHigh ? 'bg-red-50' : isLow ? 'bg-green-50' : 'hover:bg-slate-50'
                }`}
              >
                <td className={`px-3 py-2 font-medium sticky right-0 ${
                  isHigh ? 'bg-red-50' : isLow ? 'bg-green-50' : 'bg-white'
                }`}>
                  {soldier.full_name}
                  {soldier.is_commander && <span className="text-xs text-navy mr-1">★</span>}
                </td>
                {columns.map(col => (
                  <td
                    key={col.name}
                    className={`px-3 py-2 text-center ${col.is_emphasized ? 'bg-blue-50 font-semibold' : ''}`}
                  >
                    {hoursByType[col.name] > 0 ? `${hoursByType[col.name]}h` : '—'}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-bold">
                  {totalHours > 0 ? `${totalHours}h` : '—'}
                </td>
                <td className="px-3 py-2 text-center text-slate-500">{totalTasks}</td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 3} className="text-center py-8 text-slate-400">
                אין נתונים
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
