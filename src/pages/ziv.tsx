import { useEffect, useState, useMemo, useRef } from 'react'
import Layout from '@/components/layout/Layout'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { usePublishedSchedule } from '@/hooks/usePublishedSchedule'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'
import type { Schedule } from '@/types'

const USERNAME = 'זיו'
const PASSWORD = 'שבצקיסטבקוהבא'
const SESSION_KEY = 'ziv_auth'

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (user.trim() === USERNAME && pass === PASSWORD) {
      if (typeof window !== 'undefined') localStorage.setItem(SESSION_KEY, '1')
      onLogin()
    } else {
      setError(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4" dir="rtl">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-xs flex flex-col gap-4">
        <h1 className="text-xl font-bold text-navy text-center">שבצ&quot;ק צוות אוראל</h1>
        <p className="text-xs text-slate-500 text-center">כניסה לצפייה מלאה</p>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">שם משתמש</label>
          <input
            value={user}
            onChange={e => { setUser(e.target.value); setError(false) }}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy"
            placeholder="שם משתמש"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">סיסמה</label>
          <input
            type="password"
            value={pass}
            onChange={e => { setPass(e.target.value); setError(false) }}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy"
            placeholder="סיסמה"
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-xs text-red-600 text-center">שם משתמש או סיסמה שגויים</p>}
        <button type="submit"
          className="w-full bg-navy text-white rounded-xl py-2.5 font-bold text-sm mt-1">
          כניסה
        </button>
      </form>
    </div>
  )
}

export default function ZivPage() {
  const [authed, setAuthed] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAuthed(localStorage.getItem(SESSION_KEY) === '1')
    }
    setChecked(true)
  }, [])

  const soldiers = useSoldiers()
  const finalLeave = useFinalLeave()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleIdx, setScheduleIdx] = useState(0)
  const userNavigated = useRef(false)

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
      setSchedules(all.filter(s => s.status === 'published'))
    })
  }, [])

  useEffect(() => {
    if (schedules.length === 0 || userNavigated.current) return
    const now = new Date()
    const idx = schedules.findIndex(s =>
      s.start_datetime && s.end_datetime &&
      s.start_datetime <= now && s.end_datetime >= now
    )
    if (idx >= 0) setScheduleIdx(idx)
  }, [schedules])

  const currentSchedule = schedules[scheduleIdx] ?? null
  const { tasks, assignments } = usePublishedSchedule(currentSchedule?.id ?? null)

  const visibleTasks = useMemo(
    () => tasks.filter(t => t.task_type !== 'עתודה'),
    [tasks]
  )

  if (!checked) return null
  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />

  const canGoBack = scheduleIdx < schedules.length - 1
  const canGoForward = scheduleIdx > 0

  return (
    <Layout title={'שבצ"ק צוות אוראל — תצוגה מלאה'}>
      {/* Schedule nav */}
      {schedules.length > 0 && (
        <div className="flex justify-between items-center mb-3">
          <button onClick={() => { userNavigated.current = true; setScheduleIdx(i => i + 1) }} disabled={!canGoBack}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed">
            קודם →
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold text-navy">{currentSchedule?.name ?? ''}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">תצוגה מלאה — כל הימים</div>
          </div>
          <button onClick={() => { userNavigated.current = true; setScheduleIdx(i => i - 1) }} disabled={!canGoForward}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed">
            ← הבא
          </button>
        </div>
      )}

      {schedules.length === 0
        ? <p className="text-slate-400 text-center py-12">{'אין שבצ"ק פעיל'}</p>
        : tasks.length === 0
        ? <p className="text-slate-400 text-center py-12">{'השבצ"ק לא פורסם עדיין'}</p>
        : (
          <ScheduleGrid
            tasks={visibleTasks}
            assignments={assignments}
            soldiers={soldiers}
            finalLeave={finalLeave}
            dayStartHour={currentSchedule?.day_start_hour ?? 2}
            homeLeaveHour={currentSchedule?.home_leave_hour}
            showAllDays
          />
        )
      }

      <div className="mt-4 text-center">
        <button
          onClick={() => {
            if (typeof window !== 'undefined') localStorage.removeItem(SESSION_KEY)
            setAuthed(false)
          }}
          className="text-xs text-slate-400 hover:text-slate-600 underline"
        >
          התנתק
        </button>
      </div>
    </Layout>
  )
}
