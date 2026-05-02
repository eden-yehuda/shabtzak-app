import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { doc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp, Timestamp } from 'firebase/firestore'
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
import { deleteAssignment, updateAssignment, createAssignment } from '@/lib/firestore'
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
  const [showErrorPanel, setShowErrorPanel] = useState(false)

  // Undo stack: each entry is an inverse-action that reverts the last change
  type UndoAction = { label: string; undo: () => Promise<void> }
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])
  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack(prev => [...prev.slice(-19), action]) // keep last 20
  }, [])
  const performUndo = useCallback(async () => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      last.undo().catch(e => { console.error(e); alert('ביטול נכשל: ' + e.message) })
      return prev.slice(0, -1)
    })
  }, [])
  // Ctrl+Z to undo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        performUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [performUndo])

  const [llmChecked, setLlmChecked] = useState(false)
  const [llmResult, setLlmResult] = useState<string | null>(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)

  useEffect(() => {
    if (!scheduleId) return
    const errors = validateSchedule(tasks, assignments, soldiers, finalLeave)
    setValidationErrors(errors)
    setLlmChecked(false)
  }, [tasks, assignments, soldiers, finalLeave, scheduleId])

  // Auto-unpublish when opening edit page of published schedule
  useEffect(() => {
    if (!scheduleId || schedule?.status !== 'published') return
    updateDoc(doc(db, 'schedules', scheduleId), { status: 'draft', updated_at: serverTimestamp() })
      .catch(() => {})
  }, [schedule?.id]) // only runs when schedule ID changes (i.e., on load)

  async function runLlmCheck() {
    if (!schedule) return
    setLlmLoading(true)
    setLlmResult(null)
    try {
      const res = await fetch('/.netlify/functions/validate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleName: schedule.name,
          tasks, assignments, soldiers, finalLeave,
          dayStartHour: schedule.day_start_hour ?? 2,
          homeLeaveHour: schedule.home_leave_hour,
        }),
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
    if (!scheduleId || publishing) return
    setPublishing(true)
    try {
      await updateDoc(doc(db, 'schedules', scheduleId), { status: 'published', updated_at: serverTimestamp() })
    } catch { alert('פרסום נכשל — נסה שוב') }
    finally { setPublishing(false) }
    setConfirmPublish(false)
  }

  async function unpublish() {
    if (!scheduleId || unpublishing) return
    setUnpublishing(true)
    try {
      await updateDoc(doc(db, 'schedules', scheduleId), { status: 'draft', updated_at: serverTimestamp() })
    } catch { alert('ביטול פרסום נכשל') }
    finally { setUnpublishing(false) }
  }

  const errorCount = validationErrors.filter(e => e.type === 'error').length
  const warnCount = validationErrors.filter(e => e.type === 'warning').length

  // Auto-unpublish when any edit is made — soldiers won't see mid-edit state
  async function touchSchedule() {
    if (!scheduleId) return
    const update: Record<string, unknown> = { updated_at: serverTimestamp() }
    if (schedule?.status === 'published') update.status = 'draft'
    await updateDoc(doc(db, 'schedules', scheduleId), update)
  }

  async function handleMoveTask(taskId: string, hourDelta: number) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const newStart = new Date(task.start_datetime.getTime() + hourDelta * 3_600_000)
    const newEnd = new Date(task.end_datetime.getTime() + hourDelta * 3_600_000)
    try {
      await updateDoc(doc(db, 'tasks', taskId), { start_datetime: newStart, end_datetime: newEnd })
      await touchSchedule()
    } catch { alert('שגיאה בעדכון שעת משימה') }
  }

  async function handleResizeTask(taskId: string, endHourDelta: number) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const newEnd = new Date(task.end_datetime.getTime() + endHourDelta * 3_600_000)
    if (newEnd <= task.start_datetime) return
    try {
      await updateDoc(doc(db, 'tasks', taskId), { end_datetime: newEnd })
      await touchSchedule()
    } catch { alert('שגיאה בשינוי אורך משימה') }
  }

  async function handleDeleteTask(taskId: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const taskAssignments = assignments.filter(a => a.task_id === taskId)
    try {
      await Promise.all(taskAssignments.map(a => deleteAssignment(a.id)))
      await deleteDoc(doc(db, 'tasks', taskId))
      if (selectedTaskId === taskId) setSelectedTaskId(null)
      await touchSchedule()
      // Undo: re-create task and assignments (with new IDs)
      pushUndo({
        label: `מחיקת משימה ${task.task_type}`,
        undo: async () => {
          const newTask = await addDoc(collection(db, 'tasks'), {
            schedule_id: task.schedule_id,
            task_type: task.task_type,
            task_name: task.task_name,
            start_datetime: Timestamp.fromDate(task.start_datetime),
            end_datetime: Timestamp.fromDate(task.end_datetime),
            requires_commander: task.requires_commander,
            required_people_count: task.required_people_count,
            difficulty: task.difficulty,
            notes: task.notes ?? '',
          })
          await Promise.all(taskAssignments.map(a => createAssignment(newTask.id, a.soldier_id)))
          await touchSchedule()
        },
      })
    } catch { alert('שגיאה במחיקת משימה') }
  }

  async function handleDeleteColumn(taskType: string) {
    if (!scheduleId) return
    if (!confirm(`למחוק את כל משימות "${taskType}" מהשבצ"ק?`)) return
    const typeTasks = tasks.filter(t => t.task_type === taskType)
    try {
      await Promise.all(typeTasks.flatMap(task => {
        const taskAssigns = assignments.filter(a => a.task_id === task.id)
        return [
          ...taskAssigns.map(a => deleteAssignment(a.id)),
          deleteDoc(doc(db, 'tasks', task.id)),
        ]
      }))
      await touchSchedule()
    } catch { alert('שגיאה במחיקת עמודה') }
  }

  async function handleMoveTaskToSlot(taskId: string, date: string, hour: number) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const duration = task.end_datetime.getTime() - task.start_datetime.getTime()
    const newStart = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`)
    const newEnd = new Date(newStart.getTime() + duration)
    const oldStart = task.start_datetime
    const oldEnd = task.end_datetime
    try {
      await updateDoc(doc(db, 'tasks', taskId), { start_datetime: newStart, end_datetime: newEnd })
      await touchSchedule()
      pushUndo({
        label: 'הזזת משימה',
        undo: async () => {
          await updateDoc(doc(db, 'tasks', taskId), {
            start_datetime: Timestamp.fromDate(oldStart),
            end_datetime: Timestamp.fromDate(oldEnd),
          })
          await touchSchedule()
        },
      })
    } catch { alert('שגיאה בהזזת משימה') }
  }

  async function handleCreateTaskAtSlot(date: string, hour: number, taskType: string) {
    if (!scheduleId) return
    // Default 8-hour duration; use existing task in same column as template if found
    const template = tasks.find(t => t.task_type === taskType)
    const start = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`)
    const durationHours = template
      ? Math.round((template.end_datetime.getTime() - template.start_datetime.getTime()) / 3600000)
      : 8
    const end = new Date(start.getTime() + durationHours * 3600000)
    try {
      const newDoc = await addDoc(collection(db, 'tasks'), {
        schedule_id: scheduleId,
        task_type: taskType,
        task_name: template?.task_name ?? taskType,
        start_datetime: Timestamp.fromDate(start),
        end_datetime: Timestamp.fromDate(end),
        requires_commander: template?.requires_commander ?? false,
        required_people_count: template?.required_people_count ?? 3,
        difficulty: template?.difficulty ?? 'normal',
        notes: '',
      })
      await touchSchedule()
      pushUndo({
        label: `יצירת משימה ${taskType}`,
        undo: async () => {
          await deleteDoc(doc(db, 'tasks', newDoc.id))
          await touchSchedule()
        },
      })
    } catch { alert('שגיאה ביצירת משימה') }
  }

  async function handleAssigned(taskId: string, soldierId: string) {
    // Called by SoldierPanel after assignment is created — register undo
    const assignment = assignments.find(a => a.task_id === taskId && a.soldier_id === soldierId)
    pushUndo({
      label: 'שיבוץ חייל',
      undo: async () => {
        // Re-fetch since assignment ID may have changed
        const current = assignments.find(a => a.task_id === taskId && a.soldier_id === soldierId)
        if (current) await deleteAssignment(current.id)
        else if (assignment) await deleteAssignment(assignment.id)
        await touchSchedule()
      },
    })
  }

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

  function isoDateLocal(d: Date) {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
  }

  async function updateScheduleRange(field: 'start_datetime' | 'end_datetime', dateStr: string) {
    if (!scheduleId || !dateStr) return
    const d = new Date(dateStr + 'T12:00:00')
    try {
      await updateDoc(doc(db, 'schedules', scheduleId), { [field]: d })
    } catch { alert('שגיאה בעדכון תאריך') }
  }

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
          {/* Editable date range */}
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500" dir="rtl">
            <span>טווח:</span>
            <input
              type="date"
              defaultValue={isoDateLocal(scheduleStart)}
              key={isoDateLocal(scheduleStart)}
              onChange={e => updateScheduleRange('start_datetime', e.target.value)}
              className="border border-slate-200 rounded px-1 py-0.5 text-xs text-slate-700 focus:outline-none focus:border-navy"
            />
            <span>–</span>
            <input
              type="date"
              defaultValue={isoDateLocal(scheduleEnd)}
              key={isoDateLocal(scheduleEnd)}
              onChange={e => updateScheduleRange('end_datetime', e.target.value)}
              className="border border-slate-200 rounded px-1 py-0.5 text-xs text-slate-700 focus:outline-none focus:border-navy"
            />
          </div>
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

          <button onClick={performUndo} disabled={undoStack.length === 0}
            title={undoStack.length > 0 ? `ביטול: ${undoStack[undoStack.length - 1].label} (Ctrl+Z)` : 'אין פעולה לביטול'}
            className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:border-navy hover:text-navy transition disabled:opacity-30 disabled:cursor-not-allowed">
            ↶ ביטול {undoStack.length > 0 && `(${undoStack.length})`}
          </button>

          <button onClick={() => setShowErrorPanel(v => !v)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold border transition ${
              errorCount > 0 ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100' :
              warnCount > 0 ? 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100' :
              'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
            }`}>
            {errorCount > 0 ? `⛔ ${errorCount} שגיאות` : warnCount > 0 ? `⚠️ ${warnCount} אזהרות` : '✓ תקין'}
          </button>

          <button onClick={runLlmCheck} disabled={llmLoading || tasks.length === 0}
            className="border border-purple-300 text-purple-700 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40 hover:bg-purple-50 transition">
            {llmLoading ? '🤖 בודק...' : llmChecked ? '🤖 ✓ נבדק' : '🤖 בדוק שבצ"ק'}
          </button>

          {schedule.status === 'published' ? (
            <button onClick={unpublish} disabled={unpublishing}
              className="border border-slate-300 text-slate-600 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 disabled:cursor-wait">
              {unpublishing ? '⏳ מבטל פרסום...' : 'בטל פרסום'}
            </button>
          ) : (
            <button onClick={() => setConfirmPublish(true)} disabled={publishing}
              className="bg-green-600 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-green-700 transition disabled:opacity-60 disabled:cursor-wait">
              {publishing ? '⏳ מפרסם...' : 'פרסם ✓'}
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

      {/* Side drawer: validation errors panel */}
      {showErrorPanel && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowErrorPanel(false)} />
          <div className="fixed top-0 left-0 h-full w-96 max-w-[90vw] bg-white shadow-2xl z-50 overflow-y-auto" dir="rtl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center">
              <div className="font-bold text-slate-800">
                {errorCount > 0 ? `⛔ ${errorCount} שגיאות` : warnCount > 0 ? `⚠️ ${warnCount} אזהרות` : '✓ הכל תקין'}
              </div>
              <button onClick={() => setShowErrorPanel(false)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2">
                ×
              </button>
            </div>
            <div className="p-4">
              {validationErrors.length > 0
                ? <ValidationPanel errors={validationErrors} />
                : <p className="text-sm text-green-700 text-center py-8">אין שגיאות בשבצ&quot;ק</p>}
            </div>
          </div>
        </>
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
                dayStartHour={schedule?.day_start_hour ?? 2}
                homeLeaveHour={schedule?.home_leave_hour}
                selectedTaskId={selectedTaskId}
                onSelectTask={id => setSelectedTaskId(prev => prev === id ? null : id)}
                onRemoveSoldier={async (taskId, soldierId) => {
                  const a = assignments.find(a => a.task_id === taskId && a.soldier_id === soldierId)
                  if (a) { await deleteAssignment(a.id); await touchSchedule() }
                }}
                onDeleteTask={handleDeleteTask}
                onMoveTaskToSlot={handleMoveTaskToSlot}
                onCreateTaskAtSlot={handleCreateTaskAtSlot}
                onDeleteColumn={handleDeleteColumn}
                onPairSoldiers={async (taskId, soldierIdA, soldierIdB) => {
                  const taskAssigns = assignments.filter(a => a.task_id === taskId)
                  const maxGroup = Math.max(0, ...taskAssigns.map(a => a.alternating_group ?? 0))
                  const group = maxGroup + 1
                  const aA = taskAssigns.find(a => a.soldier_id === soldierIdA)
                  const aB = taskAssigns.find(a => a.soldier_id === soldierIdB)
                  await Promise.all([
                    aA && updateAssignment(aA.id, { alternating_group: group }),
                    aB && updateAssignment(aB.id, { alternating_group: group }),
                  ].filter(Boolean))
                  await touchSchedule()
                }}
                onUnpairSoldier={async (taskId, soldierId) => {
                  const taskAssigns = assignments.filter(a => a.task_id === taskId)
                  const a = taskAssigns.find(a => a.soldier_id === soldierId)
                  if (!a?.alternating_group) return
                  const group = a.alternating_group
                  const members = taskAssigns.filter(m => m.alternating_group === group)
                  await Promise.all(members.map(m => updateAssignment(m.id, { alternating_group: null })))
                  await touchSchedule()
                }}
              />
          }
        </div>

        <div className="w-80 shrink-0 sticky top-4">
          <SoldierPanel
            soldiers={soldiers}
            assignments={assignments}
            tasks={tasks}
            finalLeave={finalLeave}
            selectedTaskId={selectedTaskId}
            onAssigned={async (taskId: string, soldierId: string) => {
              await touchSchedule()
              await handleAssigned(taskId, soldierId)
              // Auto-assign to consecutive כ"כ ג: when a soldier finishes a סיור shift,
              // assign them to the כ"כ ג shift that STARTS at the moment סיור ends.
              const assignedTask = tasks.find(t => t.id === taskId)
              if (assignedTask?.task_type === 'סיור') {
                const kkkG = tasks.find(t =>
                  t.task_type === 'כ"כ ג' &&
                  t.start_datetime.getTime() === assignedTask.end_datetime.getTime()
                )
                if (kkkG && !assignments.some(a => a.task_id === kkkG.id && a.soldier_id === soldierId)) {
                  await createAssignment(kkkG.id, soldierId)
                }
              }
            }}
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
          onApplied={touchSchedule}
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
