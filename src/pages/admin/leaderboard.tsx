import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { useRouter } from 'next/router'
import { auth } from '@/lib/firebase'
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
  total: number                     // total hours
  byType: Record<string, number>    // hours per task type
  shifts: number                    // number of assigned tasks
}

function buildStats(soldiers: Soldier[], tasks: Task[], assignments: Assignment[]): SoldierStat[] {
  const taskById = new Map(tasks.map(t => [t.id, t]))
  const map: Record<string, SoldierStat> = {}
  for (const s of soldiers) {
    if (!s.is_active) continue
    map[s.id] = { id: s.id, name: s.full_name, isCommander: s.is_commander, total: 0, byType: {}, shifts: 0 }
  }
  for (const a of assignments) {
    const t = taskById.get(a.task_id)
    const stat = map[a.soldier_id]
    if (!t || !stat) continue
    const h = taskDurationHours(t.start_datetime, t.end_datetime)
    if (h <= 0) continue
    stat.total += h
    stat.byType[t.task_type] = (stat.byType[t.task_type] ?? 0) + h
    stat.shifts += 1
  }
  return Object.values(map)
    .filter(s => s.total > 0)
    .map(s => ({ ...s, total: Math.round(s.total) }))
    .sort((a, b) => b.total - a.total)
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

function makeNumberQuestion(q: string, emoji: string, answer: number): Question {
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
  const options = shuffle(opts).map(n => `${n} שעות`)
  return { q, emoji, options, correct: options.indexOf(`${answer} שעות`) }
}

interface QuizExtras {
  homeDays: Record<string, number>
  partners: Record<string, Array<{ id: string; count: number }>>
  nameById: Record<string, string>
}

const QUIZ_LENGTH = 8

function buildQuiz(stats: SoldierStat[], extras: QuizExtras): Question[] {
  const allNames = stats.map(s => s.name)
  if (stats.length < 4) return []
  const { homeDays, partners, nameById } = extras

  // Buckets keep categories separated so we can guarantee variety in the final mix.
  const typeQs: Question[] = []
  const homeQs: Question[] = []
  const partnerQs: Question[] = []
  const classicQs: Question[] = []

  // ── Task-type questions (superlative + binary "A or B") ──
  const typeTotals: Record<string, number> = {}
  for (const s of stats) for (const [t, h] of Object.entries(s.byType)) typeTotals[t] = (typeTotals[t] ?? 0) + h
  const topTypes = Object.entries(typeTotals).sort((a, b) => b[1] - a[1]).map(([t]) => t)
  for (const type of topTypes.slice(0, 6)) {
    const ranked = [...stats].filter(s => (s.byType[type] ?? 0) > 0).sort((a, b) => (b.byType[type] ?? 0) - (a.byType[type] ?? 0))
    if (ranked.length >= 1) {
      const sup = makeWhoQuestion(`מי עשה הכי הרבה שעות "${type}"?`, '🎯', ranked[0].name, allNames)
      if (sup) typeQs.push(sup)
    }
    if (ranked.length >= 2 && (ranked[0].byType[type] ?? 0) !== (ranked[1].byType[type] ?? 0)) {
      typeQs.push(makeBinaryQuestion(`מי עשה יותר "${type}"?`, '⚔️', ranked[0].name, ranked[1].name, ranked[0].name))
    }
  }

  // ── Home days (excluding split-position soldiers — they were ~50% by design) ──
  const homeRanked = stats
    .filter(s => !isSplitSoldier(s.name) && (homeDays[s.id] ?? 0) > 0)
    .sort((a, b) => (homeDays[b.id] ?? 0) - (homeDays[a.id] ?? 0))
  const nonSplitNames = stats.filter(s => !isSplitSoldier(s.name)).map(s => s.name)
  if (homeRanked.length >= 4) {
    const sup = makeWhoQuestion('מי היה הכי הרבה ימים בבית? 🏠', '🏠', homeRanked[0].name, nonSplitNames)
    if (sup) homeQs.push(sup)
    // binary between two clearly-different soldiers
    const a = homeRanked[0], b = homeRanked[Math.min(3, homeRanked.length - 1)]
    if ((homeDays[a.id] ?? 0) !== (homeDays[b.id] ?? 0)) {
      homeQs.push(makeBinaryQuestion('מי היה יותר ימים בבית?', '🏠', a.name, b.name, a.name))
    }
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

  // ── Classic questions ──
  const c1 = makeWhoQuestion('מי צבר הכי הרבה שעות משימה בקו? 👑', '👑', stats[0].name, allNames)
  if (c1) classicQs.push(c1)
  const totalTeam = stats.reduce((s, x) => s + x.total, 0)
  classicQs.push(makeNumberQuestion('כמה שעות משימה צבר הצוות כולו בקו?', '⏱️', Math.round(totalTeam / 5) * 5))
  classicQs.push(makeNumberQuestion(`כמה שעות בסך הכל צבר ${stats[0].name}?`, '🔥', stats[0].total))
  const mostShifts = [...stats].sort((a, b) => b.shifts - a.shifts)[0]
  const cShifts = makeWhoQuestion('מי שובץ למספר המשמרות הגדול ביותר?', '📋', mostShifts.name, allNames)
  if (cShifts) classicQs.push(cShifts)
  const lowest = [...stats].filter(s => !isSplitSoldier(s.name)).pop()
  if (lowest) {
    const cLow = makeWhoQuestion('מי צבר הכי מעט שעות (מבין המלאים)? 😴', '😴', lowest.name, allNames)
    if (cLow) classicQs.push(cLow)
  }

  // ── Assemble: guarantee the categories the user asked for, then fill ──
  const final: Question[] = []
  const take = (arr: Question[], n: number) => final.push(...shuffle(arr).slice(0, n))
  take(typeQs, 3)      // task types — emphasized
  take(homeQs, 1)      // home days
  take(partnerQs, 2)   // who-with-whom
  take(classicQs, 2)
  // top up from whatever remains if any bucket was short
  const leftovers = shuffle([...typeQs, ...homeQs, ...partnerQs, ...classicQs]).filter(q => !final.includes(q))
  while (final.length < QUIZ_LENGTH && leftovers.length) final.push(leftovers.shift() as Question)

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
  const hours = useCountUp(stat.total, started, 1500)
  return (
    <div className="flex flex-col items-center" style={{ transitionDelay: `${rank * 150}ms` }}>
      <div className={`text-4xl sm:text-5xl mb-1 transition-all duration-700 ${started ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
        style={{ transitionDelay: `${600 + rank * 200}ms` }}>
        {MEDALS[rank]}
      </div>
      <div className="text-white font-bold text-sm sm:text-lg text-center mb-1 max-w-[110px] truncate">
        {stat.isCommander && <span className="text-yellow-300">★ </span>}{stat.name}
      </div>
      <div className="text-yellow-300 font-extrabold text-lg sm:text-2xl mb-2 tabular-nums">{Math.round(hours)}<span className="text-xs">ש׳</span></div>
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
  const hours = useCountUp(stat.total, started, 1200)
  const pct = max > 0 ? (stat.total / max) * 100 : 0
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
      <span className="text-purple-200 font-bold text-sm w-14 text-left tabular-nums">{Math.round(hours)}ש׳</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
type Stage = 'intro' | 'board' | 'quiz' | 'results'

export default function LeaderboardShow() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  useEffect(() => onAuthStateChanged(auth, u => { if (!u) router.replace('/admin/login'); else setAuthed(true) }), [router])

  const soldiers = useSoldiers(false)
  const finalLeave = useFinalLeave()
  const { allTasks, allAssignments } = useAllSchedulesTotals()

  const stats = useMemo(() => buildStats(soldiers, allTasks, allAssignments), [soldiers, allTasks, allAssignments])
  const quizExtras = useMemo<QuizExtras>(() => ({
    homeDays: buildHomeDays(soldiers, finalLeave),
    partners: buildPartners(allAssignments),
    nameById: Object.fromEntries(soldiers.map(s => [s.id, s.full_name])),
  }), [soldiers, finalLeave, allAssignments])

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

  if (!authed) return null

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

      <Link href="/admin/justice" className="absolute top-4 right-4 z-20 text-white/60 hover:text-white text-sm bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition">
        ← חזרה לטבלת הצדק
      </Link>

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
            <p className="text-sm text-white/50 mb-10">{stats.length} לוחמים · {stats.reduce((s, x) => s + x.total, 0).toLocaleString()} שעות משימה</p>
            <button onClick={goBoard}
              className="text-xl font-bold bg-gradient-to-l from-amber-400 to-yellow-500 text-amber-950 rounded-2xl px-10 py-4 shadow-2xl hover:scale-105 active:scale-95 transition pulse-glow">
              ▶ התחל את ההצגה
            </button>
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {ready && stage === 'board' && (
          <div className="animate-fadeup">
            <h2 className="text-3xl sm:text-4xl font-black text-center mb-8 bg-clip-text text-transparent bg-gradient-to-l from-yellow-200 to-amber-400">
              🏆 לוח התורמים הגדולים
            </h2>

            <Podium top={stats.slice(0, 3)} started={boardStarted} />

            {stats.length > 3 && (
              <div className="bg-white/5 backdrop-blur rounded-2xl p-5 space-y-3 border border-white/10">
                {stats.slice(3, 12).map((s, i) => (
                  <BarRow key={s.id} stat={s} rank={i + 3} max={stats[0].total} started={boardStarted} />
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
              <Link href="/admin/justice"
                className="text-lg font-bold bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-2xl px-7 py-3.5 transition flex items-center">
                📊 לטבלה המלאה
              </Link>
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
