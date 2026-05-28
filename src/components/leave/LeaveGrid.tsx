import { useMemo } from 'react'
import type { Soldier, LeaveRequest } from '@/types'

interface Props {
  soldiers: Soldier[]
  requests: LeaveRequest[]        // is_final=false requests only
  dates: string[]                 // YYYY-MM-DD list
  currentSoldierId: string | null
  onToggle: (soldierId: string, date: string) => void
}

function countByDate(requests: LeaveRequest[], date: string) {
  return requests.filter(r => r.date === date && r.status !== 'rejected').length
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const days = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"]
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

export default function LeaveGrid({ soldiers, requests, dates, currentSoldierId, onToggle }: Props) {
  const sorted = useMemo(() =>
    [...soldiers]
      .filter(s => s.is_active)
      .sort((a, b) => {
        if (a.is_commander !== b.is_commander) return a.is_commander ? -1 : 1
        return a.full_name.localeCompare(b.full_name, 'he')
      }),
    [soldiers]
  )

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse min-w-full">
        <thead>
          <tr className="text-right bg-slate-50">
            <th className="px-3 py-2 font-semibold sticky right-0 bg-slate-50">שם</th>
            {dates.map(d => (
              <th key={d} className="px-2 py-2 font-semibold text-center min-w-[52px] text-xs">
                {dayLabel(d)}
              </th>
            ))}
            <th className="px-2 py-2 font-semibold text-center">סה&quot;כ</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => {
            const isMe = s.id === currentSoldierId
            const myCount = dates.filter(d =>
              requests.some(r => r.soldier_id === s.id && r.date === d && r.status !== 'rejected')
            ).length
            return (
              <tr key={s.id} className={`border-b border-slate-100 ${isMe ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <td className={`px-3 py-2 font-medium sticky right-0 ${isMe ? 'bg-blue-50' : 'bg-white'}`}>
                  {s.full_name}
                  {s.is_commander && <span className="text-xs text-navy mr-1">★</span>}
                </td>
                {dates.map(d => {
                  const has = requests.some(r => r.soldier_id === s.id && r.date === d && r.status !== 'rejected')
                  return (
                    <td key={d} className="px-1 py-1 text-center">
                      <button
                        disabled={!isMe}
                        onClick={() => isMe && onToggle(s.id, d)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                          has
                            ? 'bg-navy text-white'
                            : isMe
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                            : 'bg-slate-50 text-slate-300 cursor-default'
                        }`}
                      >
                        {has ? '✓' : ''}
                      </button>
                    </td>
                  )
                })}
                <td className="px-2 py-2 text-center text-xs font-semibold text-slate-600">{myCount}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50">
            <td className="px-3 py-2 font-semibold sticky right-0 bg-slate-50 text-sm">סה&quot;כ ביקשו</td>
            {dates.map(d => {
              const count = countByDate(requests, d)
              return (
                <td key={d} className="px-1 py-2 text-center">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    count >= 8 ? 'bg-red-100 text-red-700' :
                    count >= 6 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>{count}</span>
                </td>
              )
            })}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
