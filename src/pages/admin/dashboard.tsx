import AdminLayout from '@/components/layout/AdminLayout'
import { useLeaveCountByDate } from '@/hooks/useLeaveRequests'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useSchedules } from '@/hooks/useSchedules'
import Link from 'next/link'

function isoDate(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export default function AdminDashboard() {
  const soldiers = useSoldiers()
  const leaveCountByDate = useLeaveCountByDate()
  const schedules = useSchedules()

  const today = new Date().toISOString().slice(0, 10)
  const todayCount = leaveCountByDate[today] || 0
  const available = soldiers.length - todayCount

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-navy mb-6">דשבורד מנהל</h1>

      {/* Stats */}
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

      {/* Action buttons */}
      <div className="flex gap-4 mb-8 flex-wrap">
        <Link href="/admin/schedule/new">
          <button className="bg-navy text-white rounded-xl px-6 py-3 font-semibold">+ שבצ&quot;ק חדש</button>
        </Link>
        <Link href="/admin/leave">
          <button className="border border-navy text-navy rounded-xl px-6 py-3 font-semibold">ניהול יציאות</button>
        </Link>
      </div>

      {/* Schedules list */}
      <div>
        <h2 className="text-base font-bold text-slate-700 mb-3" dir="rtl">שבצ&quot;קים</h2>
        {schedules.length === 0 ? (
          <p className="text-sm text-slate-400" dir="rtl">אין שבצ&quot;קים עדיין</p>
        ) : (
          <div className="space-y-2" dir="rtl">
            {schedules.map(s => (
              <Link key={s.id} href={`/admin/schedule/${s.id}`}>
                <div className="bg-white rounded-xl px-5 py-3.5 shadow-sm border border-slate-100 flex justify-between items-center hover:border-navy transition cursor-pointer">
                  <div>
                    <div className="font-semibold text-navy text-sm">{s.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {isoDate(s.start_datetime)} – {isoDate(s.end_datetime)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      s.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {s.status === 'published' ? '✓ מפורסם' : 'טיוטה'}
                    </span>
                    <span className="text-navy text-sm">✏️</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
