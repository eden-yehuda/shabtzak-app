import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useAllSchedulesTotals } from '@/hooks/useAllSchedulesTotals'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { taskDurationHours } from '@/utils/dateUtils'
import type { Soldier, Task, Assignment, LeaveRequest } from '@/types'

// Soldiers who shared a single position in a split (פיצול) — each was present ~50% of
// the time, so comparing their home-days / hours head-to-head with full-time soldiers is
// misleading. We exclude them from superlative comparison questions.
function isSplitSoldier(name: string): boolean {
  return name.includes('ברמה') || name.includes('עמיחי')
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregated per-soldier stats across the whole "קו" (all schedules)
// ─────────────────────────────────────────────────────────────────────────────
interface SoldierStat {
  id: string
  name: string
  isCommander: boolean
  shifts: number                          // number of assigned shifts (PRIMARY metric)
  shiftsByType: Record<string, number>    // shift count per task type
  total: number                           // total hours (secondary)
  byType: Record<string, number>          // hours per task type
}

function buildStats(soldiers: Soldier[], tasks: Task[], assignments: Assignment[]): SoldierStat[] {
  const taskById = new Map(tasks.map(t => [t.id, t]))
  const map: Record<string, SoldierStat> = {}
  for (const s of soldiers) {
    if (!s.is_active) continue
    map[s.id] = { id: s.id, name: s.full_name, isCommander: s.is_commander, shifts: 0, shiftsByType: {}, total: 0, byType: {} }
  }
  for (const a of assignments) {
    const t = taskById.get(a.task_id)
    const stat = map[a.soldier_id]
    if (!t || !stat) continue
    const h = taskDurationHours(t.start_datetime, t.end_datetime)
    if (h <= 0) continue
    stat.shifts += 1
    stat.shiftsByType[t.task_type] = (stat.shiftsByType[t.task_type] ?? 0) + 1
    stat.total += h
    stat.byType[t.task_type] = (stat.byType[t.task_type] ?? 0) + h
  }
  return Object.values(map)
    .filter(s => s.shifts > 0)
    .map(s => ({ ...s, total: Math.round(s.total) }))
    // PRIMARY ordering by shift count; ties broken by hours
    .sort((a, b) => b.shifts - a.shifts || b.total - a.total)
}

// Home days per soldier: approved final-leave dates + fixed home ranges (mirrors validation.ts)
function buildHomeDays(soldiers: Soldier[], finalLeave: LeaveRequest[]): Record<string, number> {
  const sets: Record<string, Set<string>> = {}
  const add = (id: string, d: string) => { (sets[id] ??= new Set()).add(d) }
  for (const r of finalLeave) {
    if (r.status === 'approved') add(r.soldier_id, r.date)
  }
  for (const s of soldiers) {
    for (const range of s.fixed_home_ranges ?? []) {
      if (!range.from || !range.to) continue
      const cur = new Date(range.from)
      const to = new Date(range.to)
      while (cur <= to) { add(s.id, cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }
    }
  }
  const out: Record<string, number> = {}
  for (const [id, set] of Object.entries(sets)) out[id] = set.size
  return out
}

// Co-occurrence: how many shifts each pair of soldiers shared. Returns, per soldier,
// the list of partners sorted by most shared shifts first.
function buildPartners(assignments: Assignment[]): Record<string, Array<{ id: string; count: number }>> {
  const byTask: Record<string, string[]> = {}
  for (const a of assignments) (byTask[a.task_id] ??= []).push(a.soldier_id)
  const pair: Record<string, Record<string, number>> = {}
  for (const ids of Object.values(byTask)) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const x = ids[i], y = ids[j]
        if (x === y) continue
        ;(pair[x] ??= {})[y] = (pair[x][y] ?? 0) + 1
        ;(pair[y] ??= {})[x] = (pair[y][x] ?? 0) + 1
      }
    }
  }
  const out: Record<string, Array<{ id: string; count: number }>> = {}
  for (const [id, m] of Object.entries(pair)) {
    out[id] = Object.entries(m).map(([pid, c]) => ({ id: pid, count: c })).sort((a, b) => b.count - a.count)
  }
  return out
}

