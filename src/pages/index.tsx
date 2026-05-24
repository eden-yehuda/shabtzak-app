import { useEffect, useState, useMemo, useRef } from 'react'
import Layout from '@/components/layout/Layout'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import InquiryModal from '@/components/InquiryModal'
import LeaveRequestModal from '@/components/LeaveRequestModal'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { usePublishedSchedule } from '@/hooks/usePublishedSchedule'
import { onSnapshot, query, orderBy, doc } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'
import { db } from '@/lib/firebase'
import type { Schedule, Task, Assignment, Soldier, LeaveRequest } from '@/types'

interface SurveySettings { is_open: boolean; from: string; to: string; max_days: number }

// ── SOS Modal ────────────────────────────────────────────────────────────────
function SOSModal({ tasks, assignments, soldiers, finalLeave, homeLeaveHour = 6, onClose }: {
  tasks: Task[]
  assignments: Assignment[]
  soldiers: Soldier[]
  finalLeave: LeaveRequest[]
  homeLeaveHour?: number
  onClose: () => void
}) {
  const [now] = useState(() => new Date())
  const horizon = useMemo(() => new Date(now.getTime() + 12 * 3600 * 1000), [now])

  function isoDateLocal(d: Date) {
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-')
  }

  const todayStr = isoDateLocal(now)
  const yesterdayStr = isoDateLocal(new Date(now.getTime() - 86400000))
  const currentHour = now.getHours()

  function fmtHour(d: Date) { return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }
  function hoursLabel(ms: number) {
    const h = Math.round(ms / 3600000)
    return h > 0 ? `${h}ש'` : `${Math.round(ms / 60000)}ד'`
  }

  // Tasks overlapping [now, horizon]
  const activeTasks = useMemo(() =>
    tasks
      .filter(t => t.start_datetime < horizon && t.end_datetime > now)
      .sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime()),
    [tasks, now, horizon]
  )

  // Soldiers busy in the next 12h
  const busySoldierIds = useMemo(() => {
    const s = new Set<string>()
    for (const a of assignments) {
      if (activeTasks.some(t => t.id === a.task_id)) s.add(a.soldier_id)
    }
    return s
  }, [assignments, activeTasks])

  const leaveTodayIds = useMemo(() => new Set(
    finalLeave.filter(r => r.date === todayStr && r.status === 'approved').map(r => r.soldier_id)
  ), [finalLeave, todayStr])

  const leaveYesterdayIds = useMemo(() => new Set(
    finalLeave.filter(r => r.date === yesterdayStr && r.status === 'approved').map(r => r.soldier_id)
  ), [finalLeave, yesterdayStr])

  const activeSoldiers = useMemo(() => soldiers.filter(s => s.is_active), [soldiers])

  // Approved leave today = at home, period (homeLeaveHour doesn't change this)
  const onLeaveIds = leaveTodayIds

  // Free = active, not busy, not on leave today
  const freeSoldiers = useMemo(() =>
    activeSoldiers.filter(s => !busySoldierIds.has(s.id) && !onLeaveIds.has(s.id)),
    [activeSoldiers, busySoldierIds, onLeaveIds]
  )
  const leaveSoldiers = useMemo(() =>
    activeSoldiers.filter(s => onLeaveIds.has(s.id)),
    [activeSoldiers, onLeaveIds]
  )

  // "בדרך חזרה": free soldier who had leave yesterday and homeLeaveHour hasn't passed yet
  const returningIds = useMemo(() => new Set(
    [...leaveYesterdayIds].filter(id => !leaveTodayIds.has(id) && currentHour < homeLeaveHour)
  ), [leaveYesterdayIds, leaveTodayIds, currentHour, homeLeaveHour])

  // Per-task: list of soldiers assigned
  const taskGroups = useMemo(() =>
    activeTasks.map(t => {
      const assigned = assignments
        .filter(a => a.task_id === t.id)
        .map(a => activeSoldiers.find(s => s.id === a.soldier_id))
        .filter((s): s is Soldier => !!s)
      return { task: t, soldiers: assigned }
    }),
    [activeTasks, assignments, activeSoldiers]
  )

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe-top py-3 bg-slate-900 border-b border-slate-700 shrink-0">
        <div>
          <h2 className="text-white font-bold text-lg leading-tight">🆘 SOS — 12 שעות קרובות</h2>
          <p className="text-slate-400 text-xs">{fmtHour(now)} — {fmtHour(horizon)}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-3xl leading-none px-2 py-1">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">

        {/* ── באוויר (free) — highlighted ── */}
        <div className="rounded-2xl bg-emerald-500 p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">✈️</span>
            <h3 className="text-white font-bold text-lg">באוויר — {freeSoldiers.length}</h3>
          </div>
          {freeSoldiers.length === 0
            ? <p className="text-emerald-100 text-sm text-center py-2">אין חיילים פנויים</p>
            : (
              <div className="flex flex-wrap gap-2">
                {freeSoldiers.map(s => (
                  <span key={s.id} className={`px-3 py-1.5 rounded-xl text-sm font-semibold shadow flex items-center gap-1.5 ${
                    returningIds.has(s.id)
                      ? 'bg-yellow-100 text-yellow-900'
                      : 'bg-emerald-100 text-emerald-900'
                  }`}>
                    {s.full_name}
                    {returningIds.has(s.id) && (
                      <span className="text-[10px] bg-yellow-300 text-yellow-900 px-1 py-0.5 rounded font-bold">בדרך</span>
                    )}
                  </span>
                ))}
              </div>
            )
          }
        </div>

        {/* ── משימות פעילות ── */}
        <div>
          <h3 className="text-slate-300 font-bold text-sm uppercase tracking-wide mb-3 px-1">
            📋 משימות — {taskGroups.length}
          </h3>
          {taskGroups.length === 0
            ? <p className="text-slate-500 text-sm text-center py-4">אין משימות בטווח זה</p>
            : <div className="space-y-3">
                {taskGroups.map(({ task, soldiers: sol }) => {
                  const isActive = task.start_datetime <= now && task.end_datetime > now
                  const remaining = task.end_datetime.getTime() - now.getTime()
                  return (
                    <div key={task.id} className={`rounded-2xl border p-4 ${
                      isActive ? 'bg-slate-800 border-slate-600' : 'bg-slate-850 border-slate-700 opacity-80'
                    }`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-white font-bold text-base">{task.task_name}</span>
                          {isActive && (
                            <span className="mr-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                              עכשיו
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-slate-300 text-xs">{fmtHour(task.start_datetime)}–{fmtHour(task.end_datetime)}</div>
                          {isActive && (
                            <div className="text-orange-400 text-[11px] font-semibold">עוד {hoursLabel(remaining)}</div>
                          )}
                        </div>
                      </div>
                      {sol.length === 0
                        ? <p className="text-slate-500 text-xs italic">אין שיבוצים</p>
                        : (
                          <div className="flex flex-wrap gap-1.5">
                            {sol.map(s => (
                              <span key={s.id} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                                s.is_commander ? 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500' : 'bg-slate-700 text-slate-200'
                              }`}>
                                {s.is_commander && '★ '}{s.full_name}
                              </span>
                            ))}
                          </div>
                        )
                      }
                    </div>
                  )
                })}
              </div>
          }
        </div>

        {/* ── בית (on leave) ── */}
        {leaveSoldiers.length > 0 && (
          <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🏠</span>
              <h3 className="text-slate-300 font-semibold text-sm">בית — {leaveSoldiers.length}</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {leaveSoldiers.map(s => (
                <span key={s.id} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-700 text-slate-400">
                  {s.full_name}
                </span>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

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
  const [showAllLeaves, setShowAllLeaves] = useState(false)
  const [showSOS, setShowSOS] = useState(false)

  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'leave_survey'), snap => {
      if (snap.exists()) setSurvey(snap.data() as SurveySettings)
      else setSurvey(null)
    })
  }, [])

  // Load saved soldier + filter preferences from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedId = localStorage.getItem('soldierId')
    const savedName = localStorage.getItem('soldierName')
    const savedMyTasksOnly = localStorage.getItem('myTasksOnly') === 'true'
    if (savedId) setSelectedSoldierId(savedId)
    if (savedName) setSearch(savedName)
    if (savedMyTasksOnly) setMyTasksOnly(true)
  }, [])

  // Persist myTasksOnly whenever it changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (myTasksOnly) localStorage.setItem('myTasksOnly', 'true')
    else localStorage.removeItem('myTasksOnly')
  }, [myTasksOnly])

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

  // On every schedules update, jump to the best schedule —
  // unless the user has manually navigated away.
  useEffect(() => {
    if (schedules.length === 0 || userNavigated.current) return
    const now = new Date()
    // 1. Prefer a schedule that contains now
    let idx = schedules.findIndex(s =>
      s.start_datetime && s.end_datetime &&
      s.start_datetime <= now && s.end_datetime >= now
    )
    if (idx < 0) {
      // 2. No current schedule — pick the one whose start_datetime is closest to now
      //    (handles gap between weeks and upcoming schedules)
      idx = schedules.reduce((bestIdx, s, i) => {
        const dist = Math.abs((s.start_datetime?.getTime() ?? 0) - now.getTime())
        const bestDist = Math.abs((schedules[bestIdx]?.start_datetime?.getTime() ?? 0) - now.getTime())
        return dist < bestDist ? i : bestIdx
      }, 0)
    }
    setScheduleIdx(idx)
  }, [schedules])

  const currentSchedule = schedules[scheduleIdx] ?? null
  // Soldier view reads the LATEST PUBLISHED SNAPSHOT — not the live working copy
  const { tasks, assignments } = usePublishedSchedule(currentSchedule?.id ?? null)

  // Column order: prefer Firestore value on schedule doc, fall back to localStorage (admin same-device)
  const columnOrder = useMemo(() => {
    if (currentSchedule?.column_order) return currentSchedule.column_order
    if (typeof window !== 'undefined' && currentSchedule?.id) {
      try {
        const stored = localStorage.getItem(`colOrder_${currentSchedule.id}`)
        return stored ? (JSON.parse(stored) as string[]) : undefined
      } catch { return undefined }
    }
    return undefined
  }, [currentSchedule?.column_order, currentSchedule?.id])

  // SOS always uses the schedule that contains NOW — regardless of which week the user is browsing
  const sosSchedule = useMemo(() => {
    const n = new Date()
    return schedules.find(s =>
      s.start_datetime && s.end_datetime &&
      s.start_datetime <= n && s.end_datetime >= n
    ) ?? schedules[0] ?? null
  }, [schedules])
  const { tasks: sosTasks, assignments: sosAssignments } = usePublishedSchedule(sosSchedule?.id ?? null)

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
      localStorage.removeItem('myTasksOnly')
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
      <button
        onClick={() => setShowSOS(true)}
        className="text-xs bg-red-500 hover:bg-red-400 text-white px-3 py-1.5 rounded-lg font-bold transition shadow-md"
      >
        🆘 SOS
      </button>
      <button
        onClick={() => setShowAllLeaves(true)}
        className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-lg font-semibold transition"
      >
        🏠 יציאות
      </button>
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

      {/* My tasks toggle + my leave dates */}
      {selectedSoldierId && (
        <div className="flex justify-between items-center gap-2 mb-3 flex-wrap">
          <MyLeaveView soldierId={selectedSoldierId} finalLeave={finalLeave} />
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
            dayStartHour={currentSchedule?.day_start_hour ?? 2}
            homeLeaveHour={currentSchedule?.home_leave_hour}
            columnOrder={columnOrder}
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
          defaultSoldierId={selectedSoldierId}
          onClose={() => setShowLeave(false)}
        />
      )}
      {showAllLeaves && (
        <AllLeavesModal
          soldiers={soldiers}
          finalLeave={finalLeave}
          onClose={() => setShowAllLeaves(false)}
        />
      )}

      {showSOS && (
        <SOSModal
          tasks={sosTasks}
          assignments={sosAssignments}
          soldiers={soldiers}
          finalLeave={finalLeave}
          homeLeaveHour={sosSchedule?.home_leave_hour ?? sosSchedule?.day_start_hour ?? 6}
          onClose={() => setShowSOS(false)}
        />
      )}
    </Layout>
  )
}

// ── View-only modal: leaves from today onward, all soldiers OR a single soldier (vertical) ──
function AllLeavesModal({ soldiers, finalLeave, onClose }: {
  soldiers: Array<{ id: string; full_name: string; is_active: boolean; is_commander: boolean }>
  finalLeave: Array<{ soldier_id: string; date: string; status: string }>
  onClose: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [selectedSoldierId, setSelectedSoldierId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const approvedFuture = useMemo(
    () => finalLeave.filter(r => r.status === 'approved' && r.date >= today),
    [finalLeave, today]
  )

  const maxDate = useMemo(() => {
    if (approvedFuture.length === 0) return today
    return approvedFuture.reduce((mx, r) => r.date > mx ? r.date : mx, today)
  }, [approvedFuture, today])

  const dates = useMemo(() => {
    const out: string[] = []
    const cur = new Date(today + 'T12:00:00')
    const end = new Date(maxDate + 'T12:00:00')
    while (cur <= end) {
      out.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }
    return out
  }, [today, maxDate])

  const sortedSoldiers = useMemo(
    () => soldiers.filter(s => s.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')),
    [soldiers]
  )

  const filteredSoldiers = useMemo(
    () => sortedSoldiers.filter(s => s.full_name.includes(search.trim())).slice(0, 30),
    [sortedSoldiers, search]
  )

  function dayLabel(iso: string): string {
    const d = new Date(iso + 'T12:00:00')
    const days = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
    return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
  }
  function dayLong(iso: string): string {
    const d = new Date(iso + 'T12:00:00')
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
    return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
  }

  const onLeave = useMemo(() => {
    const m = new Set<string>()
    for (const r of approvedFuture) m.add(`${r.soldier_id}|${r.date}`)
    return m
  }, [approvedFuture])

  const selectedSoldier = selectedSoldierId ? sortedSoldiers.find(s => s.id === selectedSoldierId) : null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed inset-2 sm:inset-10 bg-white rounded-2xl shadow-2xl z-50 flex flex-col" dir="rtl">
        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-navy">🏠 יציאות הביתה ({dayLabel(today)}–{dayLabel(maxDate)})</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-2">×</button>
        </div>

        {/* Soldier selector */}
        <div className="px-4 py-3 border-b border-slate-200 shrink-0">
          {selectedSoldier ? (
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-navy">{selectedSoldier.full_name}</span>
              <button onClick={() => { setSelectedSoldierId(null); setSearch('') }}
                className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-semibold transition">
                ← חזור לכולם
              </button>
            </div>
          ) : (
            <div className="relative">
              <input type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                placeholder="🔍 חפש חייל לראות יציאות שלו..."
                className="w-full border border-slate-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-navy" />
              {showDropdown && filteredSoldiers.length > 0 && (
                <div className="absolute top-full right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-64 overflow-y-auto mt-1">
                  {filteredSoldiers.map(s => (
                    <button key={s.id}
                      onClick={() => { setSelectedSoldierId(s.id); setSearch(''); setShowDropdown(false) }}
                      className="w-full text-right px-4 py-2 text-sm hover:bg-slate-50">
                      {s.full_name}
                    </button>
                  ))}
                </div>
              )}
              {showDropdown && (
                <div className="fixed inset-0 z-20" onClick={() => setShowDropdown(false)} />
              )}
            </div>
          )}
        </div>

        <div className="overflow-auto p-4 flex-1">
          {selectedSoldier ? (
            // Single-soldier view: one card per day (mobile-friendly)
            (() => {
              const homeCount = dates.filter(d => onLeave.has(`${selectedSoldier.id}|${d}`)).length
              return (
                <div className="flex flex-col gap-1.5 max-w-md mx-auto">
                  {dates.map(d => {
                    const isHome = onLeave.has(`${selectedSoldier.id}|${d}`)
                    return (
                      <div key={d}
                        className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                          isHome
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-emerald-50 border-emerald-200'
                        }`}>
                        <span className={`font-semibold ${isHome ? 'text-blue-800' : 'text-emerald-800'}`}>
                          {isHome ? '🏠' : '✅'} {dayLong(d)}
                        </span>
                        <span className={`text-xs ${isHome ? 'text-blue-600' : 'text-emerald-600'}`}>
                          {isHome ? 'בית' : 'נמצא'}
                        </span>
                      </div>
                    )
                  })}
                  <div className="text-center text-xs text-slate-500 mt-2">
                    {homeCount} ימי בית מתוך {dates.length} ימים
                  </div>
                </div>
              )
            })()
          ) : (
            // All-soldiers grid (no stars)
            dates.length === 0 || approvedFuture.length === 0
              ? <p className="text-slate-400 text-center py-8">אין יציאות מאושרות מהיום והלאה</p>
              : (
                <table className="text-sm border-collapse border-separate" style={{ minWidth: 'max-content', borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th className="px-3 py-2 font-semibold sticky top-0 right-0 bg-slate-100 border-b border-l border-slate-200 text-right z-30 shadow-sm">שם</th>
                      {dates.map(d => (
                        <th key={d} className="px-2 py-2 text-center font-semibold sticky top-0 bg-slate-100 border-b border-slate-200 min-w-[52px] text-xs z-20 shadow-sm">
                          {dayLabel(d)}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-center font-semibold sticky top-0 left-0 bg-slate-100 border-b border-slate-200 z-30 shadow-sm">סה"כ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSoldiers.map(s => {
                      const count = dates.filter(d => onLeave.has(`${s.id}|${d}`)).length
                      return (
                        <tr key={s.id} className={`border-b border-slate-100 hover:bg-slate-50 ${count === 0 ? 'opacity-40' : ''}`}>
                          <td className="px-3 py-1.5 font-medium sticky right-0 bg-white whitespace-nowrap border-l border-slate-200">
                            <button onClick={() => count > 0 ? setSelectedSoldierId(s.id) : undefined}
                              className={count > 0 ? 'hover:text-navy hover:underline' : 'cursor-default'}>
                              {s.full_name}
                            </button>
                          </td>
                          {dates.map(d => (
                            <td key={d} className="px-1 py-1 text-center">
                              {onLeave.has(`${s.id}|${d}`)
                                ? <span className="inline-block w-7 h-7 rounded-md bg-blue-100 text-blue-700 text-xs font-bold leading-7">✓</span>
                                : <span className="text-slate-200 text-xs">—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-center font-bold sticky left-0 bg-white border-r border-slate-200">
                            {count > 0 ? count : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-semibold text-xs border-t-2 border-slate-300">
                      <td className="px-3 py-2 sticky right-0 bg-slate-100 border-l border-slate-200 whitespace-nowrap">בבית</td>
                      {dates.map(d => {
                        const homeCount = sortedSoldiers.filter(s => onLeave.has(`${s.id}|${d}`)).length
                        const total = sortedSoldiers.length
                        return (
                          <td key={d} className="px-1 py-2 text-center">
                            {homeCount > 0
                              ? <span className="text-blue-700 font-bold">{homeCount}</span>
                              : <span className="text-slate-300">0</span>}
                            <div className="text-[9px] text-slate-400">{total - homeCount} בבסיס</div>
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 sticky left-0 bg-slate-100 border-r border-slate-200" />
                    </tr>
                  </tfoot>
                </table>
              )
          )}
        </div>
      </div>
    </>
  )
}

// ── View-only display of the current soldier's approved leave dates ─────────
function MyLeaveView({ soldierId, finalLeave }: {
  soldierId: string
  finalLeave: Array<{ soldier_id: string; date: string; status: string }>
}) {
  const [open, setOpen] = useState(false)
  const myLeaves = useMemo(() =>
    finalLeave
      .filter(r => r.soldier_id === soldierId && r.status === 'approved')
      .map(r => r.date)
      .sort(),
    [finalLeave, soldierId]
  )
  const today = new Date().toISOString().split('T')[0]
  const upcoming = myLeaves.filter(d => d >= today)
  const past = myLeaves.filter(d => d < today)

  function formatDay(iso: string): string {
    const d = new Date(iso + 'T12:00:00')
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
    return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
  }

  if (myLeaves.length === 0) {
    return (
      <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">
        🏠 אין יציאות מאושרות
      </div>
    )
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-1.5 hover:bg-blue-100 font-semibold transition">
        🏠 היציאות שלי ({upcoming.length} קרובות) {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-3 w-64 max-h-80 overflow-y-auto" dir="rtl">
          {upcoming.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">קרובות:</div>
              <div className="flex flex-wrap gap-1">
                {upcoming.map(d => (
                  <span key={d} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md px-2 py-0.5 font-semibold">
                    {formatDay(d)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">בעבר:</div>
              <div className="flex flex-wrap gap-1">
                {past.map(d => (
                  <span key={d} className="text-xs bg-slate-50 text-slate-400 border border-slate-200 rounded-md px-2 py-0.5">
                    {formatDay(d)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
