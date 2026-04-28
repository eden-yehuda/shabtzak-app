import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Soldier } from '@/types'

interface Props { soldiers: Soldier[] }

export default function SoldiersTable({ soldiers }: Props) {
  const [editing, setEditing] = useState<Record<string, Partial<Soldier>>>({})

  function patch(id: string, field: keyof Soldier, value: unknown) {
    setEditing(e => ({ ...e, [id]: { ...e[id], [field]: value } }))
  }

  async function save(soldier: Soldier) {
    const changes = editing[soldier.id]
    if (!changes) return
    await updateDoc(doc(db, 'soldiers', soldier.id), changes as Record<string, unknown>)
    setEditing(e => { const next = { ...e }; delete next[soldier.id]; return next })
  }

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

  const sorted = [...soldiers].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, 'he')
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100 text-right">
            <th className="px-3 py-2 font-semibold">שם</th>
            <th className="px-3 py-2 font-semibold text-center">מפקד</th>
            <th className="px-3 py-2 font-semibold">הערות</th>
            <th className="px-3 py-2 font-semibold">מגבלות קבועות</th>
            <th className="px-3 py-2 font-semibold text-center">פעיל</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => {
            const e = editing[s.id] ?? {}
            const isDirty = !!editing[s.id]
            const ranges = e.fixed_home_ranges ?? s.fixed_home_ranges
            return (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{s.full_name}</td>
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
                <td className="px-3 py-2">
                  <div className="space-y-1">
                    {ranges.map((r, i) => (
                      <div key={i} className="flex gap-1 items-center">
                        <input type="date" value={r.from}
                          onChange={ev => updateRange(s, i, 'from', ev.target.value)}
                          className="border border-slate-200 rounded px-1 py-0.5 text-xs" />
                        <span className="text-xs text-slate-400">—</span>
                        <input type="date" value={r.to}
                          onChange={ev => updateRange(s, i, 'to', ev.target.value)}
                          className="border border-slate-200 rounded px-1 py-0.5 text-xs" />
                        <button onClick={() => removeRange(s, i)}
                          className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </div>
                    ))}
                    <button onClick={() => addRange(s)}
                      className="text-xs text-blue-600 hover:underline">+ מגבלה</button>
                  </div>
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
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