// Longest continuous on-duty stretch (hours): merge each soldier's touching/overlapping
// shifts into blocks and take the longest block.
function buildLongestStreak(tasks: Task[], assignments: Assignment[]): Record<string, number> {
  const taskById = new Map(tasks.map(t => [t.id, t]))
  const bySoldier: Record<string, Array<{ s: number; e: number }>> = {}
  for (const a of assignments) {
    const t = taskById.get(a.task_id)
    if (!t) continue
    const s = t.start_datetime.getTime(), e = t.end_datetime.getTime()
    if (e <= s) continue
    ;(bySoldier[a.soldier_id] ??= []).push({ s, e })
  }
  const out: Record<string, number> = {}
  for (const [id, ivs] of Object.entries(bySoldier)) {
    ivs.sort((a, b) => a.s - b.s)
    let bestMs = 0, curS = ivs[0].s, curE = ivs[0].e
    for (let i = 1; i < ivs.length; i++) {
      if (ivs[i].s <= curE) { curE = Math.max(curE, ivs[i].e) }   // touching / overlapping → same block
      else { bestMs = Math.max(bestMs, curE - curS); curS = ivs[i].s; curE = ivs[i].e }
    }
    bestMs = Math.max(bestMs, curE - curS)
    out[id] = Math.round(bestMs / 3_600_000)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Confetti — self-contained canvas burst, no dependencies
// ─────────────────────────────────────────────────────────────────────────────
function fireConfetti(originY = 0.35) {
  if (typeof window === 'undefined') return
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) { canvas.remove(); return }
  const colors = ['#fbbf24', '#f87171', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#facc15']
  const parts = Array.from({ length: 160 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 200,
    y: canvas.height * originY,
    vx: (Math.random() - 0.5) * 16,
    vy: Math.random() * -16 - 4,
    size: Math.random() * 9 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * 360,
    vrot: (Math.random() - 0.5) * 22,
    life: 0,
  }))
  let raf = 0
  const g = 0.38
  function frame() {
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let alive = false
    for (const p of parts) {
      p.vy += g; p.x += p.vx; p.y += p.vy; p.rot += p.vrot; p.life++
      if (p.y < canvas.height + 40) alive = true
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rot * Math.PI) / 180)
      ctx.globalAlpha = Math.max(0, 1 - p.life / 180)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    }
    if (alive) raf = requestAnimationFrame(frame)
    else canvas.remove()
  }
  frame()
  // safety cleanup
  window.setTimeout(() => { cancelAnimationFrame(raf); canvas.remove() }, 6000)
}

// ─────────────────────────────────────────────────────────────────────────────
// Count-up hook
// ─────────────────────────────────────────────────────────────────────────────
function useCountUp(target: number, start: boolean, duration = 1300): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!start) return
    let raf = 0
    let t0: number | null = null
    const tick = (t: number) => {
      if (t0 === null) t0 = t
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setVal(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, start, duration])
  return val
}

// ─────────────────────────────────────────────────────────────────────────────
// Trivia generation from the aggregated data
// ─────────────────────────────────────────────────────────────────────────────
interface Question { q: string; options: string[]; correct: number; emoji: string }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickDistractorNames(all: string[], exclude: string[], n: number): string[] {
  const pool = all.filter(x => !exclude.includes(x))
  return shuffle(pool).slice(0, n)
}

function makeWhoQuestion(q: string, emoji: string, correctName: string, allNames: string[]): Question | null {
  const distractors = pickDistractorNames(allNames, [correctName], 3)
  if (distractors.length < 3) return null
  const options = shuffle([correctName, ...distractors])
  return { q, emoji, options, correct: options.indexOf(correctName) }
}

