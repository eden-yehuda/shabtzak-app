import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import { doc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp, Timestamp, query, where, orderBy, onSnapshot, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { publishedVersionsRef } from '@/lib/firestore'
import AdminLayout from '@/components/layout/AdminLayout'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import SoldierPanel from '@/components/admin/SoldierPanel'
import TaskModal from '@/components/admin/TaskModal'
import CloneScheduleModal from '@/components/admin/CloneScheduleModal'
import EditColumnModal, { type EditColumnParams } from '@/components/admin/EditColumnModal'
import SyncFromSheets from '@/components/admin/SyncFromSheets'
import ValidationPanel, { errorKey as validationErrorKey } from '@/components/admin/ValidationPanel'
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
  const [highlightedSoldierId, setHighlightedSoldierId] = useState<string | null>(null)
  const [soldierSearch, setSoldierSearch] = useState('')
  const [showSoldierDropdown, setShowSoldierDropdown] = useState(false)
  const filteredSoldiersForSearch = useMemo(() =>
    soldiers.filter(s => s.is_active && s.full_name.includes(soldierSearch)).slice(0, 20),
    [soldiers, soldierSearch]
  )
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [showCloneModal, setShowCloneModal] = useState(false)
  const [cloneLoading, setCloneLoading] = useState(false)
  const [editingColumn, setEditingColumn] = useState<string | null>(null)
  const [copyingKKA, setCopyingKKA] = useState(false)

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [showErrorPanel, setShowErrorPanel] = useState(false)
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{ message: string; execute: () => Promise<void> } | null>(null)

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

  // Column order — persisted per schedule in localStorage
  const [colOrder, setColOrder] = useState<string[] | undefined>(() => {
    if (typeof window === 'undefined') return undefined
    const id = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') ?? '' : ''
    try { return JSON.parse(localStorage.getItem(`colOrder_${id}`) ?? 'null') ?? undefined } catch { return undefined }
  })
  function handleReorderColumns(newOrder: string[]) {
    setColOrder(newOrder)
    if (scheduleId) {
      localStorage.setItem(`colOrder_${scheduleId}`, JSON.stringify(newOrder))
      // Persist to Firestore so soldier-facing view uses the same order
      updateDoc(doc(db, 'schedules', scheduleId), { column_order: newOrder }).catch(console.error)
    }
  }
  // Sync colOrder: prefer Firestore, fall back to localStorage, and sync localStorage → Firestore if needed
  useEffect(() => {
    if (!scheduleId) return
    try {
      const stored = localStorage.getItem(`colOrder_${scheduleId}`)
      const parsed: string[] | null = stored ? JSON.parse(stored) : null
      if (parsed) {
        setColOrder(parsed)
        // If Firestore doesn't have column_order yet, push localStorage value up
        if (!schedule?.column_order) {
          updateDoc(doc(db, 'schedules', scheduleId), { column_order: parsed }).catch(console.error)
        }
      } else if (schedule?.column_order) {
        setColOrder(schedule.column_order)
      }
    } catch { /* ignore */ }
  }, [scheduleId, schedule?.column_order])

  const [llmChecked, setLlmChecked] = useState(false)
  const [llmResult, setLlmResult] = useState<string | null>(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const [publishFreeWarnings, setPublishFreeWarnings] = useState<string[]>([])

  // Bumping this state forces a re-validation (used by the "בדוק שוב" button)
  const [validationBump, setValidationBump] = useState(0)
  useEffect(() => {
    if (!scheduleId) return
    const errors = validateSchedule(tasks, assignments, soldiers, finalLeave)
    setValidationErrors(errors)
    setLlmChecked(false)
  }, [tasks, assignments, soldiers, finalLeave, scheduleId, validationBump])

  // Dismissed-error keys live on the schedule document (per-schedule state, persisted).
  const dismissedKeys = schedule?.dismissed_validation_errors ?? []
  async function dismissError(key: string) {
    if (!scheduleId) return
    const next = Array.from(new Set([...dismissedKeys, key]))
    try {
      await updateDoc(doc(db, 'schedules', scheduleId), { dismissed_validation_errors: next })
      pushUndo({
        label: 'דחיית שגיאה',
        undo: async () => {
          await updateDoc(doc(db, 'schedules', scheduleId), { dismissed_validation_errors: dismissedKeys })
        },
      })
    } catch { alert('דחיית שגיאה נכשלה') }
  }
  async function restoreError(key: string) {
    if (!scheduleId) return
    const next = dismissedKeys.filter(k => k !== key)
    try {
      await updateDoc(doc(db, 'schedules', scheduleId), { dismissed_validation_errors: next })
    } catch { alert('שחזור שגיאה נכשל') }
  }
  const [rechecking, setRechecking] = useState(false)
  function recheckErrors() {
    setRechecking(true)
    setValidationBump(n => n + 1)
    setLlmResult(null)
    setLlmChecked(false)
    // brief visual ack so the user feels the click
    setTimeout(() => setRechecking(false), 700)
  }
  // Counts exclude dismissed errors (since user marked them as OK)
  const dismissedSet = new Set(dismissedKeys)
  const visibleErrors = validationErrors.filter(e => !dismissedSet.has(validationErrorKey(e)))

  const taskErrors = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const e of visibleErrors) {
      if (e.type !== 'error' || !e.task_id) continue
      if (!map[e.task_id]) map[e.task_id] = []
      map[e.task_id].push(e.message)
    }
    return map
  }, [visibleErrors])

  // NOTE: do NOT auto-unpublish on edit. The published version (snapshot) remains visible
  // to soldiers regardless of edits to the working copy. Only an explicit "publish"
  // action saves a new snapshot, and "unpublish" deletes the snapshot.

  // Live list of published versions for this schedule (newest first)
  const [publishedVersions, setPublishedVersions] = useState<Array<{
    id: string
    published_at: Date
    published_by: string
    task_count: number
    assignment_count: number
  }>>([])
  useEffect(() => {
    if (!scheduleId) return
    // No orderBy — would require a composite index. Sort client-side.
    const q = query(publishedVersionsRef(), where('schedule_id', '==', scheduleId))
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          published_at: data.published_at?.toDate?.() ?? new Date(),
          published_by: data.published_by ?? 'משתמש לא ידוע',
          task_count: Array.isArray(data.tasks) ? data.tasks.length : 0,
          assignment_count: Array.isArray(data.assignments) ? data.assignments.length : 0,
        }
      })
      list.sort((a, b) => b.published_at.getTime() - a.published_at.getTime())
      setPublishedVersions(list)
    })
  }, [scheduleId])

  const [showVersionsPanel, setShowVersionsPanel] = useState(false)
  const hasPublishedVersion = publishedVersions.length > 0
  const latestPublishedAt = publishedVersions[0]?.published_at ?? null
  // "Has unpublished changes" if the working copy was updated after the latest publish
  const hasUnpublishedChanges = latestPublishedAt && schedule?.updated_at
    ? schedule.updated_at.getTime() > latestPublishedAt.getTime()
    : !hasPublishedVersion // never published → has changes


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
    if (!scheduleId || publishing || !schedule) return
    setPublishing(true)
    try {
      // Snapshot the entire working copy → published_versions (always full publish)
      await addDoc(publishedVersionsRef(), {
        schedule_id: scheduleId,
        schedule_name: schedule.name,
        schedule_start: Timestamp.fromDate(schedule.start_datetime),
        schedule_end: Timestamp.fromDate(schedule.end_datetime),
        day_start_hour: schedule.day_start_hour ?? 2,
        home_leave_hour: schedule.home_leave_hour ?? null,
        tasks: tasks.map(t => ({
          id: t.id,
          task_type: t.task_type,
          task_name: t.task_name,
          start_datetime: Timestamp.fromDate(t.start_datetime),
          end_datetime: Timestamp.fromDate(t.end_datetime),
          requires_commander: t.requires_commander ?? false,
          required_people_count: t.required_people_count ?? 0,
          notes: t.notes ?? '',
        })),
        assignments: assignments.map(a => ({
          id: a.id,
          task_id: a.task_id,
          soldier_id: a.soldier_id,
          order: a.order ?? 1,
          alternating_group: a.alternating_group ?? null,
          note: a.note ?? '',
          is_acting_commander: a.is_acting_commander ?? false,
        })),
        published_at: serverTimestamp(),
        published_by: typeof window !== 'undefined' ? (localStorage.getItem('admin_name') ?? 'מנהל') : 'מנהל',
      })
      await updateDoc(doc(db, 'schedules', scheduleId), { status: 'published' })
    } catch (e) { console.error(e); alert('פרסום נכשל — נסה שוב') }
    finally { setPublishing(false) }
    setConfirmPublish(false)
  }

  async function unpublish() {
    if (!scheduleId || unpublishing) return
    if (!confirm('ביטול פרסום ימחוק את כל הגרסאות המפורסמות של השבצ"ק. החיילים לא יראו אותו יותר. להמשיך?')) return
    setUnpublishing(true)
    try {
      // Delete all published version snapshots for this schedule
      const q = query(publishedVersionsRef(), where('schedule_id', '==', scheduleId))
      const snap = await getDocs(q)
      const batch = writeBatch(db)
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      // Mark schedule status as draft
      await updateDoc(doc(db, 'schedules', scheduleId), { status: 'draft' })
    } catch (e) { console.error(e); alert('ביטול פרסום נכשל') }
    finally { setUnpublishing(false) }
  }

  async function restoreVersion(versionId: string) {
    if (!scheduleId) return
    if (!confirm('שחזור גרסה ימחק את המצב הנוכחי של השבצ"ק ויחליף אותו בגרסה הזו. להמשיך?')) return
    try {
      // Load the version
      const verSnap = await getDocs(query(publishedVersionsRef(), where('schedule_id', '==', scheduleId)))
      const verDoc = verSnap.docs.find(d => d.id === versionId)
      if (!verDoc) { alert('הגרסה לא נמצאה'); return }
      const verData = verDoc.data()

      // Delete all current tasks + assignments for this schedule
      const taskSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', scheduleId)))
      const assignSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', 'in', taskSnap.docs.map(d => d.id).slice(0, 30))))
      const batch1 = writeBatch(db)
      taskSnap.docs.forEach(d => batch1.delete(d.ref))
      assignSnap.docs.forEach(d => batch1.delete(d.ref))
      await batch1.commit()

      // Re-create tasks (with new IDs); map old→new task IDs
      const oldToNewTaskId: Record<string, string> = {}
      for (const t of (verData.tasks || [])) {
        const newDoc = await addDoc(collection(db, 'tasks'), {
          schedule_id: scheduleId,
          task_type: t.task_type,
          task_name: t.task_name,
          start_datetime: t.start_datetime,
          end_datetime: t.end_datetime,
          requires_commander: t.requires_commander,
          required_people_count: t.required_people_count,
          notes: t.notes ?? '',
          difficulty: 'normal',
        })
        oldToNewTaskId[t.id] = newDoc.id
      }
      // Re-create assignments using new task IDs
      for (const a of (verData.assignments || [])) {
        const newTaskId = oldToNewTaskId[a.task_id]
        if (!newTaskId) continue
        await addDoc(collection(db, 'assignments'), {
          task_id: newTaskId,
          soldier_id: a.soldier_id,
          order: a.order ?? 1,
          ...(a.alternating_group ? { alternating_group: a.alternating_group } : {}),
          ...(a.note ? { note: a.note } : {}),
        })
      }
      await touchSchedule()
      alert('הגרסה שוחזרה בהצלחה')
    } catch (e) { console.error(e); alert('שחזור נכשל: ' + (e as Error).message) }
  }

  const errorCount = visibleErrors.filter(e => e.type === 'error').length
  const warnCount = visibleErrors.filter(e => e.type === 'warning').length

  // Auto-unpublish when any edit is made — soldiers won't see mid-edit state
  // Edits only update the working copy + updated_at marker. The published snapshot
  // and the schedule.status remain untouched until the user explicitly publishes/unpublishes.
  async function touchSchedule() {
    if (!scheduleId) return
    await updateDoc(doc(db, 'schedules', scheduleId), { updated_at: serverTimestamp() })
  }

  async function handleRenameTask(taskId: string, newName: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task || !newName.trim()) return
    const oldName = task.task_name
    if (newName.trim() === oldName) return
    try {
      await updateDoc(doc(db, 'tasks', taskId), { task_name: newName.trim() })
      await touchSchedule()
      pushUndo({
        label: 'שינוי שם משימה',
        undo: async () => {
          await updateDoc(doc(db, 'tasks', taskId), { task_name: oldName })
          await touchSchedule()
        },
      })
    } catch { alert('שגיאה בשינוי שם משימה') }
  }

  async function handleUpdateSwapHour(newHour: number) {
    if (!scheduleId || !schedule) return
    const oldHour = schedule.home_leave_hour ?? schedule.day_start_hour ?? 6
    try {
      await updateDoc(doc(db, 'schedules', scheduleId), { home_leave_hour: newHour, updated_at: serverTimestamp() })
      // Offer to shift all tasks by the delta
      const delta = newHour - oldHour
      if (delta !== 0 && tasks.length > 0) {
        const shouldShift = confirm(
          `שעת החילופים שונתה ב-${delta > 0 ? '+' : ''}${delta} שעות.\nלהזיז את כל המשימות בהתאם?`
        )
        if (shouldShift) {
          const oldTimes = tasks.map(t => ({ id: t.id, start: t.start_datetime, end: t.end_datetime }))
          for (const t of tasks) {
            const newStart = new Date(t.start_datetime.getTime() + delta * 3_600_000)
            const newEnd   = new Date(t.end_datetime.getTime()   + delta * 3_600_000)
            await updateDoc(doc(db, 'tasks', t.id), {
              start_datetime: Timestamp.fromDate(newStart),
              end_datetime:   Timestamp.fromDate(newEnd),
            })
          }
          await touchSchedule()
          pushUndo({
            label: 'הזזת כל המשימות לפי שעת חילופים',
            undo: async () => {
              for (const { id, start, end } of oldTimes) {
                await updateDoc(doc(db, 'tasks', id), {
                  start_datetime: Timestamp.fromDate(start),
                  end_datetime:   Timestamp.fromDate(end),
                })
              }
              await updateDoc(doc(db, 'schedules', scheduleId!), { home_leave_hour: oldHour, updated_at: serverTimestamp() })
            },
          })
        }
      }
    } catch { alert('שגיאה בעדכון שעת חילופים') }
  }

  async function doMoveTask(taskId: string, hourDelta: number) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const oldStart = task.start_datetime
    const oldEnd = task.end_datetime
    const newStart = new Date(oldStart.getTime() + hourDelta * 3_600_000)
    const newEnd = new Date(oldEnd.getTime() + hourDelta * 3_600_000)
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
    } catch { alert('שגיאה בעדכון שעת משימה') }
  }

  async function handleResizeTask(taskId: string, endHourDelta: number) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const oldEnd = task.end_datetime
    const newEnd = new Date(oldEnd.getTime() + endHourDelta * 3_600_000)
    // Minimum task length: 30 minutes
    if (newEnd.getTime() - task.start_datetime.getTime() < 30 * 60_000) return
    try {
      await updateDoc(doc(db, 'tasks', taskId), { end_datetime: newEnd })
      await touchSchedule()
      pushUndo({
        label: 'שינוי אורך משימה',
        undo: async () => {
          await updateDoc(doc(db, 'tasks', taskId), { end_datetime: Timestamp.fromDate(oldEnd) })
          await touchSchedule()
        },
      })
    } catch { alert('שגיאה בשינוי אורך משימה') }
  }

  async function handleResizeTaskStart(taskId: string, startHourDelta: number) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const oldStart = task.start_datetime
    const newStart = new Date(oldStart.getTime() + startHourDelta * 3_600_000)
    // Prevent start ≥ end (must keep at least 1h)
    if (task.end_datetime.getTime() - newStart.getTime() < 3_600_000) return
    try {
      await updateDoc(doc(db, 'tasks', taskId), { start_datetime: newStart })
      await touchSchedule()
      pushUndo({
        label: 'שינוי שעת התחלה',
        undo: async () => {
          await updateDoc(doc(db, 'tasks', taskId), { start_datetime: Timestamp.fromDate(oldStart) })
          await touchSchedule()
        },
      })
    } catch { alert('שגיאה בשינוי שעת התחלה') }
  }

  async function doDeleteTask(taskId: string) {
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

  async function handleCloneSchedule(sourceId: string, replaceExisting: boolean) {
    if (!scheduleId) return
    setCloneLoading(true)
    try {
      const srcSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', sourceId)))
      if (replaceExisting) {
        const existingSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', scheduleId)))
        const assignIds: string[] = []
        for (const t of existingSnap.docs) {
          const aSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', t.id)))
          aSnap.docs.forEach(a => assignIds.push(a.id))
        }
        const batch = writeBatch(db)
        assignIds.forEach(id => batch.delete(doc(db, 'assignments', id)))
        existingSnap.docs.forEach(t => batch.delete(t.ref))
        await batch.commit()
      }
      // Get source schedule start to compute day offsets
      const srcScheduleSnap = await getDocs(query(collection(db, 'schedules'), where('__name__', '==', sourceId)))
      const srcScheduleData = srcScheduleSnap.docs[0]?.data()
      const srcStart: Date = srcScheduleData?.start_datetime?.toDate?.() ?? new Date()
      const tgtStart = scheduleStart

      for (const taskDoc of srcSnap.docs) {
        const d = taskDoc.data()
        const taskStart: Date = d.start_datetime?.toDate?.() ?? new Date()
        const taskEnd: Date = d.end_datetime?.toDate?.() ?? new Date()
        const dayOffset = Math.round((taskStart.getTime() - srcStart.getTime()) / 86400000)
        const newStart = new Date(tgtStart.getTime() + dayOffset * 86400000)
        newStart.setHours(taskStart.getHours(), taskStart.getMinutes(), 0, 0)
        const duration = taskEnd.getTime() - taskStart.getTime()
        const newEnd = new Date(newStart.getTime() + duration)
        await addDoc(collection(db, 'tasks'), {
          schedule_id: scheduleId,
          task_name: d.task_name, task_type: d.task_type,
          start_datetime: Timestamp.fromDate(newStart),
          end_datetime: Timestamp.fromDate(newEnd),
          requires_commander: d.requires_commander ?? false,
          required_people_count: d.required_people_count ?? 3,
          difficulty: d.difficulty ?? 'hard',
          notes: d.notes ?? '',
        })
      }
      await touchSchedule()
      setShowCloneModal(false)
    } catch (e) { alert('שגיאה בשכפול: ' + (e as Error).message) }
    finally { setCloneLoading(false) }
  }

  async function handleEditColumn(taskType: string, params: EditColumnParams) {
    if (!scheduleId) return
    const colTasks = tasks.filter(t => t.task_type === taskType)
    // Collect unique days that had tasks in this column
    const daySet = new Set(colTasks.map(t => {
      const d = t.start_datetime
      return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
    }))
    const days = Array.from(daySet).sort()
    // Delete existing tasks and their assignments
    const batch = writeBatch(db)
    for (const task of colTasks) {
      const aSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', task.id)))
      aSnap.docs.forEach(a => batch.delete(a.ref))
      batch.delete(doc(db, 'tasks', task.id))
    }
    await batch.commit()
    // Recreate with new params
    for (const dayStr of days) {
      for (let i = 0; i < params.timesPerDay; i++) {
        const startMs = new Date(`${dayStr}T${String(params.startHour).padStart(2, '0')}:00`).getTime()
          + i * params.durationHours * 3600000
        const start = new Date(startMs)
        const end = new Date(startMs + params.durationHours * 3600000)
        await addDoc(collection(db, 'tasks'), {
          schedule_id: scheduleId,
          task_name: params.taskName, task_type: taskType,
          start_datetime: Timestamp.fromDate(start),
          end_datetime: Timestamp.fromDate(end),
          requires_commander: params.requiresCommander,
          required_people_count: params.soldiersRequired,
          difficulty: 'hard', notes: '',
        })
      }
    }
    await touchSchedule()
    setEditingColumn(null)
  }

  async function handleCopyKKAToKKB() {
    if (!scheduleId) return
    const kkaTasks = tasks.filter(t => t.task_type === 'כ"כ א').sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())
    const kkbTasks = tasks.filter(t => t.task_type === 'כ"כ ב')
    let copied = 0
    setCopyingKKA(true)
    try {
      for (const kkaTask of kkaTasks) {
        const kkaEnd = kkaTask.end_datetime.getTime()
        // Find כ"כ ב shift that starts when this כ"כ א shift ends (within 30 min)
        const kkbNext = kkbTasks.find(t => Math.abs(t.start_datetime.getTime() - kkaEnd) < 1800000)
        if (!kkbNext) continue
        const kkaAssigns = assignments.filter(a => a.task_id === kkaTask.id)
        const kkbAssignedIds = new Set(assignments.filter(a => a.task_id === kkbNext.id).map(a => a.soldier_id))
        const maxToAdd = Math.max(0, (kkbNext.required_people_count) - kkbAssignedIds.size)
        let added = 0
        for (const a of kkaAssigns) {
          if (added >= maxToAdd) break
          if (kkbAssignedIds.has(a.soldier_id)) continue
          await createAssignment(kkbNext.id, a.soldier_id)
          copied++
          added++
        }
      }
      await touchSchedule()
      alert(`✓ הועתקו ${copied} שיבוצים מכ"כ א לכ"כ ב`)
    } catch (e) { alert('שגיאה: ' + (e as Error).message) }
    finally { setCopyingKKA(false) }
  }

  async function doMoveTaskToSlot(taskId: string, date: string, hour: number) {
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

  function isoDay(d: Date) {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
  }

  function handleDeleteTask(taskId: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const n = assignments.filter(a => a.task_id === taskId).length
    setPendingAction({
      message: `למחוק את "${task.task_type}"? (${n} חיילים משובצים)`,
      execute: () => doDeleteTask(taskId),
    })
  }

  function handleMoveTask(taskId: string, hourDelta: number) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) { return }
    const n = assignments.filter(a => a.task_id === taskId).length
    const newStart = new Date(task.start_datetime.getTime() + hourDelta * 3_600_000)
    const crossesDay = isoDay(task.start_datetime) !== isoDay(newStart)
    if (n === 0 && !crossesDay) { doMoveTask(taskId, hourDelta); return }
    setPendingAction({
      message: crossesDay
        ? `להעביר את "${task.task_type}" ליום אחר?`
        : `להזיז את "${task.task_type}"? (${n} חיילים משובצים)`,
      execute: () => doMoveTask(taskId, hourDelta),
    })
  }

  function handleMoveTaskToSlot(taskId: string, date: string, hour: number) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) { return }
    const n = assignments.filter(a => a.task_id === taskId).length
    const crossesDay = isoDay(task.start_datetime) !== date
    if (n === 0 && !crossesDay) { doMoveTaskToSlot(taskId, date, hour); return }
    setPendingAction({
      message: crossesDay
        ? `להעביר את "${task.task_type}" ליום אחר?`
        : `להזיז את "${task.task_type}"? (${n} חיילים משובצים)`,
      execute: () => doMoveTaskToSlot(taskId, date, hour),
    })
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
          {/* Editable swap hour (home_leave_hour) */}
          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500" dir="rtl">
            <span title="שעה בה חיילים יוצאים/חוזרים הביתה, ומשמרות מתחלפות">⇅ חילופים:</span>
            <select
              value={schedule.home_leave_hour ?? schedule.day_start_hour ?? 6}
              onChange={e => handleUpdateSwapHour(Number(e.target.value))}
              className="border border-slate-200 rounded px-1 py-0.5 text-xs text-slate-700 focus:outline-none focus:border-navy"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          {/* Soldier search — highlights tasks the soldier is assigned to (like in soldier-facing view) */}
          <div className="relative">
            <input type="text"
              value={soldierSearch}
              onChange={e => { setSoldierSearch(e.target.value); setShowSoldierDropdown(true) }}
              onFocus={() => setShowSoldierDropdown(true)}
              placeholder="🔍 הדגש חייל..."
              className="border border-slate-300 rounded-xl px-3 py-2 text-sm w-44 focus:outline-none focus:border-navy" />
            {highlightedSoldierId && (
              <button onClick={() => { setHighlightedSoldierId(null); setSoldierSearch('') }}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-base leading-none"
                title="נקה הדגשה">×</button>
            )}
            {showSoldierDropdown && filteredSoldiersForSearch.length > 0 && (
              <div className="absolute top-full right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto mt-1">
                {filteredSoldiersForSearch.map(s => (
                  <button key={s.id}
                    onClick={() => { setHighlightedSoldierId(s.id); setSoldierSearch(s.full_name); setShowSoldierDropdown(false) }}
                    className="w-full text-right px-4 py-1.5 text-sm hover:bg-slate-50 flex items-center gap-1">
                    {s.is_commander && <span className="text-navy text-xs">★</span>}
                    {s.full_name}
                  </button>
                ))}
              </div>
            )}
            {showSoldierDropdown && (
              <div className="fixed inset-0 z-40" onClick={() => setShowSoldierDropdown(false)} />
            )}
          </div>

          <button onClick={() => setShowTaskModal(true)}
            className="bg-navy text-white rounded-xl px-4 py-2 text-sm font-semibold">
            + הוסף משימה
          </button>

          <button onClick={() => setShowCloneModal(true)}
            className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:border-navy hover:text-navy transition">
            📋 שכפל משבצ&quot;ק
          </button>

          {tasks.some(t => t.task_type === 'כ"כ א') && tasks.some(t => t.task_type === 'כ"כ ב') && (
            <button onClick={handleCopyKKAToKKB} disabled={copyingKKA}
              className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:border-navy hover:text-navy transition disabled:opacity-40"
              title="העתק שיבוצי כ&quot;כ א לכ&quot;כ ב העוקב (עד מכסת החיילים)">
              {copyingKKA ? '⏳...' : '↷ כ"כ א → כ"כ ב'}
            </button>
          )}

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

          <button onClick={() => setShowVersionsPanel(true)} disabled={publishedVersions.length === 0}
            className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:border-navy hover:text-navy transition disabled:opacity-30 disabled:cursor-not-allowed"
            title={publishedVersions.length > 0 ? `${publishedVersions.length} גרסאות שמורות` : 'אין גרסאות מפורסמות עדיין'}>
            🕒 גרסאות {publishedVersions.length > 0 && `(${publishedVersions.length})`}
          </button>

          <button onClick={() => {
            // Compute soldiers with zero assignments
            const assignedIds = new Set(assignments.map(a => a.soldier_id))
            const free = soldiers.filter(s => s.is_active && !assignedIds.has(s.id))
            if (free.length > 0) {
              setPublishFreeWarnings(free.map(s => s.full_name))
            } else {
              setPublishFreeWarnings([])
            }
            setConfirmPublish(true)
          }} disabled={publishing}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60 disabled:cursor-wait ${
              hasUnpublishedChanges ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            }`}>
            {publishing
              ? '⏳ מפרסם...'
              : hasPublishedVersion
                ? (hasUnpublishedChanges ? '📤 פרסם עדכון' : '✓ פורסם — אין שינויים')
                : '📤 פרסם ✓'}
          </button>

          {hasPublishedVersion && (
            <button onClick={unpublish} disabled={unpublishing}
              className="border border-red-300 text-red-700 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-red-50 disabled:opacity-60 disabled:cursor-wait">
              {unpublishing ? '⏳ מבטל...' : '🗑 בטל פרסום'}
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
              <div className="flex justify-end mb-3">
                <button onClick={recheckErrors} disabled={rechecking}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition active:scale-95 ${
                    rechecking
                      ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
                      : 'border-slate-300 text-slate-700 hover:border-navy hover:text-navy hover:bg-slate-50'
                  }`}>
                  {rechecking ? '✓ נבדק מחדש' : '🔄 בדוק שוב'}
                </button>
              </div>
              {validationErrors.length > 0
                ? <ValidationPanel errors={validationErrors} tasks={tasks} dismissedKeys={dismissedKeys}
                    onDismiss={dismissError} onRestore={restoreError} />
                : <p className="text-sm text-green-700 text-center py-8">אין שגיאות בשבצ&quot;ק</p>}
            </div>
          </div>
        </>
      )}

      {/* Side drawer: published versions history */}
      {showVersionsPanel && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowVersionsPanel(false)} />
          <div className="fixed top-0 left-0 h-full w-[28rem] max-w-[90vw] bg-white shadow-2xl z-50 overflow-y-auto" dir="rtl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center">
              <div className="font-bold text-slate-800">🕒 היסטוריית גרסאות מפורסמות</div>
              <button onClick={() => setShowVersionsPanel(false)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2">×</button>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {publishedVersions.length === 0
                ? <p className="text-sm text-slate-400 text-center py-8">אין גרסאות מפורסמות עדיין</p>
                : publishedVersions.map((v, i) => (
                  <div key={v.id} className={`rounded-lg border p-3 ${i === 0 ? 'bg-green-50 border-green-300' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">
                          {i === 0 && <span className="text-green-700">▶ פעילה — </span>}
                          גרסה #{publishedVersions.length - i}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {v.published_at.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                        <div className="text-[11px] text-slate-500">פורסם ע&quot;י: {v.published_by}</div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {v.task_count} משימות • {v.assignment_count} שיבוצים
                        </div>
                      </div>
                      <button onClick={() => restoreVersion(v.id)}
                        className="text-xs bg-white border border-slate-300 text-slate-700 px-3 py-1 rounded-lg hover:border-navy hover:text-navy transition shrink-0">
                        ↶ שחזר
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {/* Task rename bar — shown when a task is selected in builder mode */}
      {selectedTaskId && (() => {
        const selTask = tasks.find(t => t.id === selectedTaskId)
        if (!selTask) return null
        return (
          <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-2 mb-3 flex items-center gap-3" dir="rtl">
            <span className="text-xs text-sky-600 font-semibold shrink-0">✎ שם:</span>
            <input
              key={selectedTaskId}
              defaultValue={selTask.task_name}
              onBlur={e => handleRenameTask(selectedTaskId, e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') { (e.target as HTMLInputElement).value = selTask.task_name; (e.target as HTMLInputElement).blur() }
              }}
              className="flex-1 border border-sky-300 rounded-lg px-2 py-1 text-sm text-slate-800 focus:outline-none focus:border-navy bg-white"
              placeholder="שם המשימה..."
            />
            <span className="text-xs text-slate-400 shrink-0 bg-slate-100 rounded px-2 py-0.5">{selTask.task_type}</span>
          </div>
        )
      })()}

      {/* Always-visible validation panel */}
      <div className="mb-3">
        <ValidationPanel errors={validationErrors} tasks={tasks} dismissedKeys={dismissedKeys}
          onDismiss={dismissError} onRestore={restoreError} />
      </div>

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
                minDate={schedule?.start_datetime ? (() => { const d = schedule.start_datetime; return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })() : undefined}
                taskErrors={taskErrors}
                selectedTaskId={selectedTaskId}
                currentSoldierId={highlightedSoldierId}
                onSelectTask={id => setSelectedTaskId(prev => prev === id ? null : id)}
                onRemoveSoldier={async (taskId, soldierId) => {
                  const a = assignments.find(a => a.task_id === taskId && a.soldier_id === soldierId)
                  if (a) { await deleteAssignment(a.id); await touchSchedule() }
                }}
                onToggleActingCommander={async (taskId, soldierId, makeCommander) => {
                  // Per-task acting commander: only ONE per task at a time.
                  // First clear acting_commander from any other assignment in this task.
                  const taskAssignments = assignments.filter(a => a.task_id === taskId)
                  const target = taskAssignments.find(a => a.soldier_id === soldierId)
                  if (!target) return

                  // Snapshot prior state for undo
                  const prior: Array<{ id: string; was: boolean }> = taskAssignments.map(a => ({
                    id: a.id, was: !!a.is_acting_commander
                  }))

                  try {
                    if (makeCommander) {
                      // Clear from siblings, set on target
                      await Promise.all(taskAssignments.map(a => {
                        if (a.id === target.id) return updateAssignment(a.id, { is_acting_commander: true })
                        if (a.is_acting_commander) return updateAssignment(a.id, { is_acting_commander: false })
                        return Promise.resolve()
                      }))
                    } else {
                      await updateAssignment(target.id, { is_acting_commander: false })
                    }
                    await touchSchedule()
                    pushUndo({
                      label: makeCommander ? 'סימון מפקד הכוח' : 'הסרת מפקד הכוח',
                      undo: async () => {
                        await Promise.all(prior.map(p => updateAssignment(p.id, { is_acting_commander: p.was })))
                        await touchSchedule()
                      },
                    })
                  } catch { alert('עדכון מפקד הכוח נכשל') }
                }}
                onEditAssignmentNote={async (taskId, soldierId, currentNote) => {
                  const a = assignments.find(a => a.task_id === taskId && a.soldier_id === soldierId)
                  if (!a) return
                  const newNote = window.prompt('הערה לשיבוץ (השאר ריק כדי למחוק):', currentNote ?? '')
                  if (newNote === null) return // user cancelled
                  const trimmed = newNote.trim()
                  const oldNote = a.note ?? ''
                  if (trimmed === oldNote) return
                  try {
                    await updateAssignment(a.id, trimmed ? { note: trimmed } : { note: '' })
                    await touchSchedule()
                    pushUndo({
                      label: 'עריכת הערה',
                      undo: async () => {
                        await updateAssignment(a.id, { note: oldNote })
                        await touchSchedule()
                      },
                    })
                  } catch { alert('עריכת הערה נכשלה') }
                }}
                onDeleteTask={handleDeleteTask}
                onMoveTask={handleMoveTask}
                onResizeTask={handleResizeTask}
                onResizeTaskStart={handleResizeTaskStart}
                onMoveTaskToSlot={handleMoveTaskToSlot}
                onCreateTaskAtSlot={handleCreateTaskAtSlot}
                onDeleteColumn={handleDeleteColumn}
                onEditColumn={col => setEditingColumn(col)}
                columnOrder={colOrder}
                onReorderColumns={handleReorderColumns}
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
            homeLeaveHour={schedule?.home_leave_hour ?? schedule?.day_start_hour ?? 6}
            onAssigned={async (taskId: string, soldierId: string) => {
              await touchSchedule()
              await handleAssigned(taskId, soldierId)
              // Auto-assign to consecutive כ"כ ב: when a soldier finishes a סיור shift,
              // assign them to the כ"כ ב shift that STARTS at the moment סיור ends.
              const assignedTask = tasks.find(t => t.id === taskId)
              if (assignedTask?.task_type === 'סיור') {
                const followup = tasks.find(t =>
                  t.task_type === 'כ"כ ב' &&
                  t.start_datetime.getTime() === assignedTask.end_datetime.getTime()
                )
                if (followup && !assignments.some(a => a.task_id === followup.id && a.soldier_id === soldierId)) {
                  await createAssignment(followup.id, soldierId)
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
          defaultStartHour={schedule?.home_leave_hour ?? schedule?.day_start_hour ?? 6}
          onClose={() => setShowTaskModal(false)}
        />
      )}

      {showCloneModal && (
        <CloneScheduleModal
          currentScheduleId={scheduleId}
          hasExistingTasks={tasks.length > 0}
          isLoading={cloneLoading}
          onClose={() => setShowCloneModal(false)}
          onConfirm={handleCloneSchedule}
        />
      )}

      {editingColumn && (
        <EditColumnModal
          taskType={editingColumn}
          tasks={tasks.filter(t => t.task_type === editingColumn)}
          onClose={() => setEditingColumn(null)}
          onSave={params => handleEditColumn(editingColumn, params)}
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
          message={publishFreeWarnings.length > 0
            ? `⚠️ ${publishFreeWarnings.length} חיילים ללא שיבוצים:\n${publishFreeWarnings.join(', ')}\n\nלפרסם בכל זאת? החיילים יראו את כל הימים.`
            : 'לפרסם את השבצ"ק? החיילים יראו את כל הימים.'}
          onConfirm={publish}
          onCancel={() => setConfirmPublish(false)}
        />
      )}

      {pendingAction && (
        <ConfirmModal
          message={pendingAction.message}
          onConfirm={async () => { const a = pendingAction; setPendingAction(null); await a.execute() }}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </AdminLayout>
  )
}
