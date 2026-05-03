import { useMemo } from 'react'
import type { Task, Assignment, Soldier, TaskType } from '@/types'
import { taskDurationHours } from '@/utils/dateUtils'

interface Props {
  tasks: Task[]
  assignments: Assignment[]
  soldiers: Soldier[]
  taskTypes: TaskType[]
  filter: 'all' | 'commanders' | 'soldiers'
  taskTypeFilter: string // '' = grouped by type, else show individual tasks of that type
  allTasks?: Task[]        // optional: tasks across all schedules (for grand-total column)
  allAssignments?: Assignment[]  // optional: assignments across all schedules
}

const TYPE_ORDER = ['כ"כ א', 'כ"כ ב', 'אחורית', 'ש"ג', 'של"ז']
const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

function SoldierRows({
  rows, avgHours, grandTotalsBySoldier,
}: {
  rows: { soldier: Soldier; cells: (number | null)[]; total: number }[]
  avgHours: number
  grandTotalsBySoldier?: Record<string, number>
}) {
  return (
    <>
      {rows.map(({ soldier, cells, total }) => {
        const isHigh = avgHours > 0 && total > avgHours * 1.2
        const isLow = avgHours > 0 && total > 0 && total < avgHours * 0.8
        const rowBg = isHigh ? 'bg-red-50' : isLow ? 'bg-green-50' : ''
        const grandTotal = grandTotalsBySoldier?.[soldier.id] ?? 0
        return (
          <tr key={soldier.id} className={`border-b border-slate-100 ${rowBg || 'hover:bg-slate-50'}`}>
            <td className={`px-3 py-2 font-medium sticky right-0 z-10 whitespace-nowrap border-l border-slate-200 ${rowBg || 'bg-white'}`}>
              {soldier.full_name}
              {soldier.is_commander && <span className="text-xs text-navy mr-1">★</span>}
            </td>
            {cells.map((h, i) => (
              <td key={i} className="px-2 py-2 text-center">
                {h != null ? <span className="font-semibold text-navy">{h}h</span> : <span className="text-slate-300">—</span>}
              </td>
            ))}
            <td className="px-3 py-2 text-center font-bold">
              {total > 0 ? `${total}h` : '—'}
            </td>
            {grandTotalsBySoldier && (
              <td className="px-3 py-2 text-center font-bold bg-slate-50 border-r-2 border-slate-300 text-purple-800">
                {grandTotal > 0 ? `${grandTotal}h` : '—'}
              </td>
            )}
          </tr>
        )
      })}
    </>
  )
}