// Binary "A or B" comparison — the flavor the user asked for ("מי היה יותר X")
function makeBinaryQuestion(q: string, emoji: string, aName: string, bName: string, correctName: string): Question {
  const options = shuffle([aName, bName])
  return { q, emoji, options, correct: options.indexOf(correctName) }
}

// "מי מהבאים עשה יותר X" — pick 4 soldiers with a unique top scorer as the answer.
function makeComparisonQuestion(q: string, emoji: string, scored: Array<{ name: string; val: number }>): Question | null {
  const pool = scored.filter(x => x.val > 0)
  if (pool.length < 4) return null
  const top = [...pool].sort((a, b) => b.val - a.val)[0]
  const lessers = shuffle(pool.filter(x => x.val < top.val))
  if (lessers.length < 3) return null
  const opts = shuffle([top, ...lessers.slice(0, 3)])
  return { q, emoji, options: opts.map(o => o.name), correct: opts.findIndex(o => o === top) }
}

// Fixed-answer question with hand-picked options (for the insider/"spicy" questions).
function makeFixedQuestion(q: string, emoji: string, correct: string, distractors: string[]): Question {
  const options = shuffle([correct, ...distractors])
  return { q, emoji, options, correct: options.indexOf(correct) }
}

// Insider jokes — one of these is included in EVERY quiz. Answers are intentional, not data-driven.
const SPICY_QUESTIONS: Array<{ q: string; emoji: string; correct: string; distractors: string[] }> = [
  { q: 'מי היה אמור להיות השבצקיסט בקו הזה? 🤫', emoji: '🤫', correct: 'חגי', distractors: ['עדן', 'אוראל אפנזר', 'צארום'] },
  { q: 'למי היה ממשק סודי לראות את השבצ"ק שבוע קדימה? 🕵️', emoji: '🕵️', correct: 'צארום', distractors: ['אוראל אפנזר', 'בוצר', 'חגי'] },
  { q: 'מי מחק שבוע שלם של שבצ"ק בטעות? 😱', emoji: '😱', correct: 'אוראל אפנזר', distractors: ['מיתר', 'צארום', 'חגי'] },
  { q: 'את מי ניסינו להעלות של"ז כל הזמן? 😅', emoji: '😅', correct: 'מאור', distractors: ['צארום', 'חגי', 'מיתר'] },
]

// Task types that are not "real" missions — excluded from all task-type questions.
const EXCLUDED_TYPES = new Set(['תרג"ד'])

function makeNumberQuestion(q: string, emoji: string, answer: number, unit = 'שעות'): Question {
  const variants = new Set<number>([answer])
  const offsets = [0.7, 0.85, 1.18, 1.35, 1.6]
  for (const o of shuffle(offsets)) {
    if (variants.size >= 4) break
    const v = Math.max(1, Math.round((answer * o) / 5) * 5)
    variants.add(v)
  }
  let bump = 5
  while (variants.size < 4) { variants.add(answer + bump); bump += 5 }
  const opts = shuffle(Array.from(variants)).slice(0, 4)
  if (!opts.includes(answer)) opts[0] = answer
  const options = shuffle(opts).map(n => `${n} ${unit}`)
  return { q, emoji, options, correct: options.indexOf(`${answer} ${unit}`) }
}

interface QuizExtras {
  homeDays: Record<string, number>
  partners: Record<string, Array<{ id: string; count: number }>>
  nameById: Record<string, string>
  streak: Record<string, number>   // longest continuous on-duty stretch (hours) per soldier
}

const QUIZ_LENGTH = 8

