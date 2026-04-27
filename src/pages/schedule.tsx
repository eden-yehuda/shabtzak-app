import { useEffect, useState } from 'react'
import Layout from '@/components/layout/Layout'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { formatTime, formatHebrewDate } from '@/utils/dateUtils'
import { onSnapshot, query, where, orderBy, limit } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'

export default function ScheduleView() {
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [scheduleName, setScheduleName] = useState('')
  const soldiers = useSoldiers()
  const { tasks, assignments } = useScheduleTasks(scheduleId)
  const [myFilter, setMyFilter] = useState<string | null>(null)
  const [showMine, setShowMine] = useState(false)

  useEffect(() => {
    const id = localStorage.getItem('soldierId')
    setMyFilter(id)

    const q = query(
      schedulesRef(),
      where('status', '==', 'published'),
      orderBy('start_datetime', 'desc'),
      limit(1)
    )
    return onSnapshot(q, snap => {
      const d = snap.docs[0]
      if (d) {
        setScheduleId(d.id)
        setScheduleName(d.data().name)
      }
    })
  }, [])

  const filteredTasks = showMine && myFilter
    ? tasks.filter(t => assignments.some(a => a.task_id === t.id && a.soldier_id === myFilter))
    : tasks

  const sorted = [...filteredTasks].sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())

  return (
    <Layout title={'שבצ"ק מחלקתי'}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-navy">{scheduleName || 'שבצ"ק'}</h1>
        {myFilter && (
          <button
            onClick={() => setShowMine(p => !p)}
            className={`text-sm px-3 py-1 rounded-full border transition
              ${showMine ? 'bg-navy text-white border-navy' : 'border-slate-300 text-slate-600'}`}
          >
            {showMine ? 'הצג הכל' : 'המשימות שלי'}
          </button>
        )}
      </div>
      <div className="space-y-3">
        {sorted.map(task => {
          const assigned = assignments
            .filter(a => a.task_id === task.id)
            .map(a => soldiers.find(s => s.id === a.soldier_id)?.full_name)
            .filter((n): n is string => Boolean(n))
          return (
            <div key={task.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="font-semibold text-slate-800 mb-1">{task.task_name}</div>
              <div className="text-xs text-slate-400 mb-2">
                {formatHebrewDate(task.start_datetime)} · {formatTime(task.start_datetime)} — {formatTime(task.end_datetime)}
              </div>
              <div className="flex flex-wrap gap-1">
                {assigned.map((name, i) => (
                  <span key={i} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{name}</span>
                ))}
                {assigned.length === 0 && (
                  <span className="text-xs text-slate-400">טרם שובצו</span>
                )}
              </div>
            </div>
          )
        })}
        {sorted.length === 0 && (
          <p className="text-slate-400 text-center py-8">{'אין שבצ"ק פעיל'}</p>
        )}
      </div>
    </Layout>
  )
}
