import type { LeaveRequest } from '@/types'
import { formatHebrewDate } from '@/utils/dateUtils'
import StatusBadge from '@/components/ui/StatusBadge'

export default function LeaveList({ requests }: { requests: LeaveRequest[] }) {
  if (requests.length === 0) return <p className="text-slate-400 text-center py-2">אין בקשות</p>

  return (
    <div className="space-y-2">
      {requests.map(r => (
        <div key={r.id} className="bg-white rounded-xl px-4 py-3 flex justify-between items-center shadow-sm">
          <span className="text-sm font-medium">{formatHebrewDate(new Date(r.date))}</span>
          <StatusBadge status={r.status} />
        </div>
      ))}
    </div>
  )
}
