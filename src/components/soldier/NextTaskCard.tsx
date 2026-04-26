import type { Task, Assignment, Soldier } from '@/types'
import { formatTime, formatHebrewDate } from '@/utils/dateUtils'

interface Props {
  tasks: Task[]
  assignments: Assignment[]
  soldierId: string
  soldiers: Soldier[]
}

export default function NextTaskCard({ tasks, assignments, soldierId, soldiers }: Props) {
  const myTaskIds = assignments
    .filter(a => a.soldier_id === soldierId)
    .map(a => a.task_id)

  const upcoming = tasks
    .filter(t => myTaskIds.includes(t.id) && t.end_datetime > new Date())
    .sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())

  const next = upcoming[0]
  if (!next) return (
    <div className="bg-slate-200 rounded-2xl p-5 text-center text-slate-500 mb-6">
      אין משימות קרובות
    </div>
  )

  const partners = assignments
    .filter(a => a.task_id === next.id && a.soldier_id !== soldierId)
    .map(a => soldiers.find(s => s.id === a.soldier_id)?.full_name)
    .filter(Boolean)

  return (
    <div className="bg-navy text-white rounded-2xl p-5 mb-6 shadow">
      <div className="text-xs opacity-70 mb-1">המשימה הבאה שלך</div>
      <div className="text-2xl font-bold mb-1">{next.task_name}</div>
      <div className="text-sm opacity-90">
        {formatHebrewDate(next.start_datetime)} · {formatTime(next.start_datetime)} — {formatTime(next.end_datetime)}
      </div>
      {partners.length > 0 && (
        <div className="text-xs opacity-70 mt-2">יחד עם: {partners.join(', ')}</div>
      )}
    </div>
  )
}
