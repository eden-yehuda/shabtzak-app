import { useState, useMemo, useEffect } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import AdminLayout from '@/components/layout/AdminLayout'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import SoldierPanel from '@/components/admin/SoldierPanel'
import TaskModal from '@/components/admin/TaskModal'
import SyncFromSheets from '@/components/admin/SyncFromSheets'
import ValidationPanel from '@/components/admin/ValidationPanel'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { useAuth } from '@/hooks/useAuth'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { validateSchedule } from '@/utils/validation'
import { createSchedule } from '@/lib/firestore'
import type { ValidationError } from '@/types'

function isoDate(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

function addDaysToDate(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

export default function NewSchedule() {
  const { uid } = useAuth()
  const soldiers = useSoldiers()
  const finalLeave = useFinalLeave()

  // Step 1 state
  const [scheduleName, setScheduleName] = useState('')
  const today = useMemo(() => { const d = new Date(); d.setHours(12,0,0,0); return d }, [])
  const [startDate, setStartDate] = useState(() => isoDate(today))
  const [endDate, setEndDate] = useState(() => isoDate(addDaysToDate(today, 7)))
  const [dayStartHour, setDayStartHour] = useState(6)
  const [homeLeaveHour, setHomeLeaveHour] = useState(14)

  // Builder state
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [scheduleStart, setScheduleStart] = useState<Date>(today)
  const [scheduleEnd, setScheduleEnd] = useState<Date>(addDaysToDate(today, 7))
  const { tasks, assignments } = useScheduleTasks(scheduleId)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)

  // Validation
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [showValidation, setShowValidation] = useState(false)
  const [llmChecked, setLlmChecked] = useState(false)
  const [llmResult, setLlmResult] = useState<string | null>(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)

  // Live validation — runs whenever tasks/assignments change
  useEffect(() => {
    if (!scheduleId) return
    const errors = validateSchedule(tasks, assignments, soldiers, finalLeave)
    setValidationErrors(errors)
    setLlmChecked(false) // reset LLM check on any change
  }, [tasks, assignments, soldiers, finalLeave, scheduleId])

  async function initSchedule() {
    if (scheduleId || !scheduleName || !uid) return
    const start = new Date(startDate + 'T12:00:00')
    const end = new Date(endDate + 'T12:00:00')
    const ref = await createSchedule({
      name: scheduleName,
      start_datetime: start,
      end_datetime: end,
      status: 'draft',
      created_by: uid,
      day_start_hour: dayStartHour,
      home_leave_hour: homeLeaveHour,
    })
    setScheduleId(ref.id)
    setScheduleStart(start)
    setScheduleEnd(end)
  }

  async function runLlmCheck() {
    setLlmLoading(true)
    setLlmResult(null)
    try {
      const res = await fetch('/.netlify/functions/validate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleName, tasks, assignments, soldiers, finalLeave }),
      })
      const data = await res.json()
      if (data.error) setLlmResult(`⚠️ ${data.error}`)
      else { setLlmResult(data.result); setLlmChecked(true) }
    } catch {
      setLlmResult('שגיאה בחיבור לשרת — ודא שה-ANTHROPIC_API_KEY מוגדר ב-Netlify')
    } finally {
      setLlmLoading(false)
    }
  }

  async function publish() {
    if (!scheduleId) return
    try {
      await updateDoc(doc(db, 'schedules', scheduleId), { status: 'published' })
    } catch { alert('פרסום נכשל — נסה שוב') }
    setConfirmPublish(false)
  }

  const errorCount = validationErrors.filter(e => e.type === 'error').length
  const warnCount = validationErrors.filter(e => e.type === 'warning').length

  // ── Step 1: create schedule ──────────────────────────────────────────────
  if (!scheduleId) {
    return (
      <AdminLayout>
        <h1 className="text-2xl font-bold text-navy mb-6">{'שבצ"ק חדש'}</h1>
        <div className="max-w-sm space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">{'שם השבצ"ק'}</label>
            <input placeholder={'למשל: שבצ"ק שבוע 1'} value={scheduleName}
              onChange={e => setScheduleName(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-navy" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-700 mb-1">מתאריך</label>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value) }}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-700 mb-1">עד תאריך</label>
              <input type="date" value={endDate} min={startDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-navy" />
            </div>
          </div>
          {/* Swap / shift times */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">שעות מעבר</p>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  תחילת יום צבאי
                  <span className="text-slate-400 font-normal mr-1">(midnight boundary)</span>
                </label>
                <select value={dayStartHour} onChange={e => setDayStartHour(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-navy">
                  {Array.from({ length: 12 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  שעת חילופים
                  <span className="text-slate-400 font-normal mr-1">(יציאה/כניסה)</span>
                </label>
                <select value={homeLeaveHour} onChange={e => setHomeLeaveHour(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-navy">
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              משמרת ראשונה תתחיל ב-<strong>{String(homeLeaveHour).padStart(2,'0')}:00</strong> — ניתן לשנות מאוחר יותר
            </p>
          </div>
          <button onClick={initSchedule} disabled={!scheduleName || !uid}
            className="w-full bg-navy text-white rounded-xl py-3 font-semibold disabled:opacity-40 text-sm">
            {'צור שבצ"ק →'}
          </button>
        </div>
      </AdminLayout>
    )
  }

  // ── Step 2: builder ──────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="text-lg font-bold text-navy">{scheduleName}</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowTaskModal(true)}
            className="bg-navy text-white rounded-xl px-4 py-2 text-sm font-semibold">
            + הוסף משימה
          </button>

          <button onClick={() => setShowSyncModal(true)}
            className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:border-navy hover:text-navy transition">
            📊 סנכרון שבצ&quot;ק
          </button>

          {/* Live validation badge */}
          <button onClick={() => setShowValidation(v => !v)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold border transition ${
              errorCount > 0 ? 'bg-red-50 border-red-300 text-red-700' :
              warnCount > 0 ? 'bg-yellow-50 border-yellow-300 text-yellow-700' :
              'bg-green-50 border-green-300 text-green-700'
            }`}>
            {errorCount > 0 ? `⛔ ${errorCount} שגיאות` : warnCount > 0 ? `⚠️ ${warnCount} אזהרות` : '✓ תקין'}
          </button>

          {/* LLM check */}
          <button onClick={runLlmCheck} disabled={llmLoading || tasks.length === 0}
            className="border border-purple-300 text-purple-700 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40 hover:bg-purple-50 transition">
            {llmLoading ? '🤖 בודק...' : llmChecked ? '🤖 ✓ נבדק' : '🤖 בדוק שבצ"ק'}
          </button>

          {/* Publish */}
          <button onClick={() => { if (llmChecked || errorCount === 0) setConfirmPublish(true) }}
            disabled={!llmChecked && errorCount > 0}
            title={!llmChecked ? 'יש לבצע בדיקת שבצ"ק לפני פרסום' : ''}
            className="bg-green-600 text-white rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40">
            פרסם ✓
          </button>
        </div>
      </div>

      {/* LLM result */}
      {llmResult && (
        <div className={`rounded-xl p-4 mb-4 text-sm whitespace-pre-wrap border ${
          llmResult.includes('✅') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-purple-50 border-purple-200 text-purple-900'
        }`} dir="rtl">
          <div className="font-bold mb-1">🤖 בדיקת AI</div>
          {llmResult}
        </div>
      )}

      {/* Inline validation */}
      {showValidation && validationErrors.length > 0 && (
        <div className="mb-4">
          <ValidationPanel errors={validationErrors} />
        </div>
      )}

      {/* Main builder: grid + soldier panel */}
      <div className="flex gap-4 items-start" dir="rtl">
        <div className="flex-1 min-w-0">
          {tasks.length === 0
            ? <div className="border-2 border-dashed border-slate-200 rounded-xl py-16 text-center text-slate-400 text-sm">
                לחץ &quot;+ הוסף משימה&quot; כדי להתחיל
              </div>
            : <ScheduleGrid
                tasks={tasks}
                assignments={assignments}
                soldiers={soldiers}
                finalLeave={finalLeave}
                builderMode
                selectedTaskId={selectedTaskId}
                onSelectTask={id => setSelectedTaskId(prev => prev === id ? null : id)}
                onRemoveSoldier={async (taskId, soldierId) => {
                  const { deleteAssignment } = await import('@/lib/firestore')
                  const a = assignments.find(a => a.task_id === taskId && a.soldier_id === soldierId)
                  if (a) await deleteAssignment(a.id)
                }}
              />
          }
        </div>

        <div className="w-56 shrink-0 sticky top-4">
          <SoldierPanel
            soldiers={soldiers}
            assignments={assignments}
            tasks={tasks}
            finalLeave={finalLeave}
            selectedTaskId={selectedTaskId}
          />
        </div>
      </div>

      {showTaskModal && (
        <TaskModal
          scheduleId={scheduleId}
          scheduleStart={scheduleStart}
          scheduleEnd={scheduleEnd}
          defaultStartHour={homeLeaveHour}
          onClose={() => setShowTaskModal(false)}
        />
      )}

      {showSyncModal && (
        <SyncFromSheets
          scheduleId={scheduleId}
          scheduleStart={scheduleStart}
          scheduleEnd={scheduleEnd}
          soldiers={soldiers}
          tasks={tasks}
          assignments={assignments}
          onClose={() => setShowSyncModal(false)}
        />
      )}

      {confirmPublish && (
        <ConfirmModal
          message={errorCount > 0
            ? `ישנן ${errorCount} שגיאות פתוחות. לפרסם בכל זאת?`
            : `לפרסם את השבצ"ק? הלוחמים יראו אותו מיידית.`}
          onConfirm={publish}
          onCancel={() => setConfirmPublish(false)}
        />
      )}
    </AdminLayout>
  )
}
