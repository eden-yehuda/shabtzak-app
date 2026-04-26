import AdminLayout from '@/components/layout/AdminLayout'
import { useLeaveCountByDate } from '@/hooks/useLeaveRequests'
import { useSoldiers } from '@/hooks/useSoldiers'
import Link from 'next/link'

export default function AdminDashboard() {
  const soldiers = useSoldiers()
  const leaveCountByDate = useLeaveCountByDate()

  const today = new Date().toISOString().slice(0, 10)
  const todayCount = leaveCountByDate[today] || 0
  const available = soldiers.length - todayCount

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-navy mb-6">דשבורד מנהל</h1>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow text-center">
          <div className="text-3xl font-bold text-navy">{soldiers.length}</div>
          <div className="text-sm text-slate-500">סה&quot;כ לוחמים</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow text-center">
          <div className={`text-3xl font-bold ${todayCount >= 8 ? 'text-red-500' : todayCount >= 6 ? 'text-yellow-500' : 'text-green-500'}`}>
            {todayCount}
          </div>
          <div className="text-sm text-slate-500">בבית היום</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow text-center">
          <div className="text-3xl font-bold text-slate-700">{available}</div>
          <div className="text-sm text-slate-500">זמינים</div>
        </div>
      </div>
      <div className="flex gap-4">
        <Link href="/admin/schedule/new">
          <button className="bg-navy text-white rounded-xl px-6 py-3 font-semibold">+ שבצ&quot;ק חדש</button>
        </Link>
        <Link href="/admin/leave">
          <button className="border border-navy text-navy rounded-xl px-6 py-3 font-semibold">ניהול יציאות</button>
        </Link>
      </div>
    </AdminLayout>
  )
}
