import AdminLayout from '@/components/layout/AdminLayout'
import { useLeaveCountByDate } from '@/hooks/useLeaveRequests'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useSchedules } from '@/hooks/useSchedules'
import { useUnreadInquiriesCount } from '@/hooks/useUnreadInquiries'
import Link from 'next/link'
import { deleteDoc, doc, getDocs, query, where, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase'

function isoDate(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export default function AdminDashboard() {
  const soldiers = useSoldiers()
  const leaveCountByDate = useLeaveCountByDate()
  const schedules = useSchedules()
  const unreadInquiries = useUnreadInquiriesCount()

  const today = new Date().toISOString().slice(0, 10)
  const todayCount = leaveCountByDate[today] || 0
  const available = soldiers.length - todayCount

  async function deleteSchedule(id: string, name: string) {
    if (!window.confirm(`למחוק את "${name}"? פעולה זו תמחק גם את כל המשימות והשיבוצים שלו.`)) return
    try {
      // Delete tasks and their assignments
      const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', id)))
      for (const t of tasksSnap.docs) {
        const assignSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', t.id)))
        for (const a of assignSnap.docs) await deleteDoc(doc(db, 'assignments', a.id))
        await deleteDoc(doc(db, 'tasks', t.id))
      }
      await deleteDoc(doc(db, 'schedules', id))
    } catch (e) {
      alert('שגיאה במחיקה: ' + String(e))
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-navy mb-6">דשבורד מנהל</h1>

      {/* New-inquiry notification banner — disappears once all are marked as read */}
      {unreadInquiries > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3 flex-wrap shadow-sm" dir="rtl">
          <div className="flex items-center gap-3">
            <span className="text-3xl animate-pulse">📨</span>
            <div>
              <div className="font-bold text-red-800 text-base">
                {unreadInquiries === 1 ? 'יש פנייה חדשה שלא נקראה' : `יש ${unreadInquiries} פניות חדשות שלא נקראו`}
              </div>
              <div className="text-xs text-red-600">לחץ כדי לעבור לעמוד הפניות</div>
            </div>
          </div>
          <Link href="/admin/inquiries"
            className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-red-700 transition shrink-0">
            פתח פניות ←
          </Link>
        </div>
      )}

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
              <div key={s.id} className="bg-white rounded-xl px-5 py-3.5 shadow-sm border border-slate-100 flex justify-between items-center hover:border-navy transition">
                <Link href={`/admin/schedule/${s.id}`} className="flex-1 min-w-0">
                  <div className="font-semibold text-navy text-sm">{s.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {isoDate(s.start_datetime)} – {isoDate(s.end_datetime)}
                  </div>
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                    s.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {s.status === 'published' ? '✓ מפורסם' : 'טיוטה'}
                  </span>
                  <Link href={`/admin/schedule/${s.id}`}>
                    <span className="text-navy text-sm">✏️</span>
                  </Link>
                  <button
                    onClick={() => deleteSchedule(s.id, s.name)}
                    className="text-red-400 hover:text-red-600 text-sm transition"
                    title="מחק שבצ&quot;ק"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
