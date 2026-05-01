import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
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
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { useSchedule } from '@/hooks/useSchedules'
import { validateSchedule } from '@/utils/validation'
import type { ValidationError } from '@/types'

export default function EditSchedule() {
  const router = useRouter()
  const scheduleId = typeof router.query.id === 'string' ? router.query.id : null

  const schedule = useSchedule(scheduleId)
  const soldiers = useSoldiers()
  const finalLeave = useFinalLeave()
  const { tasks, assignments } = useScheduleTasks(scheduleId)

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [showValidation, setShowValidation] = useState(false)
  const [llmChecked, setLlmChecked] = useState(false)
  const [llmResult, setLlmResult] = useState<string | null>(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)

  useEffect(() => {
    if (!scheduleId) return
    const errors = validateSchedule(tasks, assignments, soldiers, finalLeave)
    setValidationErrors(errors)
    setLlmChecked(false)
  }, [tasks, assignments, soldiers, finalLeave, scheduleId])

  async function runLlmCheck() {
    if (!schedule) return
    setLlmLoading(true)
    setLlmResult(null)
    try {
      const res = await fetch('/.netlify/functions/validate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleName: schedule.name, tasks, assignments, soldiers, finalLeave }),
      })
      const data = await res.json()
      if (data.error) setLlmResult(`⚠️ ${data.error}`)
      else { setLlmResult(data.result); setLlmChecked(true) }
    } catch {
      setLlmResult('שגיאה בחיבור לשרת')
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

  async function unpublish() {
    if (!scheduleId) return
    try {
      await updateDoc(doc(db, 'schedules', scheduleId), { status: 'draft' })
    } catch { alert('ביטול פרסום נכשל') }
  }

  const errorCount = validationErrors.filter(e => e.type === 'error').length
  const warnCount = validationErrors.filter(e => e.type === 'warning').length

  if (!scheduleId) return null

  if (!schedule) {
    return (
      <AdminLayout>
        <div className="text-center py-20 text-slate-400">טוען שבצ&quot;ק...</div>
      </AdminLayout>
    )
  }

  const scheduleStart = schedule.start_datetime
  const scheduleEnd = schedule.end_datetime

  return (
    <AdminLayout>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div>
          <button onClick={() => router.back()} className="text-xs text-slate-400 hover:text-navy mb-1 block">← חזרה</button>
          <h1 className="text-lg font-bold text-navy">{schedule.name}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            schedule.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {schedule.status === 'published' ? '✓ מפורסם' : 'טיוטה'}
          </span>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowTaskModal(true)}
            className="bg-navy text-white rounded-xl px-4 py-2 text-sm font-semibold">
            + הוסף משימה
          </button>

          <button onClick={() => setShowSyncModal(true)}
            className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:border-navy hover:text-navy transition">
            📊 סנכרון שבצ&quot;ק
          </button>

          <button onClick={() => setShowValidation(v => !v)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold border transition ${
              errorCount > 0 ? 'bg-red-50 border-red-300 text-red-700' :
              warnCount > 0 ? 'bg-yellow-50 border-yellow-300 text-yellow-700' :
              'bg-green-50 border-green-300 text-green-700'
            }`}>
            {errorCount > 0 ? `⛔ ${errorCount} שגיאות` : warnCount > 0 ? `⚠️ ${warnCount} אזהרות` : '✓ תקין'}
          </button>

          <button onClick={runLlmCheck} disabled={llmLoading || tasks.length === 0}
            className="border border-purple-300 text-purple-700 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40 hover:bg-purple-50 transition">
            {llmLoading ? '🤖 בודק...' : llmChecked ? '🤖 ✓ נבדק' : '🤖 בדוק שבצ"ק'}
          </button>

          {schedule.status === 'published' ? (
            <button onClick={unpublish}
              className="border border-slate-300 text-slate-600 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-slate-50">
              בטל פרסום
            </button>
          ) : (
            <button onClick={() => { if (llmChecked || errorCount === 0) setConfirmPublish(true) }}
              disabled={!llmChecked && errorCount > 0}
              className="bg-green-600 text-white rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40">
              פרסם ✓
            </button>
          )}
        </div>
      </div>

      {llmResult && (
        <div className={`rounded-xl p-4 mb-4 text-sm whitespace-pre-wrap border ${
          llmResult.includes('✅') ? 'bg-green-50 border-green-200 text-green-800' : 'bg-purple-50 border-purple-200 text-purple-900'
        }`} dir="rtl">
          <div className="font-bold mb-1">🤖 בדיקת AI</div>
          {llmResult}
        </div>
      )}

      {showValidation && validationErrors.length > 0 && (
        <div className="mb-4">
          <ValidationPanel errors={validationErrors} />
        </div>
      )}

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
