import { useState } from 'react'
import type { Soldier, Assignment, Task } from '@/types'
import { createAssignment } from '@/lib/firestore'
import { hoursGap } from '@/utils/dateUtils'

interface Props {
  soldiers: Soldier[]
  assignments: Assignment[]
  tasks: Task[]
  selectedTaskId: string | null
}

function getSoldierInfo(
  soldier: Soldier,
  assignments: Assignment[],
  tasks: Task[],
  selectedTaskId: string | null
) {
  const myAssignments = assignments.filter(a => a.soldier_id === soldier.id)
  const myTasks = myAssignments
    .map(a => tasks.find(t => t.id === a.task_id))
    .filter((t): t is Task => t !== undefined)

  const taskCount = myTasks.length
  const isAssignedToSelected = selectedTaskId
    ? myAssignments.some(a => a.task_id === selectedTaskId)
    : false

  let restHours: number | null = null
  if (selectedTaskId) {
    const selected = tasks.find(t => t.id === selectedTaskId)
    if (selected) {
      const prevTasks = myTasks
        .filter(t => t.end_datetime <= selected.start_datetime)
        .sort((a, b) => b.end_datetime.getTime() - a.end_datetime.getTime())
      if (prevTasks.length > 0) {
        restHours = hoursGap(prevTasks[0].end_datetime, selected.start_datetime)
      }
    }
  }

  return { taskCount, isAssignedToSelected, restHours }
}

export default function SoldierPanel({ soldiers, assignments, tasks, selectedTaskId }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function assign(soldierId: string) {
    if (!selectedTaskId || isSubmitting) return
    const alreadyAssigned = assignments.some(
      a => a.task_id === selectedTaskId && a.soldier_id === soldierId
    )
    if (!alreadyAssigned) {
      setIsSubmitting(true)
      try { await createAssignment(selectedTaskId, soldierId) }
      catch (err) { console.error('createAssignment failed', err) }
      finally { setIsSubmitting(false) }
    }
  }

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">
        {selectedTaskId ? 'לחץ לשיבוץ' : 'בחר משימה לשיבוץ'}
      </div>
      <div className="space-y-2">
        {soldiers.map(s => {
          const { taskCount, isAssignedToSelected, restHours } = getSoldierInfo(s, assignments, tasks, selectedTaskId)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => assign(s.id)}
              disabled={!selectedTaskId || isAssignedToSelected}
              className={`w-full flex justify-between items-center px-3 py-2 rounded-lg border transition text-sm
                ${isAssignedToSelected ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-slate-50 border-slate-200 hover:border-navy hover:bg-white'}
                ${!selectedTaskId ? 'cursor-default' : ''}
              `}
            >
              <span className="font-medium">{s.full_name}</span>
              <div className="flex gap-2 items-center text-xs text-slate-500">
                {restHours !== null && restHours < 6 && (
                  <span className="text-yellow-600">{restHours.toFixed(0)}{"'ש"}</span>
                )}
                <span>{taskCount} {'משימות'}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
