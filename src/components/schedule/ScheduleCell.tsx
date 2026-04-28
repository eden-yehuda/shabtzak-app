import SoldierChip from './SoldierChip'
import type { Task, Soldier } from '@/types'

interface Props {
  task: Task | null
  assigned: Soldier[]
  currentSoldierId?: string | null
  builderMode?: boolean
  onRemoveSoldier?: (soldierId: string) => void
  onClick?: () => void
  isSelected?: boolean
}

export default function ScheduleCell({
  task, assigned, currentSoldierId, builderMode, onRemoveSoldier, onClick, isSelected
}: Props) {
  if (!task) {
    return <td className="border border-slate-100 px-2 py-2 text-center text-slate-200 text-xs">—</td>
  }

  const isMine = currentSoldierId ? assigned.some(s => s.id === currentSoldierId) : false
  const missing = task.required_people_count - assigned.length
  const needsCommander = task.requires_commander
  const hasCommander = assigned.some(s => s.is_commander)
  const commanderMissing = needsCommander && !hasCommander

  return (
    <td
      className={`border border-slate-100 px-2 py-2 align-top cursor-pointer transition ${
        isSelected ? 'bg-blue-50 ring-2 ring-navy ring-inset' :
        isMine ? 'bg-navy' :
        commanderMissing ? 'bg-red-50' :
        missing > 0 ? 'bg-orange-50' :
        'bg-white hover:bg-slate-50'
      }`}
      onClick={onClick}
    >
      <div className="flex flex-wrap gap-1 min-h-[24px]">
        {assigned.map(s => (
          <SoldierChip
            key={s.id}
            name={s.full_name}
            highlight={isMine && s.id === currentSoldierId}
            isCommander={s.is_commander}
            onRemove={builderMode && onRemoveSoldier ? () => onRemoveSoldier(s.id) : undefined}
          />
        ))}
        {missing > 0 && (
          <span className="text-xs text-orange-600 font-semibold">−{missing}</span>
        )}
        {commanderMissing && (
          <span className="text-xs text-red-600 font-semibold">★?</span>
        )}
      </div>
    </td>
  )
}
