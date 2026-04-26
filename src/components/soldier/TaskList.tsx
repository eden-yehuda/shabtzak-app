import type { Task, Assignment } from '@/types'
import { formatHebrewDate, formatTime } from '@/utils/dateUtils'

const TASK_COLORS: Record<string, string> = {
  'שמירת ש.ג': 'border-blue-500',
  'פטרול': 'border-yellow-500',
  'מטבח': 'border-purple-500',
  'לוגיסטיקה': 'border-green-500',
}

interface Props {
  tasks: Task[]
  assignments: Assignment[]
  soldierId: string
}

export default function TaskList({ tasks, assignments, soldierId }: Props) {
  const myTaskIds = assignments
    .filter(a => a.soldier_id === soldierId)
    .map(a => a.task_id)

  const myTasks = tasks
    .filter(t => myTaskIds.includes(t.id))
    .sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())

  if (myTasks.length === 0) return <p className="text-slate-400 text-center py-4">אין משימות</p>

  return (
    <div className="space-y-3">
      {myTasks.map(task => {
        const done = task.end_datetime < new Date()
        const color = TASK_COLORS[task.task_name] ?? 'border-slate-400'
        return (
          <div key={task.id} className={`bg-white rounded-xl p-4 border-r-4 ${color} shadow-sm ${done ? 'opacity-60' : ''}`}>
            <div className="text-xs text-slate-400">
              {formatHebrewDate(task.start_datetime)} · {formatTime(task.start_datetime)} — {formatTime(task.end_datetime)}
              {done && ' · הסתיים'}
            </div>
            <div className="font-semibold text-slate-800 mt-0.5">{task.task_name}</div>
          </div>
        )
      })}
    </div>
  )
}