function buildQuiz(stats: SoldierStat[], extras: QuizExtras): Question[] {
  const allNames = stats.map(s => s.name)
  if (stats.length < 4) return []
  const { homeDays, partners, nameById, streak } = extras

  // Buckets keep categories separated so we can guarantee variety in the final mix.
  const typeQs: Question[] = []
  const comparisonQs: Question[] = []   // "מי מהבאים עשה יותר X"
  const homeQs: Question[] = []
  const partnerQs: Question[] = []
  const streakQs: Question[] = []
  const classicQs: Question[] = []

  // ── Task-type questions by SHIFT COUNT (superlative + binary), excluding non-missions ──
  const typeShiftTotals: Record<string, number> = {}
  for (const s of stats) for (const [t, n] of Object.entries(s.shiftsByType)) {
    if (EXCLUDED_TYPES.has(t)) continue
    typeShiftTotals[t] = (typeShiftTotals[t] ?? 0) + n
  }
  const topTypes = Object.entries(typeShiftTotals).sort((a, b) => b[1] - a[1]).map(([t]) => t)
  for (const type of topTypes.slice(0, 8)) {
    const ranked = [...stats].filter(s => (s.shiftsByType[type] ?? 0) > 0).sort((a, b) => (b.shiftsByType[type] ?? 0) - (a.shiftsByType[type] ?? 0))
    if (ranked.length >= 1) {
      const sup = makeWhoQuestion(`מי עשה הכי הרבה משמרות "${type}"?`, '🎯', ranked[0].name, allNames)
      if (sup) typeQs.push(sup)
    }
    // "מי מהבאים עשה יותר X" — 4 plausible candidates
    const cmp = makeComparisonQuestion(`מי מהבאים עשה יותר "${type}"?`, '⚖️',
      stats.map(s => ({ name: s.name, val: s.shiftsByType[type] ?? 0 })))
    if (cmp) comparisonQs.push(cmp)
  }

  // ── Home days (excluding split-position soldiers — they were ~50% by design) ──
  const homeRanked = stats
    .filter(s => !isSplitSoldier(s.name) && (homeDays[s.id] ?? 0) > 0)
    .sort((a, b) => (homeDays[b.id] ?? 0) - (homeDays[a.id] ?? 0))
  const nonSplit = stats.filter(s => !isSplitSoldier(s.name))
  const nonSplitNames = nonSplit.map(s => s.name)
  if (homeRanked.length >= 4) {
    const sup = makeWhoQuestion('מי היה הכי הרבה ימים בבית? 🏠', '🏠', homeRanked[0].name, nonSplitNames)
    if (sup) homeQs.push(sup)
    const cmp = makeComparisonQuestion('מי מהבאים היה יותר ימים בבית? 🏠', '🏠',
      nonSplit.map(s => ({ name: s.name, val: homeDays[s.id] ?? 0 })))
    if (cmp) comparisonQs.push(cmp)
  }

  // ── Longest continuous on-duty stretch ──
  const streakRanked = stats.filter(s => (streak[s.id] ?? 0) > 0).sort((a, b) => (streak[b.id] ?? 0) - (streak[a.id] ?? 0))
  if (streakRanked.length >= 4) {
    const sup = makeWhoQuestion('מי שובץ למשימות הכי הרבה זמן ברצף? ⏳', '⏳', streakRanked[0].name, allNames)
    if (sup) streakQs.push(sup)
    const cmp = makeComparisonQuestion('מי מהבאים היה הכי הרבה זמן ברצף במשימות? ⏳', '⏳',
      stats.map(s => ({ name: s.name, val: streak[s.id] ?? 0 })))
    if (cmp) comparisonQs.push(cmp)
  }

  // ── "מי היה הכי הרבה עם מי" — co-occurrence partners ──
  const wellConnected = stats.filter(s => {
    const p = partners[s.id]
    return p && p.length >= 1 && p[0].count > 0 && (p.length < 2 || p[0].count > p[1].count)
  })
  for (const s of shuffle(wellConnected).slice(0, 4)) {
    const top = partners[s.id][0]
    const topName = nameById[top.id]
    if (!topName) continue
    const pool = allNames.filter(n => n !== s.name)
    const q = makeWhoQuestion(`עם מי ${s.name} חלק את הכי הרבה משמרות משותפות? 🤝`, '🤝', topName, pool)
    if (q) partnerQs.push(q)
  }

  // ── Spicy insider questions — one is always included ──
  const spicyQs = SPICY_QUESTIONS.map(s => makeFixedQuestion(s.q, s.emoji, s.correct, s.distractors))

  // ── Classic questions — emphasizing SHIFT COUNT ──
  // stats is already sorted by shifts desc, so stats[0] is the busiest soldier.
  const c1 = makeWhoQuestion('מי עשה הכי הרבה משמרות בקו? 👑', '👑', stats[0].name, allNames)
  if (c1) classicQs.push(c1)
  const totalShifts = stats.reduce((s, x) => s + x.shifts, 0)
  classicQs.push(makeNumberQuestion('כמה משמרות עשה הצוות כולו בקו?', '📋', Math.round(totalShifts / 5) * 5, 'משמרות'))
  classicQs.push(makeNumberQuestion(`כמה משמרות עשה ${stats[0].name}?`, '🔥', stats[0].shifts, 'משמרות'))
  const lowest = [...nonSplit].pop()
  if (lowest) {
    const cLow = makeWhoQuestion('מי עשה הכי מעט משמרות (מבין המלאים)? 😴', '😴', lowest.name, allNames)
    if (cLow) classicQs.push(cLow)
  }

  // ── Assemble: always 1 spicy + guaranteed category coverage, then fill ──
  const final: Question[] = []
  const used = new Set<Question>()
  const take = (arr: Question[], n: number) => {
    for (const q of shuffle(arr)) {
      if (final.length >= QUIZ_LENGTH || n <= 0) break
      if (!used.has(q)) { final.push(q); used.add(q); n-- }
    }
  }
  take(spicyQs, 1)        // always exactly one insider question
  take(typeQs, 2)         // superlatives by type (סיור / של"ז / בלת"מ / מטבח …)
  take(comparisonQs, 2)   // "מי מהבאים"
  take(streakQs, 1)       // longest continuous stretch
  take(homeQs, 1)         // home days
  take(partnerQs, 1)      // who-with-whom
  // fill any remaining slots from the whole pool
  take([...typeQs, ...comparisonQs, ...streakQs, ...homeQs, ...partnerQs, ...classicQs], QUIZ_LENGTH)

  return shuffle(final).slice(0, QUIZ_LENGTH)
}

