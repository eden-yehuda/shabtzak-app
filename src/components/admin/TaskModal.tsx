import { useState, useEffect } from 'react'
import { createTask, taskTypesRef } from '@/lib/firestore'
import { getDocs } from 'firebase/firestore'
import type { TaskType } from '@/types'

interface Props {
  scheduleId: string
  scheduleStart: Date
  scheduleEnd: Date
  onClose: () => void
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function isoDate(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function daysInRange(from: Date, to: Date): string[] {
  const days: string[] = []
  const cur = new Date(from); cur.setHours(12, 0, 0, 0)
  const end = new Date(to); end.setHours(12, 0, 0, 0)
  while (cur <= end) { days.push(isoDate(cur)); cur.setDate(cur.getDate() + 1) }
  return days
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

export default function TaskModal({ scheduleId, scheduleStart, scheduleEnd, onClose }: Props) {
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [taskType, setTaskType] = useState('')
  const [mode, setMode] = useState<'fixed' | 'rotating'>('fixed')

  // קבועה
  const [timesPerDay, setTimesPerDay] = useState(2)
  const [fixedStartHour, setFixedStartHour] = useState(8)
  const [durationHours, setDurationHours] = useState(8)

  // לסירוגין
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set())
  const [rotStart, setRotStart] = useState('08:00')
  const [rotEnd, setRotEnd] = useState('20:00')

  // shared
  const [required, setRequired] = useState(2)
  const [requiresCommander, setRequiresCommander] = useState(false)
  const [saving, setSaving] = useState(false)

  const scheduleDays = daysInRange(scheduleStart, scheduleEnd)

  useEffect(() => {
    getDocs(taskTypesRef()).then(snap => {
      setTaskTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskType)))
    })
  }, [])

  function toggleDay(d: string) {
    setSelectedDays(prev => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
    else next.add(d)
      return next
    })
  }

  function onTypeChange(name: string) {
    const tt = taskTypes.find(t => t.name === name)
    setTaskType(name)
    if (tt) {
      setRequiresCommander(tt.requires_commander ?? false)
      setRequired(tt.soldiers_required ?? 2)
      setDurationHours(tt.shift_duration_hours ?? 8)
    }
  }

  async function save() {
    if (!taskType) return
    setSaving(true)
    try {
      if (mode === 'fixed') {
        for (const dayStr of scheduleDays) {
          for (let i = 0; i < timesPerDay; i++) {
            const startMs = new Date(`${dayStr}T${String(fixedStartHour).padStart(2, '0')}:00`).getTime()
              + i * durationHours * 3600000
            const start = new Date(startMs)
            const end = new Date(startMs + durationHours * 3600000)
            await createTask({
              schedule_id: scheduleId, task_name: taskType, task_type: taskType,
              difficulty: 'hard', start_datetime: start, end_datetime: end,
              required_people_count: required, requires_commander: requiresCommander, notes: '',
            })
          }
        }
      } else {
        for (const dayStr of Array.from(selectedDays)) {
          const [sh, sm] = rotStart.split(':').map(Number)
          const [eh, em] = rotEnd.split(':').map(Number)
          const start = new Date(`${dayStr}T${rotStart}`)
          const end = new Date(`${dayStr}T${rotEnd}`)
          if (eh * 60 + em <= sh * 60 + sm) end.setDate(end.getDate() + 1)
          await createTask({
            schedule_id: scheduleId, task_name: taskType, task_type: taskType,
            difficulty: 'hard', start_datetime: start, end_datetime: end,
            required_people_count: required, requires_commander: requiresCommander, notes: '',
          })
        }
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const canSave = !!taskType && (mode === 'fixed' || selectedDays.size > 0)
  const totalTasks = mode === 'fixed'
    ? scheduleDays.length * timesPerDay
    : selectedDays.size

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4" dir="rtl"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-navy">הוספת משימה</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Task type */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">סוג משימה</label>
          <select value={taskType} onChange={e => onTypeChange(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy">
            <option value="">בחר סוג...</option>
            {taskTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>

        {/* קבועה / לסירוגין */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">סוג תדירות</label>
          <div className="grid grid-cols-2 gap-2">
            {(['fixed', 'rotating'] as const).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`py-2.5 rounded-xl text-sm font-semibold border transition ${
                  mode === m ? 'bg-navy text-white border-navy' : 'border-slate-200 text-slate-600 hover:border-navy'
                }`}>
                {m === 'fixed' ? '🔁 קבועה' : '📅 לסירוגין'}
              </button>
            ))}
          </div>
        </div>

        {/* Fixed options */}
        {mode === 'fixed' && (
          <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-600 w-36">כמה פעמים ביום</label>
              <input type="number" min={1} max={6} value={timesPerDay}
                onChange={e => setTimesPerDay(Number(e.target.value))}
                className="w-20 border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-center" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-600 w-36">שעת התחלה ראשונה</label>
              <select value={fixedStartHour} onChange={e => setFixedStartHour(Number(e.target.value))}
                className="w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-600 w-36">משך כל משמרת</label>
              <select value={durationHours} onChange={e => setDurationHours(Number(e.target.value))}
                className="w-28 border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {[4, 6, 8, 10, 12, 24].map(h => (
                  <option key={h} value={h}>{h} שעות</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-400">
              יווצרו {scheduleDays.length} × {timesPerDay} = <strong>{scheduleDays.length * timesPerDay} משימות</strong>
            </p>
          </div>
        )}

        {/* Rotating options */}
        {mode === 'rotating' && (
          <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-3">
            <label className="text-sm font-semibold text-slate-700">בחר ימים</label>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
              {scheduleDays.map(d => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition text-right ${
                    selectedDays.has(d) ? 'bg-navy text-white border-navy' : 'bg-white border-slate-200 text-slate-600 hover:border-navy'
                  }`}>
                  {dayLabel(d)}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1">שעת התחלה</label>
                <input type="time" value={rotStart} onChange={e => setRotStart(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 block mb-1">שעת סיום</label>
                <input type="time" value={rotEnd} onChange={e => setRotEnd(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
            </div>
            {selectedDays.size > 0 && (
              <p className="text-xs text-slate-400">יווצרו <strong>{selectedDays.size} משימות</strong></p>
            )}
          </div>
        )}

        {/* Required + commander */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">כמות נדרשת</label>
            <input type="number" min={1} max={10} value={required}
              onChange={e => setRequired(Number(e.target.value))}
              className="w-16 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-center" />
            <span className="text-sm text-slate-500">חיילים</span>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={requiresCommander} onChange={e => setRequiresCommander(e.target.checked)}
              className="w-4 h-4 rounded" />
            נדרש מפקד
          </label>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 border border-slate-200 rounded-xl py-2.5 text-slate-600 text-sm">
            ביטול
          </button>
          <button type="button" onClick={save} disabled={!canSave || saving}
            className="flex-1 bg-navy text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40">
            {saving ? `יוצר... (${totalTasks} משימות)` : `צור ${totalTasks} משימות`}
          </button>
        </div>
      </div>
    </div>
  )
}
