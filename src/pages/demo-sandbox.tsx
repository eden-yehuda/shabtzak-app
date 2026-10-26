import { useEffect, useMemo, useState } from 'react'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import type { Task, Assignment, Soldier } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Self-contained DEMO sandbox.
// Everything lives in localStorage — it NEVER reads or writes Firestore, so it
// cannot touch or expose the real (sensitive) unit data. Open to anyone, no login.
// ─────────────────────────────────────────────────────────────────────────────

const STORE_KEY = 'demo_sandbox_v1'
const DAY_START = 6

// Cosmetic credentials shown on screen (the sandbox is open; these are for flavor).
const DEMO_USER = 'demo'
const DEMO_PASS = '1234'

const TASK_TYPES = ['ש"ג', 'סיור', 'כוננות', 'תורן מטבח', 'של"ז', 'בלת"מ', 'אחורית']

interface SandboxData {
  soldiers: Soldier[]
  tasks: Task[]
  assignments: Assignment[]
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

function dayAt(offset: number, hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  d.setHours(hour, 0, 0, 0)
  return d
}

function isoDay(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

// ── Fake seed data (obviously fictional names) ──────────────────────────────
function seed(): SandboxData {
  const soldiers: Soldier[] = [
    { id: 's1', full_name: 'יוסי המפקד', team: 'מפקדה', is_active: true, is_commander: true, notes: '', fixed_home_ranges: [] },
    { id: 's2', full_name: 'דנה סגן', team: 'מפקדה', is_active: true, is_commander: true, notes: '', fixed_home_ranges: [] },
    { id: 's3', full_name: 'אבי כהן', team: 'חוליה 1', is_active: true, is_commander: false, notes: '', fixed_home_ranges: [] },
    { id: 's4', full_name: 'רון לוי', team: 'חוליה 1', is_active: true, is_commander: false, notes: '', fixed_home_ranges: [] },
    { id: 's5', full_name: 'מאיה בר', team: 'חוליה 1', is_active: true, is_commander: false, notes: '', fixed_home_ranges: [] },
    { id: 's6', full_name: 'עידו שחר', team: 'חוליה 2', is_active: true, is_commander: false, notes: '', fixed_home_ranges: [] },
    { id: 's7', full_name: 'נועם גל', team: 'חוליה 2', is_active: true, is_commander: false, notes: '', fixed_home_ranges: [] },
    { id: 's8', full_name: 'תומר דהן', team: 'חוליה 2', is_active: true, is_commander: false, notes: '', fixed_home_ranges: [] },
    { id: 's9', full_name: 'ליאור ניר', team: 'חוליה 3', is_active: true, is_commander: false, notes: '', fixed_home_ranges: [] },
    { id: 's10', full_name: 'שי רום', team: 'חוליה 3', is_active: true, is_commander: false, notes: '', fixed_home_ranges: [] },
  ]

  const tasks: Task[] = []
  const assignments: Assignment[] = []
  const addTask = (type: string, name: string, offset: number, start: number, end: number, count: number, cmd: boolean, assigned: string[]) => {
    const id = uid('t')
    tasks.push({
      id, schedule_id: 'demo', task_name: name, task_type: type, difficulty: 'hard',
      start_datetime: dayAt(offset, start), end_datetime: dayAt(offset, end),
      required_people_count: count, requires_commander: cmd,
    })
    assigned.forEach((sid, i) => assignments.push({ id: uid('a'), task_id: id, soldier_id: sid, order: i }))
  }

  // Day 0
  addTask('ש"ג', 'ש"ג', 0, 6, 14, 1, false, ['s3'])
  addTask('ש"ג', 'ש"ג', 0, 14, 22, 1, false, ['s4'])
  addTask('סיור', 'סיור', 0, 8, 16, 2, true, ['s2', 's6'])
  addTask('כוננות', 'כוננות א', 0, 6, 18, 2, false, ['s7', 's8'])
  addTask('תורן מטבח', 'תורן מטבח', 0, 6, 18, 1, false, ['s9'])
  // Day 1
  addTask('ש"ג', 'ש"ג', 1, 6, 14, 1, false, ['s5'])
  addTask('סיור', 'סיור', 1, 8, 16, 2, true, ['s1', 's10'])
  addTask('של"ז', 'של"ז', 1, 8, 16, 1, false, ['s3'])

  return { soldiers, tasks, assignments }
}

// ── localStorage (de)serialization with Date revival ────────────────────────
function load(): SandboxData {
  if (typeof window === 'undefined') return seed()
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) { const s = seed(); save(s); return s }
    const parsed = JSON.parse(raw)
    parsed.tasks = (parsed.tasks ?? []).map((t: Task) => ({
      ...t, start_datetime: new Date(t.start_datetime), end_datetime: new Date(t.end_datetime),
    }))
    return parsed as SandboxData
  } catch { const s = seed(); return s }
}

function save(d: SandboxData) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)) } catch { /* ignore */ }
}

