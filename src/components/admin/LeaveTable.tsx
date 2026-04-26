import type { LeaveRequest, Soldier } from '@/types'
import StatusBadge from '@/components/ui/StatusBadge'
import { updateLeaveStatus } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'
import { formatHebrewDate } from '@/utils/dateUtils'

interface Props {
  requests: LeaveRequest[]
  soldiers: Soldier[]
  leaveCountByDate: Record<string, number>
}

export default function LeaveTable({ requests, soldiers, leaveCountByDate }: Props) {
  const { uid } = useAuth()

  const sorted = [...requests].sort((a, b) => a.date.localeCompare(b.date))

  async function approve(id: string) {
    if (uid) await updateLeaveStatus(id, 'approved', uid)
  }
  async function reject(id: string) {
    if (uid) await updateLeaveStatus(id, 'rejected', uid)
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
          <tr>
            <th className="px-4 py-3 text-right">חייל</th>
            <th className="px-4 py-3 text-right">תאריך</th>
            <th className="px-4 py-3 text-right">כמה בבית</th>
            <th className="px-4 py-3 text-right">סטטוס</th>
            <th className="px-4 py-3 text-right">פעולה</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map(r => {
            const soldier = soldiers.find(s => s.id === r.soldier_id)
            const count = leaveCountByDate[r.date] || 0
            const countColor = count >= 8 ? 'text-red-600' : count >= 6 ? 'text-yellow-600' : 'text-green-600'
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{soldier?.full_name ?? '—'}</td>
                <td className="px-4 py-3">{formatHebrewDate(new Date(r.date + 'T12:00:00Z'))}</td>
                <td className={`px-4 py-3 font-semibold ${countColor}`}>{count}/8</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3">
                  {r.status === 'pending' && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => approve(r.id)} className="text-green-600 hover:underline text-xs font-semibold">אשר</button>
                      <button type="button" onClick={() => reject(r.id)} className="text-red-500 hover:underline text-xs font-semibold">דחה</button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center text-slate-400 py-8">אין בקשות</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
