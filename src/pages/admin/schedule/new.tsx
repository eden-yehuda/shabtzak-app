import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import AdminLayout from '@/components/layout/AdminLayout'
import TaskCard from '@/components/admin/TaskCard'
import SoldierPanel from '@/components/admin/SoldierPanel'
import TaskModal from '@/components/admin/TaskModal'
import ValidationPanel from '@/components/admin/ValidationPanel'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { useAuth } from '@/hooks/useAuth'
import { validateSchedule } from '@/utils/validation'
import { createSchedule } from '@/lib/firestore'
import type { ValidationError } from '@/types'

export default function NewSchedule() {
  const { uid } = useAuth()
  const soldiers = useSoldiers()
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [scheduleName, setScheduleName] = useState('')
  const { tasks, assignments } = useScheduleTasks(scheduleId)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [showValidation, setShowValidation] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)

  async function initSchedule() {
    if (scheduleId || !scheduleName || !uid) return
    const ref = await createSchedule({
      name: scheduleName,
      start_datetime: new Date(),
      end_datetime: new Date(Date.now() + 86400000),
      status: 'draft',
      created_by: uid,
    })
    setScheduleId(ref.id)
  }

  function runValidation() {
    const errors = validateSchedule(tasks, assignments)
    setValidationErrors(errors)
    setShowValidation(true)
  }

  async function publish() {
    if (!scheduleId) return
    try {
      await updateDoc(doc(db, 'schedules', scheduleId), { status: 'published' })
    } catch (err) {
      console.error('publish failed', err)
      alert('פרסום נכשל — נסה שוב')
    }
    setConfirmPublish(false)
  }

  const errorCount = validationErrors.filter(e => e.type === 'error').length

  if (!scheduleId) {
    return (
      <AdminLayout>
        <h1 className="text-2xl font-bold text-navy mb-6">{'שבצ"ק חדש'}</h1>
        <div className="max-w-md">
          <input
            placeholder={'שם השבצ"ק (למשל: שבצ"ק ראשון-שני)'}
            value={scheduleName}
            onChange={e => setScheduleName(e.target.value)}
            className="w-full border rounded-xl px-4 py-3 mb-4"
          />
          <button
            type="button"
            onClick={initSchedule}
            disabled={!scheduleName || !uid}
            className="bg-navy text-white rounded-xl px-6 py-3 font-semibold disabled:opacity-50"
          >
            {'צור שבצ"ק'}
          </button>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div id="schedule-print-area">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold text-navy">{scheduleName}</h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={runValidation}
              className="border border-yellow-400 text-yellow-700 rounded-xl px-4 py-2 text-sm font-semibold"
            >
              {`⚠ בדוק שגיאות${showValidation ? ` (${validationErrors.length})` : ''}`}
            </button>
            <button
              type="button"
              onClick={() => {
                runValidation()
                setConfirmPublish(true)
              }}
              className="bg-green-600 text-white rounded-xl px-4 py-2 text-sm font-semibold"
            >
              {'פרסם'}
            </button>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-semibold text-slate-700">{'משימות'}</h2>
              <button
                type="button"
                onClick={() => setShowTaskModal(true)}
                className="bg-navy text-white rounded-xl px-4 py-2 text-sm font-semibold"
              >
                {'+ הוסף משימה'}
              </button>
            </div>
            {tasks.length === 0 && (
              <p className="text-slate-400 text-sm text-center py-8">{'אין משימות — לחץ "הוסף משימה"'}</p>
            )}
            {tasks
              .slice()
              .sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())
              .map(t => (
                <TaskCard
                  key={t.id}
                  task={t}
                  assignments={assignments}
                  soldiers={soldiers}
                  isSelected={selectedTaskId === t.id}
                  onSelect={() => setSelectedTaskId(prev => prev === t.id ? null : t.id)}
                />
              ))}

            {showValidation && (
              <div className="mt-4">
                <ValidationPanel errors={validationErrors} />
              </div>
            )}
          </div>

          <div className="w-64 flex-shrink-0">
            <SoldierPanel
              soldiers={soldiers}
              assignments={assignments}
              tasks={tasks}
              selectedTaskId={selectedTaskId}
            />
          </div>
        </div>
      </div>

      {showTaskModal && (
        <TaskModal scheduleId={scheduleId} onClose={() => setShowTaskModal(false)} />
      )}

      {confirmPublish && (
        <ConfirmModal
          message={
            errorCount > 0
              ? `ישנן ${errorCount} שגיאות פתוחות. לפרסם בכל זאת?`
              : 'לפרסם את השבצ"ק? הלוחמים יראו אותו מיידית.'
          }
          onConfirm={publish}
          onCancel={() => setConfirmPublish(false)}
        />
      )}
    </AdminLayout>
  )
}
