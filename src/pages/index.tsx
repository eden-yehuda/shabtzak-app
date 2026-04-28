import { useEffect, useState, useMemo } from 'react'
import Layout from '@/components/layout/Layout'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { formatTime, formatHebrewDate } from '@/utils/dateUtils'
import { onSnapshot, query, where, orderBy } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'
import type { Schedule } from '@/types'

export default function Home() {
  const soldiers = useSoldiers(false)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleIdx, setScheduleIdx] = useState(0)
  const [selectedSoldierId, setSelectedSoldierId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [currentDate] = useState<string>(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })

  // Load published schedules sorted by start_datetime desc
  useEffect(() => {
    const q = query(
      schedulesRef(),
      where('status', '==', 'published'),
      orderBy('start_datetime', 'desc')
    )
    return onSnapshot(q, snap => {
      const s = snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          start_datetime: data.start_datetime.toDate(),
          end_datetime: data.end_datetime.toDate(),
        } as Schedule
      })
      setSchedules(s)
    })
  }, [])

  const currentSchedule = schedules[scheduleIdx] ?? null
  const { tasks, assignments } = useScheduleTasks(currentSchedule?.id ?? null)

  // Tasks for the selected date (or all if no date match, show all tasks of schedule)
  const todayStr = currentDate
  const tasksForDate = useMemo(() => {
    if (!tasks.length) return tasks
    const filtered = tasks.filter(t => {
      const taskDate = t.start_datetime.toISOString().split('T')[0]
      return taskDate === todayStr
    })
    // If no tasks for selected date, show all tasks sorted by start
    const list = filtered.length > 0 ? filtered : tasks
    return [...list].sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())
  }, [tasks, todayStr])

  // Soldiers sorted alphabetically
  const sortedSoldiers = useMemo(() =>
    [...soldiers].sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')),
    [soldiers]
  )

  const filteredSoldiers = useMemo(() =>
    search ? sortedSoldiers.filter(s => s.full_name.includes(search)) : sortedSoldiers,
    [sortedSoldiers, search]
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('soldierId')
      localStorage.removeItem('soldierName')
    }
  }

  // Load saved soldier from localStorage
  useEffect(() => {
    const savedId = localStorage.getItem('soldierId')
    const savedName = localStorage.getItem('soldierName')
    if (savedId && savedName) {
      setSelectedSoldierId(savedId)
      setSearch(savedName)
    }
  }, [])

  const canGoBack = scheduleIdx < schedules.length - 1
  const canGoForward = scheduleIdx > 0

  return (
    <Layout title={'שבצק צוות אוראל'}>
      {/* Name selector */}
      <div className="relative mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              placeholder="חפש שם..."
              className="w-full border border-slate-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-navy"
            />
            {showDropdown && (
              <div className="absolute top-full right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                {filteredSoldiers.map(s => (
                  <button
                    key={s.id}
                    onClick={() => selectSoldier(s.id, s.full_name)}
                    className="w-full text-right px-4 py-2 text-sm hover:bg-slate-50 transition"
                  >
                    {s.full_name}
                  </button>
                ))}
                {filteredSoldiers.length === 0 && (
                  <p className="px-4 py-2 text-sm text-slate-400">לא נמצא</p>
                )}
              </div>
            )}
          </div>
          {selectedSoldierId && (
            <button onClick={clearSoldier} className="text-slate-400 hover:text-slate-600 px-2">✕</button>
          )}
        </div>
        {/* Close dropdown on outside click */}
        {showDropdown && (
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
        )}
      </div>

      {/* Schedule navigation */}
      {schedules.length > 0 && (
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => setScheduleIdx(i => i + 1)}
            disabled={!canGoBack}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← קודם
          </button>
          <span className="text-sm font-semibold text-navy text-center">
            {currentSchedule?.name ?? ''}
          </span>
          <button
            onClick={() => setScheduleIdx(i => i - 1)}
            disabled={!canGoForward}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            הבא →
          </button>
        </div>
      )}

      {/* Tasks */}
      {schedules.length === 0 ? (
        <p className="text-slate-400 text-center py-12">{'אין שבצ"ק פעיל'}</p>
      ) : (
        <div className="space-y-3">
          {tasksForDate.map(task => {
            const assigned = assignments
              .filter(a => a.task_id === task.id)
              .map(a => soldiers.find(s => s.id === a.soldier_id))
              .filter((s): s is NonNullable<typeof s> => s !== undefined)
            const isMine = selectedSoldierId
              ? assigned.some(s => s.id === selectedSoldierId)
              : false
            return (
              <div
                key={task.id}
                className={`rounded-xl p-4 shadow-sm border-r-4 transition ${
                  isMine
                    ? 'bg-navy text-white border-blue-300'
                    : 'bg-white text-slate-800 border-slate-200'
                }`}
              >
                <div className="font-semibold mb-1">{task.task_name}</div>
                <div className={`text-xs mb-2 ${isMine ? 'opacity-80' : 'text-slate-400'}`}>
                  {formatHebrewDate(task.start_datetime)} · {formatTime(task.start_datetime)} — {formatTime(task.end_datetime)}
                </div>
                <div className="flex flex-wrap gap-1">
                  {assigned.map(s => (
                    <span
                      key={s.id}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        isMine && s.id === selectedSoldierId
                          ? 'bg-white text-navy font-bold'
                          : isMine
                          ? 'bg-blue-800 text-white'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {s.full_name}
                    </span>
                  ))}
                  {assigned.length === 0 && (
                    <span className={`text-xs ${isMine ? 'opacity-60' : 'text-slate-400'}`}>
                      טרם שובצו
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {tasksForDate.length === 0 && (
            <p className="text-slate-400 text-center py-8">אין משימות להיום</p>
          )}
        </div>
      )}
    </Layout>
  )
}
