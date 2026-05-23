import { useState, useMemo, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useLeaveRequests } from '@/hooks/useLeaveRequests'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { addDoc, deleteDoc, doc, updateDoc, setDoc, onSnapshot, getDocs, query, where, Timestamp, writeBatch, serverTimestamp } from 'firebase/firestore'
import { leaveRequestsRef, leaveVersionsRef } from '@/lib/firestore'
import { db } from '@/lib/firebase'
import { matchSoldierName } from '@/utils/sheetParser'
import type { Soldier } from '@/types'

interface SurveySettings {
  is_open: boolean
  from: string
  to: string
  max_days: number
}

function daysInRange(from: string, to: string): string[] {
  const days: string[] = []
  const cur = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  while (cur <= end) {
    days.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

function next14Days(): string[] {
  const days: string[] = []
  const today = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  return `${dayNames[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

interface SyncResult {
  added: number
  removed: number
  unmatched: string[]
  warnings: string[]
}

export default function AdminLeavePage() {
  const soldiers = useSoldiers(false)
  const allRequests = useLeaveRequests()
  const finalLeave = useFinalLeave()
  const [survey, setSurvey] = useState<SurveySettings | null>(null)
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [draftMaxDays, setDraftMaxDays] = useState(3)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)

  // ── Undo stack (last 20 ops) + Ctrl+Z ────────────────────────────────────
  type UndoAction = { label: string; undo: () => Promise<void> }
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])
  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack(prev => [...prev.slice(-19), action])
  }, [])
  const performUndo = useCallback(async () => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      last.undo().catch(e => { console.error(e); alert('ביטול נכשל: ' + (e as Error).message) })
      return prev.slice(0, -1)
    })
  }, [])
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

  // ── Versions ──────────────────────────────────────────────────────────────
  type LeaveVersion = {
    id: string
    saved_at: Date
    saved_by: string
    label: string
    record_count: number
  }
  const [versions, setVersions] = useState<LeaveVersion[]>([])
  const [showVersionsPanel, setShowVersionsPanel] = useState(false)
  const [savingVersion, setSavingVersion] = useState(false)

  useEffect(() => {
    return onSnapshot(leaveVersionsRef(), snap => {
      const list: LeaveVersion[] = snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          saved_at: data.saved_at?.toDate?.() ?? new Date(),
          saved_by: data.saved_by ?? 'משתמש לא ידוע',
          label: data.label ?? '',
          record_count: Array.isArray(data.leave_requests) ? data.leave_requests.length : 0,
        }
      })
      list.sort((a, b) => b.saved_at.getTime() - a.saved_at.getTime())
      setVersions(list)
    })
  }, [])

  async function snapshotCurrentLeave(label: string) {
    const snap = await getDocs(leaveRequestsRef())
    const records = snap.docs.map(d => {
      const data = d.data() as Record<string, unknown>
      return {
        id: d.id,
        soldier_id: data.soldier_id,
        date: data.date,
        status: data.status,
        is_final: data.is_final ?? false,
        note: data.note ?? '',
        reviewed_by: data.reviewed_by ?? '',
      }
    })
    await addDoc(leaveVersionsRef(), {
      saved_at: serverTimestamp(),
      saved_by: typeof window !== 'undefined' ? (localStorage.getItem('admin_name') ?? 'מנהל') : 'מנהל',
      label,
      leave_requests: records,
    })
  }

  async function saveManualVersion() {
    if (savingVersion) return
    const label = window.prompt('שם לגרסה (אופציונלי):', `שמור ידני ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`)
    if (label === null) return
    setSavingVersion(true)
    try {
      await snapshotCurrentLeave(label.trim() || 'ללא שם')
      alert('✓ גרסה נשמרה')
    } catch (e) { alert('שמירת גרסה נכשלה: ' + (e as Error).message) }
    finally { setSavingVersion(false) }
  }

  async function restoreVersion(versionId: string) {
    if (!confirm('שחזור גרסה ימחק את כל היציאות הנוכחיות ויחליף אותן בגרסה זו. להמשיך?')) return
    try {
      // Auto-snapshot current state first (so the restore itself can be undone via versions list)
      await snapshotCurrentLeave('שמור אוטומטית לפני שחזור')

      // Load the target version
      const verSnap = await getDocs(leaveVersionsRef())
      const verDoc = verSnap.docs.find(d => d.id === versionId)
      if (!verDoc) { alert('גרסה לא נמצאה'); return }
      const verData = verDoc.data()
      const records = (verData.leave_requests ?? []) as Array<Record<string, unknown>>

      // Delete all current leave_requests
      const allSnap = await getDocs(leaveRequestsRef())
      const batch1 = writeBatch(db)
      allSnap.docs.forEach(d => batch1.delete(d.ref))
      await batch1.commit()

      // Re-create from the snapshot
      for (const r of records) {
        await addDoc(leaveRequestsRef(), {
          soldier_id: r.soldier_id,
          date: r.date,
          status: r.status,
          is_final: r.is_final ?? false,
          note: r.note ?? '',
          reviewed_by: r.reviewed_by ?? '',
          created_at: Timestamp.now(),
        })
      }
      alert('✓ הגרסה שוחזרה בהצלחה')
    } catch (e) { alert('שחזור נכשל: ' + (e as Error).message) }
  }


  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'leave_survey'), snap => {
      if (snap.exists()) setSurvey(snap.data() as SurveySettings)
      else setSurvey({ is_open: false, from: '', to: '', max_days: 3 })
    })
  }, [])

  async function openSurvey() {
    if (!draftFrom || !draftTo) return
    await setDoc(doc(db, 'settings', 'leave_survey'), { is_open: true, from: draftFrom, to: draftTo, max_days: draftMaxDays })
  }

  async function closeSurvey() {
    await setDoc(doc(db, 'settings', 'leave_survey'), { is_open: false, from: survey?.from ?? '', to: survey?.to ?? '', max_days: survey?.max_days ?? 3 })
  }

  function isoDateLocal(d: Date) {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
  }
  function shiftDate(iso: string, deltaDays: number): string {
    const d = new Date(iso + 'T12:00:00')
    d.setDate(d.getDate() + deltaDays)
    return isoDateLocal(d)
  }

  const defaultFrom = useMemo(() => {
    if (survey?.is_open && survey.from) return survey.from
    return isoDateLocal(new Date())
  }, [survey])
  const defaultTo = useMemo(() => shiftDate(defaultFrom, 13), [defaultFrom])

  const [rangeFrom, setRangeFrom] = useState<string>('')
  const [rangeTo, setRangeTo] = useState<string>('')

  const effectiveFrom = rangeFrom || defaultFrom
  const effectiveTo = rangeTo || defaultTo

  const dates = useMemo(() => daysInRange(effectiveFrom, effectiveTo), [effectiveFrom, effectiveTo])

  function pageToday() { setRangeFrom(''); setRangeTo('') }

  const sorted = useMemo(() =>
    [...soldiers].filter(s => s.is_active).sort((a, b) => {
      if (a.is_commander !== b.is_commander) return a.is_commander ? -1 : 1
      return a.full_name.localeCompare(b.full_name, 'he')
    }),
    [soldiers]
  )

  // Non-final pending/rejected requests submitted by soldiers
  const soldierRequests = useMemo(() => allRequests.filter(r => !r.is_final), [allRequests])

  async function toggleFinal(soldier: Soldier, date: string) {
    const approved = finalLeave.find(r => r.soldier_id === soldier.id && r.date === date)
    if (approved) {
      // Snapshot the data needed to undo this delete
      const data = {
        soldier_id: approved.soldier_id, date: approved.date,
        status: approved.status, is_final: approved.is_final,
        note: approved.note ?? '', reviewed_by: (approved as { reviewed_by?: string }).reviewed_by ?? '',
      }
      await deleteDoc(doc(db, 'leave_requests', approved.id))
      pushUndo({
        label: `הסרת יציאה (${soldier.full_name} ${date})`,
        undo: async () => {
          await addDoc(leaveRequestsRef(), { ...data, created_at: Timestamp.now() })
        },
      })
      return
    }
    // If there's a pending request, approve it in-place
    const pending = soldierRequests.find(r => r.soldier_id === soldier.id && r.date === date && r.status === 'pending')
    if (pending) {
      const wasStatus = pending.status, wasFinal = pending.is_final
      await updateDoc(doc(db, 'leave_requests', pending.id), { is_final: true, status: 'approved' })
      pushUndo({
        label: `אישור בקשה (${soldier.full_name} ${date})`,
        undo: async () => {
          await updateDoc(doc(db, 'leave_requests', pending.id), { is_final: wasFinal, status: wasStatus })
        },
      })
    } else {
      const newDoc = await addDoc(leaveRequestsRef(), {
        soldier_id: soldier.id,
        date,
        status: 'approved',
        is_final: true,
        created_at: new Date(),
      })
      pushUndo({
        label: `הוספת יציאה (${soldier.full_name} ${date})`,
        undo: async () => {
          await deleteDoc(doc(db, 'leave_requests', newDoc.id))
        },
      })
    }
  }

  function countFinal(date: string) {
    return finalLeave.filter(r => r.date === date && r.status === 'approved').length
  }

  function countPending(date: string) {
    return soldierRequests.filter(r => r.date === date && r.status === 'pending').length
  }

  function presentCount(date: string) {
    return soldiers.filter(s => s.is_active).length - countFinal(date)
  }

  const totalPending = soldierRequests.filter(r => r.status === 'pending').length

  function matchSoldier(name: string) {
    return matchSoldierName(name, soldiers)
  }

  async function syncFromSheet() {
    setSyncing(true)
    setSyncResult(null)
    try {
      // Auto-save a version BEFORE applying changes from the sheet
      try { await snapshotCurrentLeave('שמור אוטומטית לפני סנכרון מגיליון') }
      catch (snapshotErr) { console.warn('Snapshot before sync failed:', snapshotErr) }

      const res = await fetch('/.netlify/functions/fetch-leave-sheet')
      const data = await res.json()
      if (data.error) { alert(`שגיאה: ${data.error}`); return }

      const entries: { soldierName: string; date: string }[] = data.entries
      const sheetDates: string[] = data.dates ?? []

      // 1. Update survey dates to exactly match the sheet range
      if (sheetDates.length > 0) {
        const firstDate = sheetDates[0]
        const lastDate = sheetDates[sheetDates.length - 1]
        await setDoc(doc(db, 'settings', 'leave_survey'), {
          is_open: true,
          from: firstDate,
          to: lastDate,
          max_days: survey?.max_days ?? 5,
        })
      }

      // 2. Build sheet map: date → Set<soldierId>
      const unmatchedSet = new Set<string>()
      const sheetMap = new Map<string, Set<string>>()
      for (const date of sheetDates) sheetMap.set(date, new Set())

      for (const entry of entries) {
        const soldier = matchSoldier(entry.soldierName)
        if (!soldier) { unmatchedSet.add(entry.soldierName); continue }
        if (sheetMap.has(entry.date)) sheetMap.get(entry.date)!.add(soldier.id)
      }

      // 3. Build Firestore current map: date → Map<soldierId, recordId[]>
      //    Stores ALL record IDs per soldier per date to handle duplicates
      const freshSnap = await getDocs(
        query(leaveRequestsRef(), where('is_final', '==', true), where('status', '==', 'approved'))
      )
      const currentMap = new Map<string, Map<string, string[]>>()
      for (const d of freshSnap.docs) {
        const lr = d.data() as { date: string; soldier_id: string }
        if (!sheetDates.includes(lr.date)) continue
        if (!currentMap.has(lr.date)) currentMap.set(lr.date, new Map())
        const dateMap = currentMap.get(lr.date)!
        if (!dateMap.has(lr.soldier_id)) dateMap.set(lr.soldier_id, [])
        dateMap.get(lr.soldier_id)!.push(d.id)
      }

      // 3b. Delete stale approved records outside the sheet date range
      const staleDocs = freshSnap.docs.filter(d => !sheetDates.includes((d.data() as { date: string }).date))
      await Promise.all(staleDocs.map(d => deleteDoc(doc(db, 'leave_requests', d.id))))

      // 4. Bidirectional diff
      let addedCount = 0, removedCount = staleDocs.length

      await Promise.all(Array.from(sheetMap.entries()).map(async ([date, sheetSoldiers]) => {
        const current = currentMap.get(date) ?? new Map<string, string[]>()

        // Remove ALL records: in Firestore but NOT in sheet (also removes duplicates)
        await Promise.all(Array.from(current.entries()).map(async ([sid, rids]) => {
          if (!sheetSoldiers.has(sid)) {
            await Promise.all(rids.map(rid => deleteDoc(doc(db, 'leave_requests', rid))))
            removedCount += rids.length
          } else if (rids.length > 1) {
            // Duplicate: keep first, delete rest
            await Promise.all(rids.slice(1).map(rid => deleteDoc(doc(db, 'leave_requests', rid))))
          }
        }))

        // Add: in sheet but NOT in Firestore
        await Promise.all(Array.from(sheetSoldiers).map(async sid => {
          if (!current.has(sid) || current.get(sid)!.length === 0) {
            const pending = soldierRequests.find(r => r.soldier_id === sid && r.date === date && r.status === 'pending')
            if (pending) {
              await updateDoc(doc(db, 'leave_requests', pending.id), { is_final: true, status: 'approved' })
            } else {
              await addDoc(leaveRequestsRef(), {
                soldier_id: sid,
                date,
                status: 'approved',
                is_final: true,
                created_at: new Date(),
              })
            }
            addedCount++
          }
        }))
      }))

      setSyncResult({ added: addedCount, removed: removedCount, unmatched: Array.from(unmatchedSet), warnings: data.warnings ?? [] })
    } catch (e) {
      alert('שגיאה בסנכרון: ' + String(e))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-navy">ניהול יציאות</h1>
        <div className="flex flex-wrap gap-2">
          <button onClick={performUndo} disabled={undoStack.length === 0}
            title={undoStack.length > 0 ? `ביטול: ${undoStack[undoStack.length - 1].label} (Ctrl+Z)` : 'אין פעולה לביטול'}
            className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:border-navy hover:text-navy transition disabled:opacity-30 disabled:cursor-not-allowed">
            ↶ ביטול {undoStack.length > 0 && `(${undoStack.length})`}
          </button>

          <button onClick={() => setShowVersionsPanel(true)} disabled={versions.length === 0}
            title={versions.length > 0 ? `${versions.length} גרסאות שמורות` : 'אין גרסאות שמורות'}
            className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:border-navy hover:text-navy transition disabled:opacity-30 disabled:cursor-not-allowed">
            🕒 גרסאות {versions.length > 0 && `(${versions.length})`}
          </button>

          <button onClick={saveManualVersion} disabled={savingVersion}
            className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:border-navy hover:text-navy transition disabled:opacity-40">
            {savingVersion ? '⏳ שומר...' : '💾 שמור גרסה'}
          </button>

          <button
            onClick={syncFromSheet}
            disabled={syncing}
            className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:border-navy hover:text-navy transition disabled:opacity-40"
          >
            {syncing ? '⏳ מסנכרן...' : '📊 סנכרון יציאות'}
          </button>
        </div>
      </div>

      {/* Side drawer: leave version history */}
      {showVersionsPanel && (
        <>
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowVersionsPanel(false)} />
          <div className="fixed top-0 left-0 h-full w-[28rem] max-w-[90vw] bg-white shadow-2xl z-50 overflow-y-auto" dir="rtl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center">
              <div className="font-bold text-slate-800">🕒 היסטוריית גרסאות יציאות</div>
              <button onClick={() => setShowVersionsPanel(false)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2">×</button>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {versions.length === 0
                ? <p className="text-sm text-slate-400 text-center py-8">אין גרסאות שמורות עדיין</p>
                : versions.map((v, i) => (
                  <div key={v.id} className={`rounded-lg border p-3 ${i === 0 ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">
                          {i === 0 && <span className="text-blue-700">▶ אחרון — </span>}
                          {v.label || `גרסה #${versions.length - i}`}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {v.saved_at.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                        <div className="text-[11px] text-slate-500">נשמר ע&quot;י: {v.saved_by}</div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {v.record_count} רשומות
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

      {/* Survey control */}
      <div className={`rounded-xl p-4 mb-5 border ${survey?.is_open ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-sm font-bold ${survey?.is_open ? 'text-green-700' : 'text-slate-500'}`}>
            {survey?.is_open ? `✅ סקר פתוח: ${survey.from} – ${survey.to}` : '⛔ סקר יציאות סגור'}
          </span>
          {survey?.is_open ? (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={closeSurvey}
                className="bg-red-100 text-red-700 border border-red-200 rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-red-200 transition"
              >
                סגור סקר
              </button>
              <span className="text-sm text-green-700">מכסה: עד {survey.max_days} ימים לאיש</span>
            </div>
          ) : (
            <div className="flex gap-2 items-center flex-wrap">
              <input type="date" value={draftFrom} onChange={e => setDraftFrom(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              <span className="text-slate-400 text-sm">עד</span>
              <input type="date" value={draftTo} onChange={e => setDraftTo(e.target.value)} min={draftFrom}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 text-sm">מכסה:</span>
                <input type="number" min={1} max={30} value={draftMaxDays}
                  onChange={e => setDraftMaxDays(Number(e.target.value))}
                  className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-16 text-center" />
                <span className="text-slate-500 text-sm">ימים</span>
              </div>
              <button onClick={openSurvey} disabled={!draftFrom || !draftTo}
                className="bg-navy text-white rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-40 hover:bg-navy-light transition">
                פתח סקר
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pending warning */}
      {totalPending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 flex items-center gap-2 text-sm text-amber-800">
          <span className="text-base">⚠️</span>
          <span>שים לב: <strong>{totalPending}</strong> בקשות ממתינות לאישור — לחץ על <strong>!</strong> כדי לאשר</span>
        </div>
      )}

      {/* Sync result */}
      {syncResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-sm" dir="rtl">
          <div className="flex justify-between items-start mb-2">
            <div className="font-bold text-blue-800">📊 תוצאות סנכרון מגיליון</div>
            <button onClick={() => setSyncResult(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
          <div className="flex flex-wrap gap-3">
            {syncResult.added > 0 && (
              <span className="text-green-700 font-semibold">✓ נוספו {syncResult.added} יציאות</span>
            )}
            {syncResult.removed > 0 && (
              <span className="text-red-600 font-semibold">✕ הוסרו {syncResult.removed} יציאות</span>
            )}
            {syncResult.unmatched.length > 0 && (
              <span className="text-amber-700">⚠️ לא זוהו: {syncResult.unmatched.join(', ')}</span>
            )}
            {syncResult.added === 0 && syncResult.removed === 0 && syncResult.unmatched.length === 0 && (
              <span className="text-slate-600">✓ הכל מסונכרן — אין שינויים.</span>
            )}
          </div>
          {syncResult.warnings.length > 0 && (
            <div className="mt-2 space-y-0.5">
              <div className="text-xs font-semibold text-red-700 mb-1">⚠️ אי-התאמה לעמודה Q:</div>
              {syncResult.warnings.map((w, i) => (
                <div key={i} className="text-xs text-red-600">{w}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Date range picker */}
      <div className="flex items-center gap-2 mb-3 flex-wrap" dir="rtl">
        <span className="text-sm text-slate-600 font-semibold">הצג טווח:</span>
        <input type="date" value={effectiveFrom}
          onChange={e => setRangeFrom(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        <span className="text-slate-400 text-sm">עד</span>
        <input type="date" value={effectiveTo} min={effectiveFrom}
          onChange={e => setRangeTo(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        <button onClick={pageToday}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm hover:border-navy hover:text-navy transition">
          איפוס
        </button>
        {dates.length > 0 && (
          <span className="text-xs text-slate-400 mr-1">({dates.length} ימים)</span>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-xs text-slate-500 items-center flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-md bg-green-500 flex items-center justify-center text-white font-bold text-xs">✓</div>
          <span>מאושר</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-md bg-amber-50 border-2 border-amber-400 flex items-center justify-center text-amber-700 font-bold text-xs">!</div>
          <span>ביקש — לחץ לאישור</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-md bg-slate-200 flex items-center justify-center text-slate-400 font-bold text-xs">✕</div>
          <span>נדחה</span>
        </div>
        <span className="text-slate-400">לחיצה על ✓ מבטלת אישור</span>
      </div>

      <div className="overflow-auto max-h-[70vh]">
        <table className="text-sm border-separate min-w-full" style={{ borderSpacing: 0 }}>
          <thead>
            <tr className="text-right">
              <th className="px-3 py-2 sticky top-0 right-0 bg-slate-100 z-30 shadow-sm border-b border-l border-slate-200">שם</th>
              {dates.map(d => (
                <th key={d} className="px-1 py-2 text-center min-w-[56px] sticky top-0 bg-slate-100 z-20 shadow-sm border-b border-slate-200">
                  <div>{dayLabel(d)}</div>
                  {countPending(d) > 0 && (
                    <div className="text-[10px] text-amber-600 font-semibold">{countPending(d)} בקשות</div>
                  )}
                </th>
              ))}
              <th className="px-2 py-2 text-center whitespace-nowrap sticky top-0 left-0 bg-slate-100 z-30 shadow-sm border-b border-slate-200">ביקש / אושר</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const approvedCount = dates.filter(d => finalLeave.some(r => r.soldier_id === s.id && r.date === d)).length
              const requestedCount = dates.filter(d =>
                soldierRequests.some(r => r.soldier_id === s.id && r.date === d && r.status === 'pending') ||
                finalLeave.some(r => r.soldier_id === s.id && r.date === d)
              ).length

              return (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium sticky right-0 bg-white z-10 whitespace-nowrap">
                    {s.full_name}
                    {s.is_commander && <span className="text-xs text-navy mr-1">★</span>}
                  </td>
                  {dates.map(d => {
                    const isApproved = finalLeave.some(r => r.soldier_id === s.id && r.date === d)
                    const isRejected = soldierRequests.some(r => r.soldier_id === s.id && r.date === d && r.status === 'rejected')
                    const pendingReq = soldierRequests.find(r => r.soldier_id === s.id && r.date === d && r.status === 'pending')
                    const isPending = !!pendingReq
                    const tooltipText = isApproved
                      ? 'מאושר — לחץ לביטול'
                      : isPending
                      ? `ביקש יציאה${pendingReq?.note ? ` — ${pendingReq.note}` : ''} — לחץ לאישור`
                      : isRejected
                      ? 'נדחה'
                      : 'לחץ להוספה ידנית'

                    return (
                      <td key={d} className="px-1 py-1 text-center">
                        <button
                          disabled={isRejected}
                          onClick={() => toggleFinal(s, d)}
                          title={tooltipText}
                          className={`w-9 h-9 rounded-lg text-sm font-bold transition ${
                            isApproved
                              ? 'bg-green-500 text-white hover:bg-green-600'
                              : isRejected
                              ? 'bg-slate-200 text-slate-400 cursor-default'
                              : isPending
                              ? 'bg-amber-50 border-2 border-amber-400 text-amber-700 hover:bg-amber-100'
                              : 'bg-white border border-slate-200 text-slate-300 hover:border-navy hover:text-navy'
                          }`}
                        >
                          {isApproved ? '✓' : isRejected ? '✕' : isPending ? '!' : ''}
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-center text-xs font-semibold whitespace-nowrap">
                    {requestedCount > 0 || approvedCount > 0
                      ? <span className={requestedCount > approvedCount ? 'text-amber-700' : 'text-slate-600'}>
                          {requestedCount} / {approvedCount}
                        </span>
                      : <span className="text-slate-300">—</span>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
              <td className="px-3 py-2 sticky right-0 bg-slate-50 z-10">בבית</td>
              {dates.map(d => (
                <td key={d} className="px-1 py-2 text-center">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    countFinal(d) >= 8 ? 'bg-red-100 text-red-700' :
                    countFinal(d) >= 6 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>{countFinal(d)}</span>
                </td>
              ))}
              <td />
            </tr>
            <tr className="bg-slate-50">
              <td className="px-3 py-2 sticky right-0 bg-slate-50 z-10 text-slate-500 text-xs">נוכחים</td>
              {dates.map(d => (
                <td key={d} className="px-1 py-2 text-center text-xs text-slate-500">{presentCount(d)}</td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </AdminLayout>
  )
}
