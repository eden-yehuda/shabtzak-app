import { useState, useMemo } from 'react'
import { useRouter } from 'next/router'
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import AdminLayout from '@/components/layout/AdminLayout'
import { useSchedules } from '@/hooks/useSchedules'
import { useAuth } from '@/hooks/useAuth'
import { createSchedule } from '@/lib/firestore'

function isoDate(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function addDaysToDate(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

export default function NewSchedule() {
  const router = useRouter()
  const { uid } = useAuth()
  const allSchedules = useSchedules()

  const today = useMemo(() => { const d = new Date(); d.setHours(12,0,0,0); return d }, [])
  const [scheduleName, setScheduleName] = useState('')
  const [startDate, setStartDate] = useState(() => isoDate(today))
  const [endDate, setEndDate] = useState(() => isoDate(addDaysToDate(today, 7)))
  const [dayStartHour, setDayStartHour] = useState(6)
  const [homeLeaveHour, setHomeLeaveHour] = useState(14)
  const [templateId, setTemplateId] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function initSchedule() {
    if (creating || !scheduleName || !uid) return
    setCreating(true)
    setStatus('יוצר שבצ"ק...')
    try {
      const start = new Date(startDate + 'T12:00:00')
      const end   = new Date(endDate   + 'T12:00:00')
      const ref = await createSchedule({
        name: scheduleName,
        start_datetime: start,
        end_datetime: end,
        status: 'draft',
        created_by: uid,
        day_start_hour: dayStartHour,
        home_leave_hour: homeLeaveHour,
      })
      const newId = ref.id

      // ── Copy tasks from template ─────────────────────────────────────────
      if (templateId) {
        setStatus('מעתיק משימות מהתבנית...')
        const templateSchedule = allSchedules.find(s => s.id === templateId)
        if (templateSchedule) {
          const templateStart = templateSchedule.start_datetime
          const offsetMs = start.getTime() - templateStart.getTime()
          const taskSnap = await getDocs(
            query(collection(db, 'tasks'), where('schedule_id', '==', templateId))
          )
          for (const taskDoc of taskSnap.docs) {
            const td = taskDoc.data()
            const tStart = td.start_datetime?.toDate?.() ?? new Date(td.start_datetime)
            const tEnd   = td.end_datetime?.toDate?.()   ?? new Date(td.end_datetime)
            await addDoc(collection(db, 'tasks'), {
              schedule_id:           newId,
              task_type:             td.task_type,
              task_name:             td.task_name,
              start_datetime:        Timestamp.fromDate(new Date(tStart.getTime() + offsetMs)),
              end_datetime:          Timestamp.fromDate(new Date(tEnd.getTime()   + offsetMs)),
              required_people_count: td.required_people_count ?? 0,
              requires_commander:    td.requires_commander ?? false,
              difficulty:            td.difficulty ?? 'normal',
              notes:                 td.notes ?? '',
            })
          }
        }
      }

      // Redirect to full editor — has all features: ★, הזזת עמודות, undo וכו'
      router.push(`/admin/schedule/${newId}`)
    } catch (e) {
      console.error(e)
      setStatus('שגיאה ביצירת השבצ"ק — נסה שוב')
      setCreating(false)
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-navy mb-6">{'שבצ"ק חדש'}</h1>
      <div className="max-w-sm space-y-4">

        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">{'שם השבצ"ק'}</label>
          <input placeholder={'למשל: שבצ"ק שבוע 3'} value={scheduleName}
            onChange={e => setScheduleName(e.target.value)}
            disabled={creating}
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy disabled:opacity-50" />
        </div>

        {/* Date range */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-1">מתאריך</label>
            <input type="date" value={startDate} disabled={creating}
              onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value) }}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy disabled:opacity-50" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-1">עד תאריך</label>
            <input type="date" value={endDate} min={startDate} disabled={creating}
              onChange={e => setEndDate(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy disabled:opacity-50" />
          </div>
        </div>

        {/* Swap / shift times */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">שעות מעבר</p>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">תחילת יום צבאי</label>
              <select value={dayStartHour} onChange={e => setDayStartHour(Number(e.target.value))} disabled={creating}
                className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-navy disabled:opacity-50">
                {Array.from({ length: 12 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">שעת חילופים</label>
              <select value={homeLeaveHour} onChange={e => setHomeLeaveHour(Number(e.target.value))} disabled={creating}
                className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-navy disabled:opacity-50">
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Template */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">📋 העתקה מתבנית (רשות)</p>
          <p className="text-xs text-amber-600">בחר שבצ"ק קיים — כל המשימות יועתקו ויוזזו לתאריכי השבוע החדש</p>
          <select
            value={templateId}
            onChange={e => setTemplateId(e.target.value)}
            disabled={creating}
            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 bg-white disabled:opacity-50"
          >
            <option value="">ללא תבנית (שבצ"ק ריק)</option>
            {allSchedules.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.start_datetime?.toLocaleDateString?.('he-IL') ?? ''})
              </option>
            ))}
          </select>
        </div>

        {status && (
          <div className="text-sm text-slate-600 text-center py-1 animate-pulse">{status}</div>
        )}

        <button onClick={initSchedule} disabled={!scheduleName || !uid || creating}
          className="w-full bg-navy text-white rounded-xl py-3 font-semibold disabled:opacity-40 text-sm">
          {creating ? '⏳ יוצר...' : templateId ? '📋 צור שבצ"ק מתבנית →' : 'צור שבצ"ק →'}
        </button>
      </div>
    </AdminLayout>
  )
}
