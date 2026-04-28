import { useState, useEffect } from 'react'
import { createTask, taskTypesRef } from '@/lib/firestore'
import { getDocs } from 'firebase/firestore'
import type { TaskType } from '@/types'

interface Props {
  scheduleId: string
  onClose: () => void
}

export default function TaskModal({ scheduleId, onClose }: Props) {
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [difficulty, setDifficulty] = useState<'hard' | 'easy'>('hard')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [required, setRequired] = useState(2)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    getDocs(taskTypesRef())
      .then(snap => {
        if (mounted) setTaskTypes(snap.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            ...data,
            requires_commander: data.requires_commander ?? false,
            soldiers_required: data.soldiers_required ?? 1,
            shift_duration_hours: data.shift_duration_hours ?? 4,
            is_emphasized: data.is_emphasized ?? false,
          } as TaskType
        }))
      })
      .catch(err => console.error('Failed to load task types', err))
    return () => { mounted = false }
  }, [])

  async function save() {
    if (!name || !type || !startDate || !startTime || !endDate || !endTime) return
    setSaving(true)
    try {
      await createTask({
        schedule_id: scheduleId,
        task_name: name,
        task_type: type,
        difficulty,
        start_datetime: new Date(`${startDate}T${startTime}`),
        end_datetime: new Date(`${endDate}T${endTime}`),
        required_people_count: required,
        requires_commander: false,
        notes,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-navy mb-4">{'משימה חדשה'}</h2>
        <div className="space-y-3">
          <input
            placeholder="שם משימה"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border rounded-xl px-4 py-2 text-sm"
          />
          <select
            value={type}
            onChange={e => {
              const tt = taskTypes.find(t => t.name === e.target.value)
              setType(e.target.value)
              if (tt) setDifficulty(tt.difficulty)
            }}
            className="w-full border rounded-xl px-4 py-2 text-sm"
          >
            <option value="">{'סוג משימה'}</option>
            {taskTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 block mb-1">{'התחלה'}</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">{'סיום'}</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-600">{'כמות נדרשת:'}</label>
            <input
              type="number"
              min={1}
              max={10}
              value={required}
              onChange={e => setRequired(Number(e.target.value))}
              className="w-20 border rounded-xl px-3 py-2 text-sm text-center"
            />
          </div>
          <textarea
            placeholder="הערות (אופציונלי)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full border rounded-xl px-4 py-2 text-sm h-20 resize-none"
          />
        </div>
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="flex-1 border rounded-xl py-2 text-slate-600">{'ביטול'}</button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !name || !type || !startDate || !startTime || !endDate || !endTime}
            className="flex-1 bg-navy text-white rounded-xl py-2 font-semibold disabled:opacity-50"
          >
            {saving ? 'שומר...' : 'הוסף משימה'}
          </button>
        </div>
      </div>
    </div>
  )
}
