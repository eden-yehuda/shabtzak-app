import { useState } from 'react'
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Soldier } from '@/types'

interface Props { soldiers: Soldier[] }

type PresenceWindow = { from_date: string; from_hour: number; to_date: string; to_hour: number }

const EMPTY_NEW = { full_name: '', team: '', is_commander: false, notes: '' }

export default function SoldiersTable({ soldiers }: Props) {
  const [editing, setEditing] = useState<Record<string, Partial<Soldier>>>({})
  const [adding, setAdding] = useState(false)
  const [newSoldier, setNewSoldier] = useState(EMPTY_NEW)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function addSoldier() {
    if (!newSoldier.full_name.trim()) return
    setSaving(true)
    await addDoc(collection(db, 'soldiers'), {
      full_name: newSoldier.full_name.trim(),
      team: newSoldier.team.trim(),
      is_commander: newSoldier.is_commander,
      notes: newSoldier.notes.trim(),
      is_active: true,
      fixed_home_ranges: [],
      presence_windows: [],
    })
    setNewSoldier(EMPTY_NEW)
    setAdding(false)
    setSaving(false)
  }

  function patch(id: string, field: keyof Soldier, value: unknown) {
    setEditing(e => ({ ...e, [id]: { ...e[id], [field]: value } }))
  }

  async function save(soldier: Soldier) {
    const changes = editing[soldier.id]
    if (!changes) return
    await updateDoc(doc(db, 'soldiers', soldier.id), changes as Record<string, unknown>)
    setEditing(e => { const next = { ...e }; delete next[soldier.id]; return next })
  }

  // fixed_home_ranges helpers
  function addRange(soldier: Soldier) {
    const current = editing[soldier.id]?.fixed_home_ranges ?? soldier.fixed_home_ranges
    patch(soldier.id, 'fixed_home_ranges', [...current, { from: '', to: '' }])
  }
  function updateRange(soldier: Soldier, idx: number, key: 'from' | 'to', val: string) {
    const current = [...(editing[soldier.id]?.fixed_home_ranges ?? soldier.fixed_home_ranges)]
    current[idx] = { ...current[idx], [key]: val }
    patch(soldier.id, 'fixed_home_ranges', current)
  }
  function removeRange(soldier: Soldier, idx: number) {
    const current = [...(editing[soldier.id]?.fixed_home_ranges ?? soldier.fixed_home_ranges)]
    current.splice(idx, 1)
    patch(soldier.id, 'fixed_home_ranges', current)
  }

  // presence_windows helpers
  function addWindow(soldier: Soldier) {
    const current = editing[soldier.id]?.presence_windows ?? soldier.presence_windows ?? []
    patch(soldier.id, 'presence_windows', [...current, { from_date: '', from_hour: 6, to_date: '', to_hour: 17 }])
  }
  function updateWindow(soldier: Soldier, idx: number, key: keyof PresenceWindow, val: string | number) {
    const current = [...(editing[soldier.id]?.presence_windows ?? soldier.presence_windows ?? [])]
    current[idx] = { ...current[idx], [key]: val }
    patch(soldier.id, 'presence_windows', current)
  }
  function removeWindow(soldier: Soldier, idx: number) {
    const current = [...(editing[soldier.id]?.presence_windows ?? soldier.presence_windows ?? [])]
    current.splice(idx, 1)
    patch(soldier.id, 'presence_windows', current)
  }

  const sorted = [...soldiers].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, 'he')
  )

  return (
    <div>
      {/* Add soldier */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="mb-4 bg-navy text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-navy-light transition"
        >
          + הוסף חייל
        </button>
      ) : (
        <div className="bg-white rounded-xl p-4 shadow-sm mb-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">שם מלא *</label>
            <input
              value={newSoldier.full_name}
              onChange={e => setNewSoldier(n => ({ ...n, full_name: e.target.value }))}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-40"
              placeholder="שם פרטי ומשפחה"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">צוות</label>
            <input
              value={newSoldier.team}
              onChange={e => setNewSoldier(n => ({ ...n, team: e.target.value }))}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-28"
              placeholder="צוות א׳..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">הערות</label>
            <input
              value={newSoldier.notes}
              onChange={e => setNewSoldier(n => ({ ...n, notes: e.target.value }))}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-40"
              placeholder="הערה..."
            />
          </div>
          <label className="flex items-center gap-2 text-sm pb-1.5">
            <input
              type="checkbox"
              checked={newSoldier.is_commander}
              onChange={e => setNewSoldier(n => ({ ...n, is_commander: e.target.checked }))}
              className="w-4 h-4"
            />
            מפקד
          </label>
          <div className="flex gap-2 pb-1.5">
            <button
              onClick={addSoldier}
              disabled={!newSoldier.full_name.trim() || saving}
              className="bg-navy text-white rounded-xl px-4 py-1.5 text-sm font-semibold disabled:opacity-40"
            >
              {saving ? 'שומר...' : 'הוסף'}
            </button>
            <button
              onClick={() => { setAdding(false); setNewSoldier(EMPTY_NEW) }}
              className="text-slate-500 text-sm px-3 py-1.5 rounded-xl hover:bg-slate-100"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100 text-right">
              <th className="px-3 py-2 font-semibold">שם</th>
              <th className="px-3 py-2 font-semibold text-center">מפקד</th>
              <th className="px-3 py-2 font-semibold">הערות</th>
              <th className="px-3 py-2 font-semibold text-center">פעיל</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const e = editing[s.id] ?? {}
              const isDirty = !!editing[s.id]
              const ranges = e.fixed_home_ranges ?? s.fixed_home_ranges
              const windows = e.presence_windows ?? s.presence_windows ?? []
              const isExpanded = expanded === s.id
              return (
                <>
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">
                      <button
                        onClick={() => setExpanded(isExpanded ? null : s.id)}
                        className="text-right w-full flex items-center gap-1 hover:text-navy"
                      >
                        <span className="text-xs text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                        {s.is_commander && <span className="text-navy text-xs">★</span>}
                        {s.full_name}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={e.is_commander ?? s.is_commander}
                        onChange={ev => patch(s.id, 'is_commander', ev.target.checked)}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={e.notes ?? s.notes}
                        onChange={ev => patch(s.id, 'notes', ev.target.value)}
                        className="border border-slate-200 rounded px-2 py-1 w-full text-sm"
                        placeholder="הערה..."
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox"
                        checked={e.is_active ?? s.is_active}
                        onChange={ev => patch(s.id, 'is_active', ev.target.checked)}
                        className="w-4 h-4" />
                    </td>
                    <td className="px-3 py-2">
                      {isDirty && (
                        <button onClick={() => save(s)}
                          className="bg-navy text-white text-xs px-3 py-1 rounded-lg">שמור</button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${s.id}-expanded`} className="bg-slate-50 border-b border-slate-200">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex gap-8 flex-wrap" dir="rtl">

                          {/* Fixed home ranges */}
                          <div className="min-w-[260px]">
                            <div className="text-xs font-bold text-slate-600 mb-2">🏠 מגבלות קבועות (ימי בית קבועים)</div>
                            <div className="space-y-1.5">
                              {ranges.map((r, i) => (
                                <div key={i} className="flex gap-1.5 items-center">
                                  <input type="date" value={r.from}
                                    onChange={ev => updateRange(s, i, 'from', ev.target.value)}
                                    className="border border-slate-200 rounded px-1.5 py-1 text-xs" />
                                  <span className="text-xs text-slate-400">—</span>
                                  <input type="date" value={r.to}
                                    onChange={ev => updateRange(s, i, 'to', ev.target.value)}
                                    className="border border-slate-200 rounded px-1.5 py-1 text-xs" />
                                  <button onClick={() => removeRange(s, i)}
                                    className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                                </div>
                              ))}
                              <button onClick={() => addRange(s)}
                                className="text-xs text-blue-600 hover:underline mt-1">+ הוסף טווח</button>
                            </div>
                          </div>

                          {/* Presence windows */}
                          <div className="min-w-[320px]">
                            <div className="text-xs font-bold text-slate-600 mb-2">📍 זמינות מוגדרת (נמצא רק בחלק מהשבוע)</div>
                            <div className="space-y-2">
                              {windows.length === 0 && (
                                <p className="text-xs text-slate-400 italic">אין חלון זמינות — נמצא כל השבוע</p>
                              )}
                              {windows.map((w, i) => (
                                <div key={i} className="flex gap-1.5 items-center flex-wrap">
                                  <span className="text-xs text-slate-500 shrink-0">מ:</span>
                                  <input type="date" value={w.from_date}
                                    onChange={ev => updateWindow(s, i, 'from_date', ev.target.value)}
                                    className="border border-slate-200 rounded px-1.5 py-1 text-xs" />
                                  <input type="number" min={0} max={23} value={w.from_hour}
                                    onChange={ev => updateWindow(s, i, 'from_hour', Number(ev.target.value))}
                                    className="border border-slate-200 rounded px-1.5 py-1 text-xs w-14"
                                    placeholder="שעה" />
                                  <span className="text-xs text-slate-500 shrink-0">עד:</span>
                                  <input type="date" value={w.to_date}
                                    onChange={ev => updateWindow(s, i, 'to_date', ev.target.value)}
                                    className="border border-slate-200 rounded px-1.5 py-1 text-xs" />
                                  <input type="number" min={0} max={23} value={w.to_hour}
                                    onChange={ev => updateWindow(s, i, 'to_hour', Number(ev.target.value))}
                                    className="border border-slate-200 rounded px-1.5 py-1 text-xs w-14"
                                    placeholder="שעה" />
                                  <button onClick={() => removeWindow(s, i)}
                                    className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                                </div>
                              ))}
                              <button onClick={() => addWindow(s)}
                                className="text-xs text-blue-600 hover:underline mt-1">+ הוסף חלון זמינות</button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3">
                          {isDirty && (
                            <button onClick={() => save(s)}
                              className="bg-navy text-white text-sm px-4 py-1.5 rounded-lg">שמור שינויים</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
