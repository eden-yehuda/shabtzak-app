import { useState } from 'react'
import { addDoc, collection, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Soldier } from '@/types'

interface Props {
  soldiers: Soldier[]
  from: string
  to: string
  maxDays: number  // 0 = no limit
  onClose: () => void
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

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

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

export default function LeaveRequestModal({ soldiers, from, to, maxDays, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [soldierId, setSoldierId] = useState('')
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const days = daysInRange(from, to)
  const count = selectedDays.size
  const overQuota = maxDays > 0 && count > maxDays

  const filtered = soldiers
    .filter(s => s.is_active && s.full_name.includes(search))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'he'))

  function toggleDay(d: string) {
    setSelectedDays(prev => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }

  async function submit() {
    if (!soldierId || count === 0) return
    setSubmitting(true)
    for (const date of Array.from(selectedDays)) {
      await addDoc(collection(db, 'leave_requests'), {
        soldier_id: soldierId,
        date,
        status: 'pending',
        is_final: false,
        note: note.trim() || null,
        created_at: Timestamp.now(),
      })
    }
    setDone(true)
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-0 sm:px-4" dir="rtl">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        {done ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">הבקשה נשלחה!</h2>
            <p className="text-slate-500 text-sm mb-6">הבקשה תועבר לאחראי שבצ&quot;ק לאישור.</p>
            <button onClick={onClose} className="bg-navy text-white rounded-xl px-6 py-2 font-semibold">
              סגור
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-800">בקשת יציאות</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {/* Soldier search */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1">שם החייל</label>
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setSoldierId('') }}
                placeholder="חפש שם..."
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy"
              />
              {search && !soldierId && (
                <div className="border border-slate-200 rounded-xl mt-1 max-h-40 overflow-y-auto shadow-sm">
                  {filtered.length === 0 ? (
                    <p className="text-slate-400 text-sm px-3 py-2">לא נמצא</p>
                  ) : filtered.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSoldierId(s.id); setSearch(s.full_name) }}
                      className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      {s.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quota counter + warning */}
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-700">בחר ימי יציאה</label>
              {maxDays > 0 && (
                <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                  overQuota ? 'bg-red-100 text-red-700' : count > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {count} / {maxDays}
                </span>
              )}
            </div>

            {/* Over-quota warning */}
            {overQuota && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-3 py-2 mb-3">
                ⚠️ שים לב: אתה מבקש יותר ימים מהמכסה המוגדרת ({maxDays} ימים). ניתן לשלוח בכל זאת, אך הבקשה תועבר לבדיקת האחראי.
              </div>
            )}

            {/* Day selector */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {days.map(d => {
                const selected = selectedDays.has(d)
                return (
                  <button
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition ${
                      selected
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-navy'
                    }`}
                  >
                    {dayLabel(d)}
                  </button>
                )
              })}
            </div>

            {/* Free-text note */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-slate-700 mb-1">הערה (אופציונלי)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="לדוגמה: חתונה משפחתית, צריך לחזור עד 18:00..."
                rows={2}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy resize-none"
              />
            </div>

            <button
              onClick={submit}
              disabled={!soldierId || count === 0 || submitting}
              className="w-full bg-navy text-white rounded-xl py-3 font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'שולח...' : 'שלח בקשה'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
