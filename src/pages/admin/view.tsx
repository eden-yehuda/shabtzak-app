import { useEffect, useState } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { usePublishedSchedule } from '@/hooks/usePublishedSchedule'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'
import type { Schedule } from '@/types'

/**
 * Admin "view-only full schedule" page — meant for phone use.
 * Shows the latest published snapshot of any schedule, with NO 4-day window
 * limit and NO edit affordances. Soldier-facing data (snapshots) only.
 */
export default function AdminViewPage() {
  const soldiers = useSoldiers()
  const finalLeave = useFinalLeave()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleIdx, setScheduleIdx] = useState(0)

  useEffect(() => {
    const q = query(schedulesRef(), orderBy('start_datetime', 'desc'))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          start_datetime: data.start_datetime?.toDate?.() ?? new Date(),
          end_datetime: data.end_datetime?.toDate?.() ?? new Date(),
          updated_at: data.updated_at?.toDate?.(),
        } as Schedule
      })
      const published = all.filter(s => s.status === 'published')
      setSchedules(published)
    })
  }, [])

  // On load, jump to the schedule that contains today (if any)
  useEffect(() => {
    if (schedules.length === 0) return
    const now = new Date()
    const idx = schedules.findIndex(s =>
      s.start_datetime && s.end_datetime &&
      s.start_datetime <= now && s.end_datetime >= now
    )
    if (idx >= 0) setScheduleIdx(idx)
  }, [schedules])

  const currentSchedule = schedules[scheduleIdx] ?? null
  const { tasks, assignments } = usePublishedSchedule(currentSchedule?.id ?? null)

  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-navy mb-3">👁 שבצ&quot;ק מלא — תצוגה</h1>
      <p className="text-xs text-slate-500 mb-3">תצוגה בלבד של הגרסה האחרונה שפורסמה. מציג את כל הימים ללא הגבלה.</p>

      {schedules.length > 0 && (
        <div className="flex justify-between items-center mb-3 gap-2">
          <button
            onClick={() => setScheduleIdx(i => i + 1)}
            disabled={scheduleIdx >= schedules.length - 1}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30">
            קודם →
          </button>
          <div className="text-sm font-semibold text-navy text-center flex-1">
            {currentSchedule?.name ?? ''}
          </div>
          <button
            onClick={() => setScheduleIdx(i => i - 1)}
            disabled={scheduleIdx <= 0}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30">
            ← הבא
          </button>
        </div>
      )}

      {schedules.length === 0
        ? <p className="text-slate-400 text-center py-12">{'אין שבצ"ק פעיל'}</p>
        : tasks.length === 0
        ? <p className="text-slate-400 text-center py-12">השבצ&quot;ק לא פורסם עדיין</p>
        : (
          <ScheduleGrid
            tasks={tasks}
            assignments={assignments}
            soldiers={soldiers}
            finalLeave={finalLeave}
            dayStartHour={currentSchedule?.day_start_hour ?? 2}
            homeLeaveHour={currentSchedule?.home_leave_hour}
            showAllDays
          />
        )}
    </AdminLayout>
  )
}
