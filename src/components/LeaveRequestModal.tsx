import { useState, useEffect, useMemo } from 'react'
import { onSnapshot, query, where, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { leaveRequestsRef } from '@/lib/firestore'
import type { Soldier, LeaveRequest } from '@/types'

interface Props {
  soldiers: Soldier[]
  from: string
  to: string
  maxDays: number
  onClose: () => void
  defaultSoldierId?: string | null
}

const DAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

// Special dates
const SHAVUOT = '2026-05-22'  // חג שבועות — treated like Fri/Sat
const COMPANY_DAY = '2026-05-17'  // יום פלוגה — no leave except exceptions

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

function isWeekendDay(date: string): boolean {
  if (date === SHAVUOT) return true
  const dow = new Date(date + 'T12:00:00').getDay()
  return dow === 5 || dow === 6 // Fri or Sat
}

function isSaturday(date: string): boolean {
  return new Date(date + 'T12:00:00').getDay() === 6
}

function isFriday(date: string): boolean {
  if (date === SHAVUOT) return true
  return new Date(date + 'T12:00:00').getDay() === 5
}

// Disclaimer text
const DISCLAIMER_RULES = [
  { icon: '📅', text: 'לבחור 6 ימים מקסימום. שבת אחת ושישי אחד (או חג) מותר ברצף.' },
  { icon: '🔗', text: 'יש לרשום לפחות יומיים ברצף כדי לא ליצור בלאגן של יוצאים חוזרים.' },
  { icon: '✡️', text: 'שישי 22/5 הוא חג שבועות — מתייחסים אליו כמו שישי או שבת.' },
  { icon: '🪖', text: 'יום ראשון 17/5 הוא יום פלוגה (אימון + ערב). לא יוצאים למעט חריגים.' },
]

function computeWarnings(selectedDates: string[], maxDays: number): string[] {
  const warnings: string[] = []
  if (selectedDates.length === 0) return warnings

  // 1. Max days
  if (maxDays > 0 && selectedDates.length > maxDays) {
    warnings.push(`שים לב: צריך לבחור ${maxDays} ימים מקסימום`)
  }

  // 2. At least 2 consecutive days
  const sorted = [...selectedDates].sort()
  let hasConsecutive = false
  for (let i = 0; i < sorted.length - 1; i++) {
    const d1 = new Date(sorted[i] + 'T12:00:00').getTime()
    const d2 = new Date(sorted[i + 1] + 'T12:00:00').getTime()
    if (Math.round((d2 - d1) / 86400000) === 1) { hasConsecutive = true; break }
  }
  if (sorted.length >= 2 && !hasConsecutive) {
    warnings.push('יש לבחור לפחות יומיים ברצף')
  }

  // 3. Only one weekend (max 1 Friday incl. Shavuot + max 1 Saturday)
  const fridayCount = selectedDates.filter(isFriday).length
  const saturdayCount = selectedDates.filter(isSaturday).length
  if (fridayCount > 1 || saturdayCount > 1) {
    warnings.push('אפשר לבחור רק סופ"ש אחד ולא שניים')
  }

  // 4. Company day
  if (selectedDates.includes(COMPANY_DAY)) {
    warnings.push('ב-17.5 תאושר יציאה רק לחריגים')
  }

  return warnings
}

export default function LeaveRequestModal({ soldiers, from, to, maxDays, onClose, defaultSoldierId }: Props) {
  const [soldierId, setSoldierId] = useState(defaultSoldierId ?? '')
  const [search, setSearch] = useState(() =>
    defaultSoldierId ? (soldiers.find(s => s.id === defaultSoldierId)?.full_name ?? '') : ''
  )
  const [showDropdown, setShowDropdown] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(true)

  // Real-time: all pending (non-final) requests in survey range
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([])
  useEffect(() => {
    const q = query(leaveRequestsRef(), where('is_final', '==', false))
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        created_at: d.data().created_at?.toDate?.() ?? new Date(),
      } as LeaveRequest)).filter(r => r.date >= from && r.date <= to)
      setAllRequests(all)
    })
  }, [from, to])

  const days = useMemo(() => daysInRange(from, to), [from, to])

  // This soldier's existing requests: date → docId
  const myRequests = useMemo(() => {
    const m: Record<string, string> = {}
    for (const r of allRequests) {
      if (r.soldier_id === soldierId) m[r.date] = r.id
    }
    return m
  }, [allRequests, soldierId])

  // All soldiers' selected days: soldierID → Set<date>
  const requestsBySoldier = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const r of allRequests) {
      if (!m[r.soldier_id]) m[r.soldier_id] = new Set()
      m[r.soldier_id].add(r.date)
    }
    return m
  }, [allRequests])

  // Toggle a day for my row — immediate Firestore write
  async function toggleDay(date: string) {
    if (!soldierId || toggling) return
    setToggling(true)
    try {
      if (myRequests[date]) {
        await deleteDoc(doc(db, 'leave_requests', myRequests[date]))
      } else {
        await addDoc(leaveRequestsRef(), {
          soldier_id: soldierId,
          date,
          status: 'pending',
          is_final: false,
          created_at: Timestamp.now(),
        })
      }
    } finally {
      setToggling(false)
    }
  }

  // Active soldiers: me first, then rest alphabetically
  const sortedSoldiers = useMemo(() => {
    const active = soldiers.filter(s => s.is_active)
    if (!soldierId) return active.sort((a, b) => a.full_name.localeCompare(b.full_name, 'he'))
    const me = active.find(s => s.id === soldierId)
    const rest = active
      .filter(s => s.id !== soldierId)
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'he'))
    return me ? [me, ...rest] : rest
  }, [soldiers, soldierId])

  const filteredForDropdown = useMemo(() =>
    soldiers.filter(s => s.is_active && s.full_name.includes(search))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'he'))
      .slice(0, 20),
    [soldiers, search]
  )

  const myCount = Object.keys(myRequests).length
  const selectedDates = Object.keys(myRequests)
  const warnings = useMemo(() => computeWarnings(selectedDates, maxDays), [selectedDates, maxDays])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex flex-col" dir="rtl">
      <div className="bg-white flex-1 overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-bold text-navy">📅 סקר יציאות</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-2">×</button>
        </div>

        {/* Disclaimer overlay */}
        {showDisclaimer && (
          <div className="absolute inset-0 z-50 bg-white flex flex-col" dir="rtl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-navy">📅 סקר יציאות — הנחיות</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-2">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-3">
              {DISCLAIMER_RULES.map((r, i) => (
                <div key={i} className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <span className="text-2xl shrink-0">{r.icon}</span>
                  <p className="text-sm text-slate-800 leading-snug">{r.text}</p>
                </div>
              ))}
              <p className="text-xs text-slate-400 text-center mt-2">יש לאשר שקראת את ההנחיות לפני מילוי הסקר</p>
            </div>
            <div className="px-4 py-4 border-t border-slate-200 bg-white">
              <button
                onClick={() => setShowDisclaimer(false)}
                className="w-full bg-navy text-white rounded-xl py-3 font-bold text-sm"
              >
                הבנתי, ממשיכים ✓
              </button>
            </div>
          </div>
        )}

        {/* Soldier selector */}
        <div className="px-4 py-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-slate-700 shrink-0">מי אתה?</label>
            <div className="relative flex-1">
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setSoldierId(''); setShowDropdown(true) }}
                onFocus={() => setShowDropdown(true)}
                placeholder="חפש שם..."
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-navy"
              />
              {showDropdown && search && !soldierId && (
                <div className="absolute top-full right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-44 overflow-y-auto mt-1">
                  {filteredForDropdown.length === 0
                    ? <p className="text-slate-400 text-sm px-3 py-2">לא נמצא</p>
                    : filteredForDropdown.map(s => (
                      <button key={s.id}
                        onClick={() => { setSoldierId(s.id); setSearch(s.full_name); setShowDropdown(false) }}
                        className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50">
                        {s.full_name}
                      </button>
                    ))
                  }
                </div>
              )}
              {showDropdown && <div className="fixed inset-0 -z-10" onClick={() => setShowDropdown(false)} />}
            </div>
            {soldierId && maxDays > 0 && (
              <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${
                myCount > maxDays ? 'bg-red-100 text-red-700' : myCount > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {myCount}/{maxDays}
              </span>
            )}
          </div>
          {soldierId && (
            <p className="text-xs text-slate-400 mt-1.5 pr-1">לחץ על ימים בשורה שלך (מסומנת) כדי לסמן/לבטל בקשת יציאה</p>
          )}

          {/* Real-time validation warnings */}
          {soldierId && warnings.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 flex items-start gap-1.5">
                  <span className="shrink-0">⚠️</span>
                  <span>{w}</span>
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        {!soldierId ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            בחר את השם שלך כדי לראות ולערוך את הסקר
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="text-xs" style={{ direction: 'rtl', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="sticky right-0 z-30 bg-slate-700 text-white px-3 py-2 text-right font-semibold border-b border-slate-600 min-w-[110px] whitespace-nowrap">
                    שם
                  </th>
                  {days.map(d => {
                    const date = new Date(d + 'T12:00:00')
                    const isSpecial = d === SHAVUOT
                    const isBlocked = d === COMPANY_DAY
                    const isWknd = isWeekendDay(d)
                    return (
                      <th key={d} className={`text-white px-2 py-2 text-center font-semibold border-b border-slate-600 min-w-[48px] ${
                        isBlocked ? 'bg-red-800' : isSpecial ? 'bg-purple-700' : isWknd ? 'bg-slate-600' : 'bg-slate-700'
                      }`}>
                        <div>{DAY_SHORT[date.getDay()]}</div>
                        <div className="text-[10px] font-normal opacity-80">{date.getDate()}/{date.getMonth() + 1}</div>
                        {isSpecial && <div className="text-[9px] text-purple-200">חג</div>}
                        {isBlocked && <div className="text-[9px] text-red-200">פלוגה</div>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedSoldiers.map((s, idx) => {
                  const isMe = s.id === soldierId
                  const soldierDays = requestsBySoldier[s.id] ?? new Set()
                  return (
                    <tr key={s.id} className={isMe ? '' : ''}>
                      {/* Name cell */}
                      <td className={`sticky right-0 z-10 px-3 py-2 font-medium whitespace-nowrap border-b border-l ${
                        isMe
                          ? 'bg-blue-50 text-navy font-bold border-navy/20 border-l-navy/30'
                          : idx % 2 === 0
                            ? 'bg-white text-slate-700 border-slate-100'
                            : 'bg-slate-50 text-slate-700 border-slate-100'
                      }`}>
                        <div className="flex items-center gap-1">
                          {isMe && (
                            <span className="text-[9px] bg-navy text-white px-1 py-0.5 rounded font-bold shrink-0">אתה</span>
                          )}
                          {s.is_commander && <span className="text-navy text-[10px] shrink-0">★</span>}
                          <span className="truncate max-w-[80px]">{s.full_name}</span>
                        </div>
                      </td>

                      {/* Day cells */}
                      {days.map(d => {
                        const selected = soldierDays.has(d)
                        const isBlocked = d === COMPANY_DAY
                        const rowBg = isMe
                          ? 'bg-blue-50 border-navy/10'
                          : idx % 2 === 0 ? 'bg-white border-slate-100' : 'bg-slate-50 border-slate-100'

                        if (isMe) {
                          return (
                            <td key={d} className={`px-1 py-1 text-center border-b ${rowBg}`}>
                              <button
                                onClick={() => toggleDay(d)}
                                disabled={toggling}
                                className={`w-10 h-10 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                                  selected
                                    ? isBlocked
                                      ? 'bg-red-500 text-white shadow-sm'
                                      : 'bg-navy text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-300 hover:bg-navy/20 hover:text-navy'
                                }`}
                              >
                                {selected ? '✓' : ''}
                              </button>
                            </td>
                          )
                        }
                        return (
                          <td key={d} className={`px-1 py-1 text-center border-b ${rowBg}`}>
                            {selected
                              ? <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center mx-auto text-sm">✓</div>
                              : <div className="w-10 h-10" />
                            }
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 shrink-0 bg-white">
          <button
            onClick={onClose}
            className="w-full bg-navy text-white rounded-xl py-2.5 font-semibold text-sm"
          >
            {myCount > 0 ? `✓ שמור וסגור — ${myCount} ימים נבחרו` : 'סגור'}
          </button>
        </div>

      </div>
    </div>
  )
}
