import { useState, useEffect } from 'react'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'
import type { Schedule } from '@/types'

interface Props {
  currentScheduleId: string
  hasExistingTasks: boolean
  onClose: () => void
  onConfirm: (sourceScheduleId: string, replaceExisting: boolean) => void
  isLoading: boolean
}

export default function CloneScheduleModal({ currentScheduleId, hasExistingTasks, onClose, onConfirm, isLoading }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [replaceExisting, setReplaceExisting] = useState(false)

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
      }).filter(s => s.id !== currentScheduleId)
      setSchedules(all)
      if (all.length > 0 && !selectedId) setSelectedId(all[0].id)
    })
  }, [currentScheduleId])

  const fmt = (d: Date) => d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" dir="rtl"
      onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-navy">📋 שכפל משימות משבצ&quot;ק קיים</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          המשימות יועתקו לפי יום-בשבוע ושעה — <strong>ללא שיבוצים</strong>.
        </p>

        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">שבצ&quot;ק מקור</label>
          {schedules.length === 0
            ? <p className="text-sm text-slate-400">אין שבצ&quot;קים זמינים</p>
            : (
              <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy">
                {schedules.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({fmt(s.start_datetime)} – {fmt(s.end_datetime)})
                  </option>
                ))}
              </select>
            )}
        </div>

        {hasExistingTasks && (
          <label className="flex items-center gap-2 text-sm text-slate-600 mb-5 cursor-pointer">
            <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)}
              className="w-4 h-4 rounded" />
            מחק משימות קיימות לפני ההעתקה
          </label>
        )}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 border border-slate-200 rounded-xl py-2.5 text-slate-600 text-sm">
            ביטול
          </button>
          <button onClick={() => onConfirm(selectedId, replaceExisting)}
            disabled={!selectedId || isLoading}
            className="flex-1 bg-navy text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40">
            {isLoading ? '⏳ מעתיק...' : 'שכפל'}
          </button>
        </div>
      </div>
    </div>
  )
}