// ─────────────────────────────────────────────────────────────────────────────
// Podium / bar components
// ─────────────────────────────────────────────────────────────────────────────
const MEDALS = ['🥇', '🥈', '🥉']
const PODIUM_COLORS = ['from-yellow-300 to-amber-500', 'from-slate-200 to-slate-400', 'from-orange-300 to-orange-500']
const PODIUM_HEIGHTS = ['h-48', 'h-36', 'h-28']
const PODIUM_ORDER = [1, 0, 2] // visual L-to-R: 2nd, 1st, 3rd

function Podium({ top, started }: { top: SoldierStat[]; started: boolean }) {
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-6 mb-10" dir="rtl">
      {PODIUM_ORDER.map((rank) => {
        const s = top[rank]
        if (!s) return null
        return <PodiumCol key={s.id} stat={s} rank={rank} started={started} />
      })}
    </div>
  )
}

function PodiumCol({ stat, rank, started }: { stat: SoldierStat; rank: number; started: boolean }) {
  const shifts = useCountUp(stat.shifts, started, 1500)
  return (
    <div className="flex flex-col items-center" style={{ transitionDelay: `${rank * 150}ms` }}>
      <div className={`text-4xl sm:text-5xl mb-1 transition-all duration-700 ${started ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
        style={{ transitionDelay: `${600 + rank * 200}ms` }}>
        {MEDALS[rank]}
      </div>
      <div className="text-white font-bold text-sm sm:text-lg text-center mb-1 max-w-[110px] truncate">
        {stat.isCommander && <span className="text-yellow-300">★ </span>}{stat.name}
      </div>
      <div className="text-yellow-300 font-extrabold text-lg sm:text-2xl tabular-nums leading-none">{Math.round(shifts)}<span className="text-xs"> משמרות</span></div>
      <div className="text-white/50 text-[11px] mb-2 tabular-nums">{stat.total} שעות</div>
      <div
        className={`w-20 sm:w-28 rounded-t-2xl bg-gradient-to-t ${PODIUM_COLORS[rank]} shadow-2xl flex items-start justify-center pt-2 transition-all duration-1000 ease-out ${PODIUM_HEIGHTS[rank]}`}
        style={{ transform: started ? 'scaleY(1)' : 'scaleY(0)', transformOrigin: 'bottom', transitionDelay: `${rank * 150}ms` }}
      >
        <span className="text-white/90 font-black text-3xl sm:text-4xl drop-shadow">{rank + 1}</span>
      </div>
    </div>
  )
}

function BarRow({ stat, rank, max, started }: { stat: SoldierStat; rank: number; max: number; started: boolean }) {
  const shifts = useCountUp(stat.shifts, started, 1200)
  const pct = max > 0 ? (stat.shifts / max) * 100 : 0
  return (
    <div className="flex items-center gap-3" dir="rtl">
      <span className="text-slate-400 font-bold w-6 text-center tabular-nums">{rank + 1}</span>
      <span className="text-slate-200 text-sm font-semibold w-28 sm:w-36 truncate">
        {stat.isCommander && <span className="text-yellow-400">★ </span>}{stat.name}
      </span>
      <div className="flex-1 bg-white/5 rounded-full h-6 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-l from-indigo-400 via-purple-400 to-fuchsia-400 transition-all duration-1000 ease-out flex items-center justify-start pr-2"
          style={{ width: started ? `${Math.max(pct, 8)}%` : '0%', transitionDelay: `${rank * 90}ms` }}
        />
      </div>
      <span className="text-purple-200 font-bold text-sm w-20 text-left tabular-nums">{Math.round(shifts)} משמ׳</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
type Stage = 'intro' | 'board' | 'quiz' | 'results'

export default function CelebrationShow({ backHref, backLabel }: { backHref?: string; backLabel?: string }) {
  const soldiers = useSoldiers(false)
  const finalLeave = useFinalLeave()
  const { allTasks, allAssignments } = useAllSchedulesTotals()

  const stats = useMemo(() => buildStats(soldiers, allTasks, allAssignments), [soldiers, allTasks, allAssignments])
  const quizExtras = useMemo<QuizExtras>(() => ({
    homeDays: buildHomeDays(soldiers, finalLeave),
    partners: buildPartners(allAssignments),
    nameById: Object.fromEntries(soldiers.map(s => [s.id, s.full_name])),
    streak: buildLongestStreak(allTasks, allAssignments),
  }), [soldiers, finalLeave, allTasks, allAssignments])

  const [stage, setStage] = useState<Stage>('intro')
  const [boardStarted, setBoardStarted] = useState(false)

  // freeze the quiz at the moment the user enters it (no live re-sync mid-game)
  const [quiz, setQuiz] = useState<Question[]>([])
  const [qIdx, setQIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ready = stats.length >= 3

  function goBoard() {
    setStage('board')
    setBoardStarted(false)
    window.setTimeout(() => { setBoardStarted(true); fireConfetti(0.3) }, 350)
  }

  function goQuiz() {
    setQuiz(buildQuiz(stats, quizExtras))
    setQIdx(0); setScore(0); setPicked(null)
    setStage('quiz')
  }

  function answer(i: number) {
    if (picked !== null) return
    setPicked(i)
    const correct = i === quiz[qIdx].correct
    if (correct) { setScore(s => s + 1); fireConfetti(0.5) }
    advanceRef.current = setTimeout(() => {
      if (qIdx + 1 < quiz.length) { setQIdx(qIdx + 1); setPicked(null) }
      else { setStage('results'); fireConfetti(0.4) }
    }, 1500)
  }

  useEffect(() => () => { if (advanceRef.current) clearTimeout(advanceRef.current) }, [])

  return (
    <div className="min-h-screen w-full overflow-hidden relative text-white" dir="rtl"
      style={{ background: 'radial-gradient(1200px 600px at 50% -10%, #3b0764 0%, #1e1b4b 40%, #0f172a 100%)' }}>

      {/* floating background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="absolute rounded-full blur-3xl opacity-20 float-orb"
            style={{
              width: 200 + i * 40, height: 200 + i * 40,
              left: `${(i * 17 + 5) % 90}%`, top: `${(i * 23 + 10) % 80}%`,
              background: ['#a855f7', '#6366f1', '#ec4899', '#8b5cf6', '#3b82f6', '#d946ef'][i],
              animationDelay: `${i * 0.8}s`,
            }} />
        ))}
      </div>

      {backHref && (
        <Link href={backHref} className="absolute top-4 right-4 z-20 text-white/60 hover:text-white text-sm bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition">
          {backLabel ?? '← חזרה'}
        </Link>
      )}

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-10 min-h-screen flex flex-col justify-center">

        {!ready && (
          <div className="text-center text-white/70 py-20">
            <div className="text-6xl mb-4">📊</div>
            אין מספיק נתונים להצגה עדיין. שבץ עוד כמה משימות וחזור.
          </div>
        )}

        {/* ── INTRO ── */}
        {ready && stage === 'intro' && (
          <div className="text-center animate-fadeup">
            <div className="text-7xl sm:text-8xl mb-6 trophy-bounce">🏆</div>
            <h1 className="text-4xl sm:text-6xl font-black mb-3 bg-clip-text text-transparent bg-gradient-to-l from-yellow-200 via-amber-300 to-yellow-500">
              טבלת הצדק
            </h1>
            <p className="text-lg sm:text-2xl text-purple-200 mb-2">סיכום הקו — מי הרים את הצוות?</p>
            <p className="text-sm text-white/50 mb-10">{stats.length} לוחמים · {stats.reduce((s, x) => s + x.shifts, 0).toLocaleString()} משמרות · {stats.reduce((s, x) => s + x.total, 0).toLocaleString()} שעות</p>
            <button onClick={goBoard}
              className="text-xl font-bold bg-gradient-to-l from-amber-400 to-yellow-500 text-amber-950 rounded-2xl px-10 py-4 shadow-2xl hover:scale-105 active:scale-95 transition pulse-glow">
              ▶ התחל את ההצגה
            </button>
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {ready && stage === 'board' && (
          <div className="animate-fadeup">
            <h2 className="text-3xl sm:text-4xl font-black text-center mb-2 bg-clip-text text-transparent bg-gradient-to-l from-yellow-200 to-amber-400">
              🏆 לוח התורמים הגדולים
            </h2>
            <p className="text-center text-sm text-purple-200/70 mb-8">לפי מספר משמרות</p>

            <Podium top={stats.slice(0, 3)} started={boardStarted} />

            {stats.length > 3 && (
              <div className="bg-white/5 backdrop-blur rounded-2xl p-5 space-y-3 border border-white/10">
                {stats.slice(3, 12).map((s, i) => (
                  <BarRow key={s.id} stat={s} rank={i + 3} max={stats[0].shifts} started={boardStarted} />
                ))}
              </div>
            )}

            <div className="text-center mt-8">
              <button onClick={goQuiz}
                className="text-lg font-bold bg-gradient-to-l from-fuchsia-500 to-purple-600 text-white rounded-2xl px-8 py-3.5 shadow-xl hover:scale-105 active:scale-95 transition">
                🧠 לחידון הטריוויה ▶
              </button>
            </div>
          </div>
        )}

        {/* ── QUIZ ── */}
        {ready && stage === 'quiz' && quiz.length > 0 && (
          <div className="animate-fadeup" key={qIdx}>
            {/* progress */}
            <div className="flex items-center justify-between mb-2 text-sm text-purple-200">
              <span>שאלה {qIdx + 1} מתוך {quiz.length}</span>
              <span className="font-bold">⭐ {score}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full mb-8 overflow-hidden">
              <div className="h-full bg-gradient-to-l from-fuchsia-400 to-purple-500 transition-all duration-500"
                style={{ width: `${((qIdx) / quiz.length) * 100}%` }} />
            </div>

            <div className="text-center mb-8">
              <div className="text-5xl mb-4">{quiz[qIdx].emoji}</div>
              <h2 className="text-2xl sm:text-3xl font-bold leading-snug">{quiz[qIdx].q}</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quiz[qIdx].options.map((opt, i) => {
                const isCorrect = i === quiz[qIdx].correct
                const isPicked = i === picked
                let cls = 'bg-white/10 hover:bg-white/20 border-white/20'
                if (picked !== null) {
                  if (isCorrect) cls = 'bg-emerald-500/90 border-emerald-300 scale-[1.02]'
                  else if (isPicked) cls = 'bg-red-500/80 border-red-300'
                  else cls = 'bg-white/5 border-white/10 opacity-50'
                }
                return (
                  <button key={i} onClick={() => answer(i)} disabled={picked !== null}
                    className={`border-2 rounded-2xl px-5 py-4 text-lg font-semibold text-right transition-all duration-300 ${cls}`}>
                    <span className="inline-flex items-center gap-2">
                      {picked !== null && isCorrect && <span>✓</span>}
                      {picked !== null && isPicked && !isCorrect && <span>✗</span>}
                      {opt}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {ready && stage === 'results' && (
          <div className="text-center animate-fadeup">
            <div className="text-7xl mb-4 trophy-bounce">{score === quiz.length ? '🏆' : score >= quiz.length * 0.6 ? '🎉' : '💪'}</div>
            <h2 className="text-4xl sm:text-5xl font-black mb-3 bg-clip-text text-transparent bg-gradient-to-l from-yellow-200 to-amber-400">
              {ratingTitle(score, quiz.length)}
            </h2>
            <p className="text-2xl text-purple-200 mb-2">ענית נכון על</p>
            <p className="text-6xl font-black mb-10 tabular-nums">
              <span className="text-emerald-400">{score}</span>
              <span className="text-white/40"> / {quiz.length}</span>
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <button onClick={() => { setStage('intro') }}
                className="text-lg font-bold bg-gradient-to-l from-amber-400 to-yellow-500 text-amber-950 rounded-2xl px-7 py-3.5 shadow-xl hover:scale-105 active:scale-95 transition">
                🔄 מההתחלה
              </button>
              <button onClick={goQuiz}
                className="text-lg font-bold bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl px-7 py-3.5 transition">
                🧠 חידון חדש
              </button>
              {backHref && (
                <Link href={backHref}
                  className="text-lg font-bold bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl px-7 py-3.5 transition flex items-center">
                  {backHref === '/admin/justice' ? '📊 לטבלה המלאה' : '↩ ' + (backLabel?.replace('← ', '') ?? 'חזרה')}
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeup { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeup { animation: fadeup 0.6s cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes trophyBounce { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-14px) rotate(3deg); } }
        .trophy-bounce { animation: trophyBounce 2.2s ease-in-out infinite; }
        @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(251,191,36,0.5); } 50% { box-shadow: 0 0 40px 8px rgba(251,191,36,0.6); } }
        .pulse-glow { animation: pulseGlow 2s ease-in-out infinite; }
        @keyframes floatOrb { 0%,100% { transform: translate(0,0); } 50% { transform: translate(30px,-40px); } }
        .float-orb { animation: floatOrb 12s ease-in-out infinite; }
      `}</style>
    </div>
  )
}

function ratingTitle(score: number, total: number): string {
  const r = total > 0 ? score / total : 0
  if (r === 1) return 'גאון השבצ״ק! 🧠'
  if (r >= 0.8) return 'מומחה צדק! 🌟'
  if (r >= 0.6) return 'יודע עניין 👍'
  if (r >= 0.4) return 'לא רע בכלל 🙂'
  return 'יש מקום לשיפור 💪'
}
