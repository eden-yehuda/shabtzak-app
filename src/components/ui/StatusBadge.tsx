import type { LeaveRequest } from '@/types'

const config: Record<LeaveRequest['status'], { label: string; className: string }> = {
  pending: { label: 'ממתין', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'מאושר', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'נדחה', className: 'bg-red-100 text-red-800' },
}

export default function StatusBadge({ status }: { status: LeaveRequest['status'] }) {
  const { label, className } = config[status]
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  )
}
