import { useState, useMemo } from 'react'
import type { Task } from '@/types'

interface Props {
  taskType: string
  tasks: Task[]         // all tasks in this column
  onClose: () => void
  onSave: (params: EditColumnParams) => Promise<void>
}

export interface EditColumnParams {
  taskName: string
  soldiersRequired: number
  requiresCommander: boolean
  startHour: number
  durationHours: number
  timesPerDay: number
}

export default function EditColumnModal({ taskType, tasks, onClose, onSave }: Props) {
  // Infer defaults from existing tasks
  const defaults = useMemo<EditColumnParams>(() => {
    if (tasks.length === 0) return { taskName: taskType, soldiersRequired: 3, requiresCommander: false, startHour: 6, durationHours: 8, timesPerDay: 1 }
    const t = tasks[0]
    const dur = Math.max(1, Math.round((t.end_datetime.getTime() - t.start_datetime.getTime()) / 3600000))

    // Count max tasks per calendar day to infer timesPerDay
    const countByDay: Record<string, number> = {}
    for (const task of tasks) {
      const key = task.start_datetime.toISOString().split('T')[0]
      countByDay[key] = (countByDay[key] ?? 0) + 1
    }
    const maxPerDay = Math.max(...Object.values(countByDay), 1)

    return {
      taskName: t.task_name,
      soldiersRequired: t.required_people_count,
      requiresCommander: t.requires_commander,
      startHour: t.start_datetime.getHours(),
      durationHours: dur,
      timesPerDay: maxPerDay,
    }
  }, [tasks, taskType])

  const [taskName, setTaskName] = useState(defaults.taskName)
  const [soldiersRequired, setSoldiersRequired] = useState(defaults.soldiersRequired)
  const [requiresCommander, setRequiresCommander] = useState(defaults.requiresCommander)
  const [startHour, setStartHour] = useState(defaults.startHour)
  const [durationHours, setDurationHours] = useState(defaults.durationHours)
  const [timesPerDay, setTimesPerDay] = useState(defaults.timesPerDay)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ taskName: taskName.trim() || taskType, soldiersRequired, requiresCommander, startHour, durationHours, timesPerDay })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4" dir="rtl"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold text-navy">✏️ ערוך עמודה — {taskType}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-5 text-sm text-amber-800">
          ⚠️ שמירה תמחק את כל {tasks.length} המשימות הקיימות בעמודה (ואת השיבוצים) ותיצור אותן מחדש.
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">שם המשימה</label>
            <input value={taskName} onChange={e => setTaskName(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy"
              placeholder={taskType} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">כמות חיילים</label>
              <input type="number" min={0} max={20} value={soldiersRequired}
                onChange={e => setSoldiersRequired(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-navy" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">כמה פעמים ביום</label>
              <input type="number" min={1} max={6} value={timesPerDay}
                onChange={e => setTimesPerDay(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-center focus:outline-none focus:border-navy" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">שעת התחלה ראשונה</label>
              <select value={startHour} onChange={e => setStartHour(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy">
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">משך משמרת</label>
              <select value={durationHours} onChange={e => setDurationHours(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy">
                {[1, 2, 3, 4, 6, 8, 10, 12, 24].map(h => (
                  <option key={h} value={h}>{h} שעות</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={requiresCommander} onChange={e => setRequiresCommander(e.target.checked)}
              className="w-4 h-4 rounded" />
            נדרש מפקד
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 border border-slate-200 rounded-xl py-2.5 text-slate-600 text-sm">
            ביטול
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-navy text-white rounded-xl py-2.5 font-semibold text-sm disabled:opacity-40">
            {saving ? '⏳ שומר...' : 'שמור שינויים'}
          </button>
        </div>
      </div>
    </div>
  )
}