export default function DemoSandbox() {
  const [data, setData] = useState<SandboxData | null>(null)
  const [tab, setTab] = useState<'soldier' | 'admin'>('soldier')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  useEffect(() => { setData(load()) }, [])

  function update(next: SandboxData) { setData(next); save(next) }

  // ── Admin operations ──
  function addSoldierToTask(taskId: string, soldierId: string) {
    if (!data) return
    if (data.assignments.some(a => a.task_id === taskId && a.soldier_id === soldierId)) return
    const order = data.assignments.filter(a => a.task_id === taskId).length
    update({ ...data, assignments: [...data.assignments, { id: uid('a'), task_id: taskId, soldier_id: soldierId, order }] })
  }
  function removeSoldierFromTask(taskId: string, soldierId: string) {
    if (!data) return
    update({ ...data, assignments: data.assignments.filter(a => !(a.task_id === taskId && a.soldier_id === soldierId)) })
  }
  function deleteTask(taskId: string) {
    if (!data) return
    update({
      ...data,
      tasks: data.tasks.filter(t => t.id !== taskId),
      assignments: data.assignments.filter(a => a.task_id !== taskId),
    })
    if (selectedTaskId === taskId) setSelectedTaskId(null)
  }
  function addTask(form: { type: string; dayOffset: number; start: number; end: number; count: number }) {
    if (!data) return
    const id = uid('t')
    const t: Task = {
      id, schedule_id: 'demo', task_name: form.type, task_type: form.type, difficulty: 'hard',
      start_datetime: dayAt(form.dayOffset, form.start), end_datetime: dayAt(form.dayOffset, form.end),
      required_people_count: form.count, requires_commander: false,
    }
    update({ ...data, tasks: [...data.tasks, t] })
    setSelectedTaskId(id)
  }
  function reset() {
    const s = seed(); update(s); setSelectedTaskId(null)
  }

  if (!data) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white" dir="rtl">טוען דמו…</div>
  }

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      {/* Header + credentials banner */}
      <div className="bg-gradient-to-l from-indigo-700 to-purple-700 text-white px-4 py-3 shadow">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black">🧪 שבצ"ק — סביבת דמו</h1>
            <p className="text-xs text-indigo-100">נתונים מזויפים בלבד · אפשר לשחק חופשי · לא מחובר לנתונים אמיתיים</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs bg-white/15 rounded-lg px-3 py-1.5">
              שם משתמש: <b>{DEMO_USER}</b> · סיסמה: <b>{DEMO_PASS}</b>
            </span>
            <button onClick={reset} className="text-xs bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 font-semibold transition">
              ↺ אפס דמו
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4 pt-4">
        <div className="flex gap-2 border-b border-slate-200">
          <button onClick={() => setTab('soldier')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${tab === 'soldier' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            👁 תצוגת לוחם
          </button>
          <button onClick={() => setTab('admin')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${tab === 'admin' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            🛠 ניהול (אדמין פתוח)
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">
        {tab === 'soldier' && (
          <ScheduleGrid
            tasks={data.tasks}
            assignments={data.assignments}
            soldiers={data.soldiers}
            finalLeave={[]}
            dayStartHour={DAY_START}
            showAllDays
          />
        )}

        {tab === 'admin' && (
          <AdminEditor
            data={data}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            onAddTask={addTask}
            onDeleteTask={deleteTask}
            onAssign={addSoldierToTask}
            onUnassign={removeSoldierFromTask}
          />
        )}
      </div>
    </div>
  )
}

// ── Admin editor: add/delete tasks, assign/unassign soldiers ────────────────
function AdminEditor({
  data, selectedTaskId, onSelectTask, onAddTask, onDeleteTask, onAssign, onUnassign,
}: {
  data: SandboxData
  selectedTaskId: string | null
  onSelectTask: (id: string | null) => void
  onAddTask: (f: { type: string; dayOffset: number; start: number; end: number; count: number }) => void
  onDeleteTask: (id: string) => void
  onAssign: (taskId: string, soldierId: string) => void
  onUnassign: (taskId: string, soldierId: string) => void
}) {
  const [type, setType] = useState(TASK_TYPES[0])
  const [dayOffset, setDayOffset] = useState(0)
  const [start, setStart] = useState(8)
  const [end, setEnd] = useState(16)
  const [count, setCount] = useState(1)

  const tasksByDay = useMemo(() => {
    const m: Record<string, Task[]> = {}
    for (const t of [...data.tasks].sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())) {
      (m[isoDay(t.start_datetime)] ??= []).push(t)
    }
    return m
  }, [data.tasks])

  const soldierById = useMemo(() => Object.fromEntries(data.soldiers.map(s => [s.id, s])), [data.soldiers])
  const selectedTask = data.tasks.find(t => t.id === selectedTaskId) ?? null
  const assignedToSelected = selectedTask ? data.assignments.filter(a => a.task_id === selectedTask.id).map(a => a.soldier_id) : []

  const dayLabel = (iso: string) => {
    const d = new Date(iso + 'T12:00:00')
    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
    return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
  }
  const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:00`

  return (
    <div className="grid md:grid-cols-3 gap-5">
      {/* Tasks list + add */}
      <div className="md:col-span-2 space-y-4">
        {/* Add task form */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 text-sm mb-3">➕ הוסף משימה</h3>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="text-xs text-slate-500">סוג
              <select value={type} onChange={e => setType(e.target.value)} className="block border border-slate-300 rounded-lg px-2 py-1.5 text-sm mt-0.5">
                {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">יום
              <select value={dayOffset} onChange={e => setDayOffset(Number(e.target.value))} className="block border border-slate-300 rounded-lg px-2 py-1.5 text-sm mt-0.5">
                <option value={0}>היום</option>
                <option value={1}>מחר</option>
                <option value={2}>מחרתיים</option>
              </select>
            </label>
            <label className="text-xs text-slate-500">משעה
              <select value={start} onChange={e => setStart(Number(e.target.value))} className="block border border-slate-300 rounded-lg px-2 py-1.5 text-sm mt-0.5">
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">עד שעה
              <select value={end} onChange={e => setEnd(Number(e.target.value))} className="block border border-slate-300 rounded-lg px-2 py-1.5 text-sm mt-0.5">
                {Array.from({ length: 25 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">כמות
              <input type="number" min={1} max={10} value={count} onChange={e => setCount(Math.max(1, Number(e.target.value)))}
                className="block border border-slate-300 rounded-lg px-2 py-1.5 text-sm mt-0.5 w-16" />
            </label>
            <button onClick={() => onAddTask({ type, dayOffset, start, end, count })}
              className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-indigo-700 transition">
              הוסף
            </button>
          </div>
        </div>

        {/* Tasks grouped by day */}
        {Object.keys(tasksByDay).length === 0
          ? <p className="text-sm text-slate-400 text-center py-8">אין משימות — הוסף אחת למעלה</p>
          : Object.entries(tasksByDay).map(([day, tasks]) => (
            <div key={day}>
              <div className="text-xs font-bold text-slate-500 mb-2">{dayLabel(day)}</div>
              <div className="space-y-2">
                {tasks.map(t => {
                  const assigned = data.assignments.filter(a => a.task_id === t.id)
                  const isSel = t.id === selectedTaskId
                  const short = assigned.length < t.required_people_count
                  return (
                    <div key={t.id}
                      onClick={() => onSelectTask(isSel ? null : t.id)}
                      className={`bg-white rounded-xl px-4 py-3 shadow-sm border cursor-pointer transition ${isSel ? 'border-indigo-500 ring-1 ring-indigo-300' : 'border-slate-100 hover:border-slate-300'}`}>
                      <div className="flex justify-between items-center gap-2">
                        <div className="font-semibold text-slate-800 text-sm">
                          {t.task_name} <span className="text-xs text-slate-400">{hhmm(t.start_datetime)}–{hhmm(t.end_datetime)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${short ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {assigned.length}/{t.required_people_count}
                          </span>
                          <button onClick={e => { e.stopPropagation(); onDeleteTask(t.id) }}
                            className="text-slate-300 hover:text-red-500 text-sm" title="מחק">🗑</button>
                        </div>
                      </div>
                      {assigned.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {assigned.map(a => (
                            <span key={a.id} className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 rounded-md px-2 py-0.5">
                              {soldierById[a.soldier_id]?.is_commander && <span className="text-amber-500">★</span>}
                              {soldierById[a.soldier_id]?.full_name ?? '?'}
                              <button onClick={e => { e.stopPropagation(); onUnassign(t.id, a.soldier_id) }}
                                className="text-slate-400 hover:text-red-500">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
      </div>

      {/* Assign panel */}
      <div className="md:col-span-1">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 sticky top-4">
          <h3 className="font-bold text-slate-700 text-sm mb-1">👥 שיבוץ חיילים</h3>
          {selectedTask
            ? <p className="text-xs text-indigo-600 mb-3">נבחרה: {selectedTask.task_name} ({hhmm(selectedTask.start_datetime)})</p>
            : <p className="text-xs text-slate-400 mb-3">בחר משימה מהרשימה כדי לשבץ אליה</p>}
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {data.soldiers.map(s => {
              const on = assignedToSelected.includes(s.id)
              return (
                <button key={s.id} disabled={!selectedTask}
                  onClick={() => selectedTask && (on ? onUnassign(selectedTask.id, s.id) : onAssign(selectedTask.id, s.id))}
                  className={`w-full text-right flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition disabled:opacity-40 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-50 hover:bg-slate-100 text-slate-700'}`}>
                  <span>{s.is_commander && <span className={on ? 'text-amber-300' : 'text-amber-500'}>★ </span>}{s.full_name}</span>
                  <span>{on ? '✓' : '+'}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
