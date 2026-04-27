import type { Task, Assignment, Soldier } from '@/types'
import { formatTime } from '@/utils/dateUtils'
import { deleteAssignment, deleteTask } from '@/lib/firestore'

interface Props {
  task: Task
  assignments: Assignment[]
  soldiers: Soldier[]
  isSelected: boolean
  onSelect: () => void
}

export default function TaskCard({ task, assignments, soldiers, isSelected, onSelect }: Props) {
  const assigned = assignments
    .filter(a => a.task_id === task.id)
    .map(a => soldiers.find(s => s.id === a.soldier_id))
    .filter((s): s is Soldier => s !== undefined)

  const missing = task.required_people_count - assigned.length

  return (
    <div
      onClick={onSelect}
      className={`bg-white rounded-xl p-4 shadow-sm border-2 cursor-pointer transition mb-3
        ${isSelected ? 'border-navy' : 'border-transparent hover:border-slate-300'}`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="font-semibold text-slate-800">{task.task_name}</div>
          <div className="text-xs text-slate-400">
            {formatTime(task.start_datetime)} — {formatTime(task.end_datetime)}
          </div>
        </div>
        <button
          type="button"
          onClick={async e => {
            e.stopPropagation()
            try { await deleteTask(task.id) } catch (err) { console.error('deleteTask failed', err) }
          }}
          className="text-slate-300 hover:text-red-400 text-lg leading-none"
        >×</button>
      </div>
      <div className="flex flex-wrap gap-1">
        {assigned.map(s => {
          const a = assignments.find(asn => asn.task_id === task.id && asn.soldier_id === s.id)
          return (
            <span key={s.id} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full flex items-center gap-1">
              {s.full_name}
              <button
                type="button"
                onClick={async e => {
                  e.stopPropagation()
                  const a = assignments.find(asn => asn.task_id === task.id && asn.soldier_id === s.id)
                  if (a) {
                    try { await deleteAssignment(a.id) } catch (err) { console.error('deleteAssignment failed', err) }
                  }
                }}
                className="text-blue-400 hover:text-blue-700 leading-none"
              >×</button>
            </span>
          )
        })}
        {missing > 0 && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
            {'חסר'} {missing}
          </span>
        )}
      </div>
    </div>
  )
}
