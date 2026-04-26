import AdminLayout from '@/components/layout/AdminLayout'
import LeaveTable from '@/components/admin/LeaveTable'
import { useLeaveRequests, useLeaveCountByDate } from '@/hooks/useLeaveRequests'
import { useSoldiers } from '@/hooks/useSoldiers'

export default function AdminLeave() {
  const requests = useLeaveRequests()
  const soldiers = useSoldiers()
  const leaveCountByDate = useLeaveCountByDate()

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-navy mb-6">ניהול יציאות</h1>
      <LeaveTable requests={requests} soldiers={soldiers} leaveCountByDate={leaveCountByDate} />
    </AdminLayout>
  )
}
