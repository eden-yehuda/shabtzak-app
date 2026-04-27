import type { Soldier, Task, Assignment, TaskType } from '@/types'
import { hoursGap } from '@/utils/dateUtils'

interface Props {
  soldiers: Soldier[]
  tasks: Task[]
  assignments: Assignment[]
  taskTypes: TaskType[]
}

export default function JusticeTable({ soldiers, tasks, assignments, taskTypes }: Props) {
  const typeNames = taskTypes.map(t => t.name)

  const rows = soldiers.map(soldier => {
    const myAssignments = assignments.filter(a => a.soldier_id === soldier.id)
    const myTasks = myAssignments
      .map(a => tasks.find(t => t.id === a.task_id))
      .filter((t): t is Task => t !== undefined)

    const hoursByType: Record<string, number> = {}
    let totalHours = 0

    for (const task of myTasks) {
      const h = hoursGap(task.start_datetime, task.end_datetime)
      hoursByType[task.task_type] = (hoursByType[task.task_type] || 0) + h
      totalHours += h
    }

    return { soldier, hoursByType, totalHours, taskCount: myTasks.length }
  }).sort((a, b) => b.totalHours - a.totalHours)

  const avgHours = rows.reduce((s, r) => s + r.totalHours, 0) / (rows.length || 1)

  return (
    <div className="bg-white rounded-xl shadow overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
          <tr>
            <th className="px-4 py-3 text-right">חייל</th>
            {typeNames.map(t => (
              <th key={t} className="px-4 py-3 text-center">{t}</th>
            ))}
            <th className="px-4 py-3 text-center">{'סה"כ שעות'}</th>
            <th className="px-4 py-3 text-center">משימות</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ soldier, hoursByType, totalHours, taskCount }) => {
            const isHeavy = totalHours > avgHours + 2
            const isLight = totalHours < avgHours - 2 && avgHours > 0
            const rowClass = isHeavy ? 'bg-red-50' : isLight ? 'bg-green-50' : ''
            return (
              <tr key={soldier.id} className={rowClass}>
                <td className="px-4 py-3 font-medium">{soldier.full_name}</td>
                {typeNames.map(t => (
                  <td key={t} className="px-4 py-3 text-center text-slate-600">
                    {hoursByType[t] ? `${hoursByType[t].toFixed(1)}ש׳` : '—'}
                  </td>
                ))}
                <td className="px-4 py-3 text-center font-bold">{totalHours.toFixed(1)}ש׳</td>
                <td className="px-4 py-3 text-center text-slate-500">{taskCount}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
