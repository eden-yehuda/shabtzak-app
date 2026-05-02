import { useState, useMemo, useEffect } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useLeaveRequests } from '@/hooks/useLeaveRequests'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { addDoc, deleteDoc, doc, updateDoc, setDoc, onSnapshot, getDocs, query, where } from 'firebase/firestore'
import { leaveRequestsRef } from '@/lib/firestore'
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

  // Dates to display: survey range if open, otherwise next 14 days
  const dates = useMemo(() => {
    if (survey?.is_open && survey.from && survey.to) return daysInRange(survey.from, survey.to)
    return next14Days()
  }, [survey])

  const sorted = useMemo(() =>
    [...soldiers].filter(s => s.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')),
    [soldiers]
  )

  // Non-final pending/rejected requests submitted by soldiers
  const soldierRequests = useMemo(() => allRequests.filter(r => !r.is_final), [allRequests])

  async function toggleFinal(soldier: Soldier, date: string) {
    const approved = finalLeave.find(r => r.soldier_id === soldier.id && r.date === date)
    if (approved) {
      await deleteDoc(doc(db, 'leave_requests', approved.id))
      return
    }
    // If there's a pending request, approve it in-place
    const pending = soldierRequests.find(r => r.soldier_id === soldier.id && r.date === date && r.status === 'pending')
    if (pending) {
      await updateDoc(doc(db, 'leave_requests', pending.id), { is_final: true, status: 'approved' })
    } else {
      await addDoc(leaveRequestsRef(), {
        soldier_id: soldier.id,
        date,
        status: 'approved',
        is_final: true,
        created_at: new Date(),
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
      const res = await fetch('/.netlify/functions/fetch-leave-sheet')
      const data = await res.json()
      if (data.error) { alert(`שגיאה: ${data.error}`); return }

      const entries: { soldierName: string; date: string }[] = data.entries
      const sheetDates: string[] = data.dates ?? []

      // 1. Update survey dates to cover the sheet range
      if (sheetDates.length > 0) {
        const firstDate = sheetDates[0]
        const lastDate = sheetDates[sheetDates.length - 1]
        const needsUpdate = !survey?.is_open || (survey.to ?? '') < lastDate || (survey.from ?? '') > firstDate
        if (needsUpdate) {
          await setDoc(doc(db, 'settings', 'leave_survey'), {
            is_open: true,
            from: firstDate,
            to: lastDate,
            max_days: survey?.max_days ?? 5,
          })
        }
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

      // 4. Bidirectional diff
      let addedCount = 0, removedCount = 0

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
        <button
          onClick={syncFromSheet}
          disabled={syncing}
          className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold hover:border-navy hover:text-navy transition disabled:opacity-40"
        >
          {syncing ? '⏳ מסנכרן...' : '📊 סנכרון מגיליון'}
        </button>
      </div>

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

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="text-right bg-slate-50">
              <th className="px-3 py-2 sticky right-0 bg-slate-50 z-10">שם</th>
              {dates.map(d => (
                <th key={d} className="px-1 py-2 text-center min-w-[56px]">
                  <div>{dayLabel(d)}</div>
                  {countPending(d) > 0 && (
                    <div className="text-[10px] text-amber-600 font-semibold">{countPending(d)} בקשות</div>
                  )}
                </th>
              ))}
              <th className="px-2 py-2 text-center whitespace-nowrap">ביקש / אושר</th>
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
