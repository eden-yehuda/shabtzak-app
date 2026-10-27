import { useEffect, useMemo, useState } from 'react'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import SoldierPanel from '@/components/admin/SoldierPanel'
import type { Task, Assignment, Soldier } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Self-contained DEMO sandbox — the REAL advanced schedule builder on isolated,
// fake data. Everything lives in localStorage; it NEVER reads or writes Firestore,
// so it cannot touch or expose the real (sensitive) unit data. Open to all, no login.
// ─────────────────────────────────────────────────────────────────────────────

const STORE_KEY = 'demo_sandbox_v2'
const DAY_START = 6
const DEMO_USER = 'demo'
const DEMO_PASS = '1234'
const TASK_TYPES = ['כ"כ א', 'כ"כ ב', 'סיור', 'ש"ג', 'כוננות', 'תורן מטבח', 'תורן רס"פ', 'של"ז', 'בלת"מ', 'אחורית']

interface SandboxData { soldiers: Soldier[]; tasks: Task[]; assignments: Assignment[] }

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 9)}` }
function dayAt(offset: number, hour: number): Date { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(hour, 0, 0, 0); return d }
function isoDay(d: Date) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') }
const HOUR = 3_600_000

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
    { id: 's11', full_name: 'גיא אלון', team: 'חוליה 3', is_active: true, is_commander: false, notes: '', fixed_home_ranges: [] },
    { id: 's12', full_name: 'איתי פז', team: 'חוליה 1', is_active: true, is_commander: false, notes: '', fixed_home_ranges: [] },
  ]
  const tasks: Task[] = []
  const assignments: Assignment[] = []
  const add = (type: string, off: number, s: number, e: number, count: number, cmd: boolean, who: string[]) => {
    const id = uid('t')
    tasks.push({ id, schedule_id: 'demo', task_name: type, task_type: type, difficulty: 'hard', start_datetime: dayAt(off, s), end_datetime: dayAt(off, e), required_people_count: count, requires_commander: cmd })
    who.forEach((sid, i) => assignments.push({ id: uid('a'), task_id: id, soldier_id: sid, order: i }))
  }
  // Day 0
  add('ש"ג', 0, 6, 14, 1, false, ['s3'])
  add('ש"ג', 0, 14, 22, 1, false, ['s4'])
  add('סיור', 0, 8, 16, 2, true, ['s2', 's6'])
  add('כ"כ א', 0, 6, 18, 2, false, ['s7', 's8'])
  add('תורן מטבח', 0, 6, 18, 1, false, ['s9'])
  add('כוננות', 0, 18, 24, 2, false, ['s10', 's11'])
  // Day 1
  add('ש"ג', 1, 6, 14, 1, false, ['s5'])
  add('סיור', 1, 8, 16, 2, true, ['s1', 's12'])
  add('של"ז', 1, 8, 16, 1, false, ['s3'])
  add('כ"כ ב', 1, 14, 22, 2, false, ['s6', 's7'])
  return { soldiers, tasks, assignments }
}

function load(): SandboxData {
  if (typeof window === 'undefined') return seed()
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) { const s = seed(); save(s); return s }
    const p = JSON.parse(raw)
    p.tasks = (p.tasks ?? []).map((t: Task) => ({ ...t, start_datetime: new Date(t.start_datetime), end_datetime: new Date(t.end_datetime) }))
    return p as SandboxData
  } catch { return seed() }
}
function save(d: SandboxData) { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)) } catch { /* ignore */ } }

export default function DemoSandbox() {
  const [sandbox, setSandbox] = useState<SandboxData | null>(null)
  const [tab, setTab] = useState<'soldier' | 'admin'>('admin')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [colOrder, setColOrder] = useState<string[] | undefined>(undefined)

  // add-task form
  const [fType, setFType] = useState(TASK_TYPES[0])
  const [fDay, setFDay] = useState(0)
  const [fStart, setFStart] = useState(8)
  const [fEnd, setFEnd] = useState(16)
  const [fCount, setFCount] = useState(2)

  useEffect(() => { setSandbox(load()) }, [])
  function update(next: SandboxData) { setSandbox(next); save(next) }

  const minDate = useMemo(() => isoDay(new Date()), [])

  if (!sandbox) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white" dir="rtl">טוען דמו…</div>
  const data: SandboxData = sandbox

  // ── Task helpers ──
  const findTask = (id: string) => data.tasks.find(t => t.id === id)
  const setTasks = (tasks: Task[]) => update({ ...data, tasks })
  const patchTask = (id: string, patch: Partial<Task>) => setTasks(data.tasks.map(t => t.id === id ? { ...t, ...patch } : t))

  // ── Builder handlers (mirror the real admin, on local data) ──
  function onCreateTaskAtSlot(date: string, hour: number, taskType: string) {
    const template = data.tasks.find(t => t.task_type === taskType)
    const start = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`)
    const durH = template ? (template.end_datetime.getTime() - template.start_datetime.getTime()) / HOUR : 8
    const t: Task = {
      id: uid('t'), schedule_id: 'demo', task_type: taskType, task_name: template?.task_name ?? taskType,
      difficulty: 'hard', start_datetime: start, end_datetime: new Date(start.getTime() + durH * HOUR),
      required_people_count: template?.required_people_count ?? 2, requires_commander: template?.requires_commander ?? false,
    }
    update({ ...data, tasks: [...data.tasks, t] })
  }
  function onDeleteTask(id: string) {
    update({ ...data, tasks: data.tasks.filter(t => t.id !== id), assignments: data.assignments.filter(a => a.task_id !== id) })
    if (selectedTaskId === id) setSelectedTaskId(null)
  }
  function onMoveTask(id: string, hourDelta: number) {
    const t = findTask(id); if (!t) return
    patchTask(id, { start_datetime: new Date(t.start_datetime.getTime() + hourDelta * HOUR), end_datetime: new Date(t.end_datetime.getTime() + hourDelta * HOUR) })
  }
  function onResizeTask(id: string, endHourDelta: number) {
    const t = findTask(id); if (!t) return
    const newEnd = new Date(t.end_datetime.getTime() + endHourDelta * HOUR)
    if (newEnd.getTime() - t.start_datetime.getTime() < 30 * 60_000) return
    patchTask(id, { end_datetime: newEnd })
  }
  function onResizeTaskStart(id: string, startHourDelta: number) {
    const t = findTask(id); if (!t) return
    const newStart = new Date(t.start_datetime.getTime() + startHourDelta * HOUR)
    if (t.end_datetime.getTime() - newStart.getTime() < HOUR) return
    patchTask(id, { start_datetime: newStart })
  }
  function onMoveTaskToSlot(id: string, date: string, hour: number) {
    const t = findTask(id); if (!t) return
    const dur = t.end_datetime.getTime() - t.start_datetime.getTime()
    const newStart = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`)
    patchTask(id, { start_datetime: newStart, end_datetime: new Date(newStart.getTime() + dur) })
  }
  function onDeleteColumn(taskType: string) {
    if (!window.confirm(`למחוק את כל משימות "${taskType}"?`)) return
    const ids = new Set(data.tasks.filter(t => t.task_type === taskType).map(t => t.id))
    update({ ...data, tasks: data.tasks.filter(t => !ids.has(t.id)), assignments: data.assignments.filter(a => !ids.has(a.task_id)) })
  }
  // assignment handlers
  function onAssign(taskId: string, soldierId: string) {
    if (data.assignments.some(a => a.task_id === taskId && a.soldier_id === soldierId)) return Promise.resolve()
    const order = data.assignments.filter(a => a.task_id === taskId).length
    update({ ...data, assignments: [...data.assignments, { id: uid('a'), task_id: taskId, soldier_id: soldierId, order }] })
    return Promise.resolve()
  }
  function onRemoveSoldier(taskId: string, soldierId: string) {
    update({ ...data, assignments: data.assignments.filter(a => !(a.task_id === taskId && a.soldier_id === soldierId)) })
  }
  function onToggleActingCommander(taskId: string, soldierId: string, make: boolean) {
    update({
      ...data, assignments: data.assignments.map(a => {
        if (a.task_id !== taskId) return a
        if (a.soldier_id === soldierId) return { ...a, is_acting_commander: make }
        return make ? { ...a, is_acting_commander: false } : a
      })
    })
  }
  function onEditAssignmentNote(taskId: string, soldierId: string, currentNote: string) {
    const note = window.prompt('הערה לשיבוץ (ריק = מחיקה):', currentNote ?? '')
    if (note === null) return
    update({ ...data, assignments: data.assignments.map(a => (a.task_id === taskId && a.soldier_id === soldierId) ? { ...a, note: note.trim() } : a) })
  }
  function onPairSoldiers(taskId: string, a1: string, a2: string) {
    const group = Math.max(0, ...data.assignments.filter(a => a.task_id === taskId).map(a => a.alternating_group ?? 0)) + 1
    update({ ...data, assignments: data.assignments.map(a => (a.task_id === taskId && (a.soldier_id === a1 || a.soldier_id === a2)) ? { ...a, alternating_group: group } : a) })
  }
  function onUnpairSoldier(taskId: string, soldierId: string) {
    const a = data.assignments.find(x => x.task_id === taskId && x.soldier_id === soldierId)
    if (!a?.alternating_group) return
    const g = a.alternating_group
    update({ ...data, assignments: data.assignments.map(x => (x.task_id === taskId && x.alternating_group === g) ? { ...x, alternating_group: undefined } : x) })
  }

  function addTaskFromForm() {
    const start = dayAt(fDay, fStart)
    const end = dayAt(fDay, fEnd > fStart ? fEnd : fStart + 1)
    const t: Task = {
      id: uid('t'), schedule_id: 'demo', task_type: fType, task_name: fType, difficulty: 'hard',
      start_datetime: start, end_datetime: end, required_people_count: fCount, requires_commander: fType === 'סיור',
    }
    update({ ...data, tasks: [...data.tasks, t] })
    setSelectedTaskId(t.id)
  }
  function reset() { const s = seed(); update(s); setSelectedTaskId(null); setColOrder(undefined) }

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      {/* Header + credentials */}
      <div className="bg-gradient-to-l from-indigo-700 to-purple-700 text-white px-4 py-3 shadow">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black">🧪 שבצ"ק — סביבת דמו</h1>
            <p className="text-xs text-indigo-100">האפליקציה האמיתית על נתונים מזויפים · משחק חופשי · מנותק מהנתונים האמיתיים</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs bg-white/15 rounded-lg px-3 py-1.5">משתמש: <b>{DEMO_USER}</b> · סיסמה: <b>{DEMO_PASS}</b></span>
            <button onClick={reset} className="text-xs bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1.5 font-semibold transition">↺ אפס דמו</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 pt-4">
        <div className="flex gap-2 border-b border-slate-200">
          <button onClick={() => setTab('admin')} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${tab === 'admin' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>🛠 בונה השבצ"ק (אדמין)</button>
          <button onClick={() => setTab('soldier')} className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${tab === 'soldier' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>👁 תצוגת לוחם</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5">
        {tab === 'soldier' && (
          <ScheduleGrid tasks={data.tasks} assignments={data.assignments} soldiers={data.soldiers} finalLeave={[]} dayStartHour={DAY_START} showAllDays />
        )}

        {tab === 'admin' && (
          <>
            {/* Add-task toolbar */}
            <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 mb-3 flex flex-wrap gap-2 items-end" dir="rtl">
              <span className="text-sm font-bold text-slate-700 ml-1">➕ הוסף משימה:</span>
              <select value={fType} onChange={e => setFType(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={fDay} onChange={e => setFDay(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                <option value={0}>היום</option><option value={1}>מחר</option><option value={2}>מחרתיים</option>
              </select>
              <select value={fStart} onChange={e => setFStart(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
              <span className="text-slate-400 text-sm">–</span>
              <select value={fEnd} onChange={e => setFEnd(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {Array.from({ length: 25 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
              <input type="number" min={1} max={10} value={fCount} onChange={e => setFCount(Math.max(1, Number(e.target.value)))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-16" title="כמות חיילים" />
              <button onClick={addTaskFromForm} className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-indigo-700 transition">הוסף</button>
              <span className="text-xs text-slate-400 mr-auto">טיפ: לחיצה על משבצת ריקה בלוח יוצרת משימה · גרירה מזיזה · לחיצה על משימה → שיבוץ מימין</span>
            </div>

            <div className="flex gap-4 items-start" dir="rtl">
              <div className="flex-1 min-w-0">
                {data.tasks.length === 0
                  ? <div className="border-2 border-dashed border-slate-200 rounded-xl py-16 text-center text-slate-400 text-sm">הוסף משימה כדי להתחיל</div>
                  : <ScheduleGrid
                      tasks={data.tasks}
                      assignments={data.assignments}
                      soldiers={data.soldiers}
                      finalLeave={[]}
                      builderMode
                      dayStartHour={DAY_START}
                      minDate={minDate}
                      selectedTaskId={selectedTaskId}
                      columnOrder={colOrder}
                      onReorderColumns={setColOrder}
                      onSelectTask={id => setSelectedTaskId(prev => prev === id ? null : id)}
                      onRemoveSoldier={onRemoveSoldier}
                      onToggleActingCommander={onToggleActingCommander}
                      onEditAssignmentNote={onEditAssignmentNote}
                      onDeleteTask={onDeleteTask}
                      onMoveTask={onMoveTask}
                      onResizeTask={onResizeTask}
                      onResizeTaskStart={onResizeTaskStart}
                      onMoveTaskToSlot={onMoveTaskToSlot}
                      onCreateTaskAtSlot={onCreateTaskAtSlot}
                      onDeleteColumn={onDeleteColumn}
                      onPairSoldiers={onPairSoldiers}
                      onUnpairSoldier={onUnpairSoldier}
                    />
                }
              </div>
              <div className="w-80 shrink-0 sticky top-4">
                <SoldierPanel
                  soldiers={data.soldiers}
                  assignments={data.assignments}
                  tasks={data.tasks}
                  finalLeave={[]}
                  selectedTaskId={selectedTaskId}
                  homeLeaveHour={DAY_START}
                  onAssign={onAssign}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
