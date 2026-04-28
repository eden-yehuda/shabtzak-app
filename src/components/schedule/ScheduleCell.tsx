import type { Task, Soldier } from '@/types'

interface Props {
  task: Task | null
  assigned: Soldier[]
  currentSoldierId?: string | null
  builderMode?: boolean
  onRemoveSoldier?: (soldierId: string) => void
  onClick?: () => void
  isSelected?: boolean
  rowSpan?: number
}

// assigned[0] is the task commander (bold), rest are regular
export default function ScheduleCell({
  task, assigned, currentSoldierId, builderMode, onRemoveSoldier, onClick, isSelected, rowSpan
}: Props) {
  if (!task) {
    return (
      <td
        rowSpan={rowSpan}
        className="border border-slate-100 bg-slate-50 h-7 text-center align-middle"
      />
    )
  }

  const isMine = currentSoldierId ? assigned.some(s => s.id === currentSoldierId) : false
  const missing = task.required_people_count - assigned.length
  const commanderMissing = task.requires_commander && !assigned.some(s => s.is_commander)

  return (
    <td
      rowSpan={rowSpan}
      className={`border border-slate-200 px-2 py-1 text-center align-middle transition ${
        onClick ? 'cursor-pointer' : ''
      } ${
        isSelected ? 'bg-blue-50 ring-2 ring-navy ring-inset' :
        isMine ? 'bg-navy text-white' :
        commanderMissing ? 'bg-red-50' :
        missing > 0 ? 'bg-orange-50' :
        'bg-white'
      }`}
      onClick={onClick}
    >
      <div className="space-y-0.5">
        {assigned.map((s, idx) => (
          <div
            key={s.id}
            className={`text-xs leading-snug ${idx === 0 ? 'font-bold' : ''}`}
          >
            {s.full_name}
            {builderMode && onRemoveSoldier && (
              <button
                onClick={e => { e.stopPropagation(); onRemoveSoldier(s.id) }}
                className="mr-1 text-slate-300 hover:text-red-500 leading-none"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {missing > 0 && (
          <div className="text-orange-600 font-semibold text-xs">−{missing}</div>
        )}
        {commanderMissing && (
          <div className="text-red-600 font-semibold text-xs">★?</div>
        )}
      </div>
    </td>
  )
}
