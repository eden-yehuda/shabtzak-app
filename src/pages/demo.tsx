import { useEffect, useMemo, useState, useRef } from 'react'
import Layout from '@/components/layout/Layout'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { usePublishedSchedule } from '@/hooks/usePublishedSchedule'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'
import type { Schedule, Soldier } from '@/types'

/**
 * Public demo of the soldier interface.
 * Same data flow as `/`, but soldier full names are mapped to:
 *   commanders → "מפקד 1", "מפקד 2", …
 *   non-commanders → "לוחם 1", "לוחם 2", …
 * Mapping is deterministic (alphabetical) so the same soldier always shows the same demo name.
 */
function anonymizeSoldiers(soldiers: Soldier[]): Soldier[] {
  const sorted = [...soldiers].sort((a, b) => a.full_name.localeCompare(b.full_name, 'he'))
  let cmdIdx = 0
  let regIdx = 0
  const map: Record<string, string> = {}
  for (const s of sorted) {
    if (s.is_commander) { cmdIdx++; map[s.id] = `מפקד ${cmdIdx}` }
    else { regIdx++; map[s.id] = `לוחם ${regIdx}` }
  }
  return soldiers.map(s => ({ ...s, full_name: map[s.id] ?? s.full_name }))
}

export default function DemoPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleIdx, setScheduleIdx] = useState(0)
  const userNavigated = useRef(false)
  const realSoldiers = useSoldiers()
  const finalLeave = useFinalLeave()

  const [selectedSoldierId, setSelectedSoldierId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [myTasksOnly, setMyTasksOnly] = useState(false)

  const soldiers = useMemo(() => anonymizeSoldiers(realSoldiers), [realSoldiers])

  useEffect(() => {
    const q = query(schedulesRef(), orderBy('start_datetime', 'desc'))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id, ...data,
          start_datetime: data.start_datetime?.toDate?.() ?? new Date(),
          end_datetime: data.end_datetime?.toDate?.() ?? new Date(),
          updated_at: data.updated_at?.toDate?.(),
        } as Schedule
      })
      const published = all.filter(s => s.status === 'published')
      setSchedules(published)
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

  const filteredSoldiers = useMemo(() =>
    soldiers.filter(s => s.full_name.includes(search)).slice(0, 20),
    [soldiers, search]
  )

  const visibleTasks = useMemo(() => {
    let filtered = tasks.filter(t => t.task_type !== 'עתודה')
    if (myTasksOnly && selectedSoldierId) {
      filtered = filtered.filter(t =>
        assignments.some(a => a.task_id === t.id && a.soldier_id === selectedSoldierId)
      )
    }
    return filtered
  }, [tasks, assignments, myTasksOnly, selectedSoldierId])

  const canGoBack = scheduleIdx < schedules.length - 1
  const canGoForward = scheduleIdx > 0

  const navActions = (
    <span className="text-xs bg-amber-400 text-amber-900 px-3 py-1.5 rounded-lg font-bold">
      🎬 דמו — שמות אנונימיים
    </span>
  )

  return (
    <Layout title={'שבצ"ק — דמו'} navActions={navActions}>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800 text-center">
        זוהי תצוגת דמו. השמות האמיתיים הוחלפו ב-&quot;מפקד N&quot; / &quot;לוחם N&quot; להגנה על פרטיות.
      </div>

      {/* Soldier selector (anonymized) */}
      <div className="relative mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              placeholder='חפש "מפקד 1", "לוחם 5"…'
              className="w-full border border-slate-300 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:border-navy"
            />
            {showDropdown && filteredSoldiers.length > 0 && (
              <div className="absolute top-full right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto mt-1">
                {filteredSoldiers.map(s => (
                  <button key={s.id} onClick={() => { setSelectedSoldierId(s.id); setSearch(s.full_name); setShowDropdown(false) }}
                    className="w-full text-right px-4 py-2 text-sm hover:bg-slate-50 transition">
                    {s.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedSoldierId && (
            <button onClick={() => { setSelectedSoldierId(null); setSearch(''); setMyTasksOnly(false) }}
              className="text-slate-400 hover:text-slate-600 px-2">✕</button>
          )}
        </div>
        {showDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />}
      </div>

      {/* Schedule nav */}
      {schedules.length > 0 && (
        <div className="flex justify-between items-center mb-3">
          <button onClick={() => { userNavigated.current = true; setScheduleIdx(i => i + 1) }} disabled={!canGoBack}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30">
            קודם →
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold text-navy">{currentSchedule?.name ?? ''}</div>
          </div>
          <button onClick={() => { userNavigated.current = true; setScheduleIdx(i => i - 1) }} disabled={!canGoForward}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30">
            ← הבא
          </button>
        </div>
      )}

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

      {schedules.length === 0
        ? <p className="text-slate-400 text-center py-12">אין שבצ&quot;ק פעיל</p>
        : <ScheduleGrid
            tasks={visibleTasks}
            assignments={assignments}
            soldiers={soldiers}
            finalLeave={finalLeave}
            currentSoldierId={selectedSoldierId}
            myTasksOnly={myTasksOnly}
            dayStartHour={currentSchedule?.day_start_hour ?? 2}
            homeLeaveHour={currentSchedule?.home_leave_hour}
          />
      }
    </Layout>
  )
}