export default function JusticeTable({ tasks, assignments, soldiers, taskTypes, filter, taskTypeFilter, allTasks, allAssignments }: Props) {
  // Grand totals across ALL schedules (per soldier)
  const grandTotalsBySoldier = useMemo(() => {
    if (!allTasks || !allAssignments) return undefined
    const totals: Record<string, number> = {}
    const taskById = new Map(allTasks.map(t => [t.id, t]))
    for (const a of allAssignments) {
      const t = taskById.get(a.task_id)
      if (!t) continue
      totals[a.soldier_id] = (totals[a.soldier_id] ?? 0) + taskDurationHours(t.start_datetime, t.end_datetime)
    }
    return totals
  }, [allTasks, allAssignments])

  const typeMap = useMemo(() => {
    const m: Record<string, TaskType> = {}
    for (const tt of taskTypes) m[tt.name] = tt
    return m
  }, [taskTypes])

  const filteredSoldiers = useMemo(() =>
    soldiers.filter(s => {
      if (!s.is_active) return false
      if (filter === 'commanders') return s.is_commander
      if (filter === 'soldiers') return !s.is_commander
      return true
    }),
    [soldiers, filter]
  )

  // === GROUPED VIEW: columns = task types ===
  const grouped = useMemo(() => {
    if (taskTypeFilter !== '') return null

    const usedTypes = Array.from(new Set(tasks.map(t => t.task_type)))
    const cols = [
      ...TYPE_ORDER.filter(t => usedTypes.includes(t)),
      ...usedTypes.filter(t => !TYPE_ORDER.includes(t)),
    ]

    const rows = filteredSoldiers.map(s => {
      const byType: Record<string, number> = {}
      let total = 0
      for (const t of tasks) {
        if (assignments.some(a => a.task_id === t.id && a.soldier_id === s.id)) {
          const h = taskDurationHours(t.start_datetime, t.end_datetime)
          byType[t.task_type] = (byType[t.task_type] ?? 0) + h
          total += h
        }
      }
      return { soldier: s, cells: cols.map(c => byType[c] ?? null), total }
    }).sort((a, b) => b.total - a.total)

    return { cols, rows }
  }, [tasks, assignments, filteredSoldiers, taskTypeFilter])

  // === INDIVIDUAL VIEW: columns = individual task instances of selected type ===
  const individual = useMemo(() => {
    if (taskTypeFilter === '') return null

    const cols = tasks
      .filter(t => t.task_type === taskTypeFilter)
      .sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())

    const rows = filteredSoldiers.map(s => {
      let total = 0
      const cells = cols.map(t => {
        if (assignments.some(a => a.task_id === t.id && a.soldier_id === s.id)) {
          const h = taskDurationHours(t.start_datetime, t.end_datetime)
          total += h
          return h
        }
        return null
      })
      return { soldier: s, cells, total }
    }).sort((a, b) => b.total - a.total)

    return { cols, rows }
  }, [tasks, assignments, filteredSoldiers, taskTypeFilter])

  const avgHours = useMemo(() => {
    const rows = grouped?.rows ?? individual?.rows ?? []
    return rows.length > 0 ? rows.reduce((s, r) => s + r.total, 0) / rows.length : 0
  }, [grouped, individual])

  if (!grouped && !individual) return <p className="text-slate-400 text-center py-8">אין נתונים</p>

  // Grouped view
  if (grouped) {
    const { cols, rows } = grouped
    if (cols.length === 0) return <p className="text-slate-400 text-center py-8">אין נתונים</p>
    return (
      <div className="overflow-x-auto">
        <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
          <thead>
            <tr className="bg-slate-50 text-right">
              <th className="px-3 py-2 font-semibold sticky right-0 bg-slate-50 z-10 border-b border-slate-200">שם</th>
              {cols.map(type => {
                const tt = typeMap[type]
                return (
                  <th key={type} className="px-3 py-2 font-semibold text-center border-b border-slate-200 min-w-[80px]">
                    {tt
                      ? <span style={{ color: tt.color }} className="text-xs font-bold">● {type}</span>
                      : <span className="text-xs text-slate-600">{type}</span>}
                  </th>
                )
              })}
              <th className="px-3 py-2 font-semibold text-center border-b border-slate-200">סה&quot;כ ש׳</th>
              {grandTotalsBySoldier && (
                <th className="px-3 py-2 font-semibold text-center border-b border-slate-200 bg-purple-50 text-purple-800 border-r-2 border-slate-300">
                  סה&quot;כ כל השבצ&quot;קים
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            <SoldierRows rows={rows} avgHours={avgHours} grandTotalsBySoldier={grandTotalsBySoldier} />
          </tbody>
        </table>
      </div>
    )
  }

  // Individual view
  const { cols, rows } = individual!
  if (cols.length === 0) return <p className="text-slate-400 text-center py-8">אין נתונים</p>
  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse" style={{ minWidth: 'max-content' }}>
        <thead>
          <tr className="bg-slate-50 text-right">
            <th className="px-3 py-2 font-semibold sticky right-0 bg-slate-50 z-10 border-b border-slate-200">שם</th>
            {cols.map(task => {
              const d = task.start_datetime
              return (
                <th key={task.id} className="px-2 py-2 font-semibold text-center border-b border-slate-200 min-w-[52px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs">{DAY_NAMES[d.getDay()]}</span>
                    <span className="text-[10px] text-slate-500">{String(d.getHours()).padStart(2, '0')}:00</span>
                  </div>
                </th>
              )
            })}
            <th className="px-3 py-2 font-semibold text-center border-b border-slate-200">סה&quot;כ ש׳</th>
            {grandTotalsBySoldier && (
              <th className="px-3 py-2 font-semibold text-center border-b border-slate-200 bg-purple-50 text-purple-800 border-r-2 border-slate-300">
                סה&quot;כ כל השבצ&quot;קים
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          <SoldierRows rows={rows} avgHours={avgHours} grandTotalsBySoldier={grandTotalsBySoldier} />
        </tbody>
      </table>
    </div>
  )
}
