import { useEffect, useState, useMemo, useRef } from 'react'
import Layout from '@/components/layout/Layout'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import InquiryModal from '@/components/InquiryModal'
import LeaveRequestModal from '@/components/LeaveRequestModal'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { onSnapshot, query, orderBy, doc } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'
import { db } from '@/lib/firebase'
import type { Schedule } from '@/types'

interface SurveySettings { is_open: boolean; from: string; to: string; max_days: number }

function formatUpdatedAt(d: Date): string {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  const day = days[d.getDay()]
  const date = `${d.getDate()}/${d.getMonth() + 1}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${day} ${date} ${time}`
}

export default function HomePage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [schedulesLoading, setSchedulesLoading] = useState(true)
  const [scheduleIdx, setScheduleIdx] = useState(0)
  const userNavigated = useRef(false) // user manually navigated — don't override
  const soldiers = useSoldiers()
  const finalLeave = useFinalLeave()

  const [selectedSoldierId, setSelectedSoldierId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [myTasksOnly, setMyTasksOnly] = useState(false)
  const [showInquiry, setShowInquiry] = useState(false)
  const [showLeave, setShowLeave] = useState(false)
  const [survey, setSurvey] = useState<SurveySettings | null>(null)

  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'leave_survey'), snap => {
      if (snap.exists()) setSurvey(snap.data() as SurveySettings)
      else setSurvey(null)
    })
  }, [])

  // Load saved soldier from localStorage
  useEffect(() => {
    const savedId = typeof window !== 'undefined' ? localStorage.getItem('soldierId') : null
    const savedName = typeof window !== 'undefined' ? localStorage.getItem('soldierName') : null
    if (savedId) setSelectedSoldierId(savedId)
    if (savedName) setSearch(savedName)
  }, [])

  // Load published schedules sorted by start_datetime desc
  useEffect(() => {
    const q = query(schedulesRef(), orderBy('start_datetime', 'desc'))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        start_datetime: d.data().start_datetime?.toDate(),
        end_datetime: d.data().end_datetime?.toDate(),
        updated_at: d.data().updated_at?.toDate(),
      } as Schedule))
      const published = all.filter(s => s.status === 'published')
      setSchedules(published)
      setSchedulesLoading(false)
    })
  }, [])

  // On every schedules update, jump to the schedule that contains today —
  // unless the user has manually navigated away.
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
  const { tasks, assignments } = useScheduleTasks(currentSchedule?.id ?? null)

  const filteredSoldiers = useMemo(() =>
    soldiers.filter(s => s.full_name.includes(search)).slice(0, 20),
    [soldiers, search]
  )

  function selectSoldier(id: string, name: string) {
    setSelectedSoldierId(id)
    setSearch(name)
    setShowDropdown(false)
    if (typeof window !== 'undefined') {
      localStorage.setItem('soldierId', id)
      localStorage.setItem('soldierName', name)
    }
  }

  function clearSoldier() {
    setSelectedSoldierId(null)
    setSearch('')
    setMyTasksOnly(false)
    if (typeof window !== 'undefined') {
      localStorage.removeItem('soldierId')
      localStorage.removeItem('soldierName')
    }
  }

  const canGoBack = scheduleIdx < schedules.length - 1
  const canGoForward = scheduleIdx > 0

  const visibleTasks = useMemo(() => {
    // Never show עתודה in the published soldier-facing view
    let filtered = tasks.filter(t => t.task_type !== 'עתודה')
    if (myTasksOnly && selectedSoldierId) {
      filtered = filtered.filter(t =>
        assignments.some(a => a.task_id === t.id && a.soldier_id === selectedSoldierId)
      )
    }
    return filtered
  }, [tasks, assignments, myTasksOnly, selectedSoldierId])

  const navActions = (
    <>
      {survey?.is_open && (
        <button
          onClick={() => setShowLeave(true)}
          className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg font-semibold transition"
        >
          📅 סקר יציאות
        </button>
      )}
      <button
        onClick={() => setShowInquiry(true)}
        className="text-xs opacity-80 hover:opacity-100 text-white transition"
      >
        📨 פניות
      </button>
    </>
  )

  return (
    <Layout title={'שבצ"ק צוות אוראל'} navActions={navActions}>
      {/* Soldier selector */}
      <div className="relative mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              placeholder="חפש שם..."
              className="w-full border border-slate-300 rounded-xl px-4 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-navy"
            />
            {showDropdown && filteredSoldiers.length > 0 && (
              <div className="absolute top-full right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto mt-1">
                {filteredSoldiers.map(s => (
                  <button key={s.id} onClick={() => selectSoldier(s.id, s.full_name)}
                    className="w-full text-right px-4 py-2 text-sm text-slate-900 hover:bg-slate-50 transition">
                    {s.full_name}
                  </button>
                ))}
              </div>
            )}
            {showDropdown && filteredSoldiers.length === 0 && search.length > 0 && (
              <div className="absolute top-full right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 mt-1">
                <p className="px-4 py-2 text-sm text-slate-400">לא נמצא</p>
              </div>
            )}
          </div>
          {selectedSoldierId && (
            <button onClick={clearSoldier}
              className="text-slate-400 hover:text-slate-600 px-2">✕</button>
          )}
        </div>
        {showDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />}
      </div>

      {/* Banner: future schedule available */}
      {scheduleIdx > 0 && schedules.length > 1 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 mb-3 text-sm text-blue-800 text-center">
          📅 פורסם שבצ&quot;ק לשבוע הבא — ניתן לדפדף ולהציג אותו
        </div>
      )}

      {/* Schedule nav */}
      {schedules.length > 0 && (
        <div className="flex justify-between items-center mb-3">
          <button onClick={() => { userNavigated.current = true; setScheduleIdx(i => i + 1) }} disabled={!canGoBack}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed">
            קודם →
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold text-navy">{currentSchedule?.name ?? ''}</div>
            {currentSchedule?.updated_at && (
              <div className="text-[10px] text-slate-400 mt-0.5">
                עדכון אחרון: {formatUpdatedAt(currentSchedule.updated_at)}
              </div>
            )}
          </div>
          <button onClick={() => { userNavigated.current = true; setScheduleIdx(i => i - 1) }} disabled={!canGoForward}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed">
            ← הבא
          </button>
        </div>
      )}

      {/* My tasks toggle */}
      {selectedSoldierId && (
        <div className="flex justify-end mb-3">
          <button onClick={() => setMyTasksOnly(v => !v)}
            className={`text-sm px-4 py-1.5 rounded-full border transition ${
              myTasksOnly ? 'bg-navy text-white border-navy' : 'border-slate-300 text-slate-600'
            }`}>
            {myTasksOnly ? '✓ המשמרות שלי' : 'המשמרות שלי'}
          </button>
        </div>
      )}

      {schedulesLoading
        ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-navy rounded-full animate-spin" />
          </div>
        )
        : schedules.length === 0
        ? <p className="text-slate-400 text-center py-12">{'אין שבצ"ק פעיל'}</p>
        : <ScheduleGrid
            tasks={visibleTasks}
            assignments={assignments}
            soldiers={soldiers}
            finalLeave={finalLeave}
            currentSoldierId={selectedSoldierId}
            myTasksOnly={myTasksOnly}
          />
      }

      {showInquiry && (
        <InquiryModal soldiers={soldiers} onClose={() => setShowInquiry(false)} />
      )}
      {showLeave && survey?.is_open && (
        <LeaveRequestModal
          soldiers={soldiers}
          from={survey.from}
          to={survey.to}
          maxDays={survey.max_days ?? 0}
          onClose={() => setShowLeave(false)}
        />
      )}
    </Layout>
  )
}
