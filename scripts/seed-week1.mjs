/**
 * Seed script: populates Firestore with week-1 schedule data
 * Run: node scripts/seed-week1.mjs
 */
import { initializeApp } from 'firebase/app'
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc, doc, writeBatch, Timestamp
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw',
  authDomain: 'shabtzak-app.firebaseapp.com',
  projectId: 'shabtzak-app',
  storageBucket: 'shabtzak-app.firebasestorage.app',
  messagingSenderId: '207869926707',
  appId: '1:207869926707:web:544e65feac1c4a4a1e7246',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

// ── Helpers ──────────────────────────────────────────────────────────────────

function ts(dateStr, hour, min = 0) {
  // dateStr = 'YYYY-MM-DD', returns Timestamp at that time (local Israel ≈ UTC+3)
  const d = new Date(`${dateStr}T${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}:00+03:00`)
  return Timestamp.fromDate(d)
}

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

async function clearCollection(colName) {
  const snap = await getDocs(collection(db, colName))
  if (snap.empty) return
  const batch = writeBatch(db)
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
  console.log(`  cleared ${snap.size} docs from ${colName}`)
}

// ── Data ──────────────────────────────────────────────────────────────────────

// מצבה order — commanders flagged based on who leads shifts in שבצ"ק שבוע 1
const SOLDIERS = [
  { full_name: 'אוראל אפנזר',   team: 'א', is_active: true, is_commander: true,  notes: '' },
  { full_name: 'יהונתן בוצר',   team: 'א', is_active: true, is_commander: true,  notes: '' },
  { full_name: 'דביר משה',       team: 'א', is_active: true, is_commander: true,  notes: '' },
  { full_name: 'אופיר אלטמן',   team: 'ב', is_active: true, is_commander: true,  notes: '' },
  { full_name: 'רפאל אלקיים',   team: 'ב', is_active: true, is_commander: true,  notes: '' },
  { full_name: 'עמיחי עוזיאל',  team: 'א', is_active: true, is_commander: false, notes: 'ראשון שני' },
  { full_name: 'זיו צארום',      team: 'ב', is_active: true, is_commander: false, notes: 'שבוע-שבוע' },
  { full_name: 'נתניאל לישה',   team: 'ב', is_active: true, is_commander: true,  notes: '' },
  { full_name: 'מאור לוי',       team: 'א', is_active: true, is_commander: false, notes: '' },
  { full_name: 'עדן יהודה',      team: 'א', is_active: true, is_commander: false, notes: '' },
  { full_name: 'חגי פייגנבום',  team: 'ב', is_active: true, is_commander: false, notes: '' },
  { full_name: 'אחיה בכרך',     team: 'א', is_active: true, is_commander: false, notes: '' },
  { full_name: 'אנדריי טיאן',   team: 'ב', is_active: true, is_commander: false, notes: '' },
  { full_name: 'עידן אלמו',      team: 'א', is_active: true, is_commander: false, notes: '' },
  { full_name: 'לאון',           team: 'ב', is_active: true, is_commander: false, notes: '' },
  { full_name: 'מאור כליפה',    team: 'א', is_active: true, is_commander: false, notes: '' },
  { full_name: 'נתן לדקוב',     team: 'ב', is_active: true, is_commander: false, notes: '' },
  { full_name: 'ירין צור',       team: 'א', is_active: true, is_commander: false, notes: '' },
  { full_name: 'יואב חדד',       team: 'ב', is_active: true, is_commander: false, notes: '' },
  { full_name: 'אילון אומן',     team: 'א', is_active: true, is_commander: false, notes: '' },
  { full_name: 'יגל משה',        team: 'ב', is_active: true, is_commander: false, notes: '' },
  { full_name: 'מיתר לזימי',    team: 'א', is_active: true, is_commander: false, notes: '' },
  { full_name: 'אמיתי ברמה',    team: 'ב', is_active: true, is_commander: false, notes: 'שלישי רביעי' },
  { full_name: 'טל סימקו',       team: 'א', is_active: true, is_commander: false, notes: '' },
]

// כ"כ = כוח כוננות, 12h shifts. ש"ג = שמירה, 4h. אחורית 4h. של"ז ~6h.
// Format: { date, startH, endH (next day if < startH), type, soldiers[] }
const KK_A = 'כ"כ א (חווה 7)'
const KK_B = 'כ"כ ב (חווה 7)'
const SHG  = 'ש"ג'
const ACHR = 'אחורית'
const SHLZ = 'של"ז'

// Helper: endDate = same day unless endH < startH (crosses midnight)
function taskDef(date, startH, endH, type, soldiers, requiresCommander = false, requiredPeople = null) {
  const endDate = endH <= startH ? nextDay(date) : date
  return { date, startH, endH, endDate, type, soldiers, requiresCommander, requiredPeople: requiredPeople ?? soldiers.length }
}

const TASKS = [
  // ── יום שלישי 28.4.26 ────────────────────────────────────────────────────
  taskDef('2026-04-28',  8, 14, SHLZ,  ['חגי פייגנבום']),
  taskDef('2026-04-28', 11, 14, SHG,   ['עדן יהודה']),
  taskDef('2026-04-28', 14,  2, KK_A,  ['דביר משה','עידן אלמו','אמיתי ברמה','יואב חדד','אנדריי טיאן'], true, 5),
  taskDef('2026-04-28', 14,  2, KK_B,  ['רפאל אלקיים','יגל משה','טל סימקו','אחיה בכרך','נתן לדקוב'], true, 5),
  taskDef('2026-04-28', 23,  3, ACHR,  ['יהונתן בוצר']),

  // ── יום רביעי 29.4.26 ────────────────────────────────────────────────────
  taskDef('2026-04-29',  2, 14, KK_A,  ['רפאל אלקיים','ירין צור','טל סימקו','אחיה בכרך','נתן לדקוב'], true, 5),
  taskDef('2026-04-29',  2, 14, KK_B,  ['דביר משה','עידן אלמו','אמיתי ברמה','יואב חדד','אנדריי טיאן'], true, 5),
  taskDef('2026-04-29',  3,  7, SHG,   ['עדן יהודה']),
  taskDef('2026-04-29', 14,  2, KK_A,  ['דביר משה','מיתר לזימי','עידן אלמו','יואב חדד','זיו צארום'], true, 5),
  taskDef('2026-04-29', 14,  2, KK_B,  ['רפאל אלקיים','ירין צור','טל סימקו','עדן יהודה','נתן לדקוב'], true, 5),

  // ── יום חמישי 30.4.26 ────────────────────────────────────────────────────
  taskDef('2026-04-30',  2, 14, KK_A,  ['אוראל אפנזר','ירין צור','טל סימקו','אנדריי טיאן','נתן לדקוב'], true, 5),
  taskDef('2026-04-30',  2, 10, KK_B,  ['אופיר אלטמן','זיו צארום','מיתר לזימי','יואב חדד','עידן אלמו'], true, 5),
  taskDef('2026-04-30',  3,  7, SHG,   ['עדן יהודה']),
  taskDef('2026-04-30', 11, 15, SHG,   ['מאור לוי']),
  taskDef('2026-04-30', 14,  2, KK_A,  ['אופיר אלטמן','זיו צארום','מיתר לזימי','יואב חדד','נתניאל לישה'], true, 5),
  taskDef('2026-04-30', 15,  2, KK_B,  ['אוראל אפנזר','ירין צור','טל סימקו','לאון','מאור לוי'], true, 5),

  // ── יום שישי 1.5.26 ──────────────────────────────────────────────────────
  taskDef('2026-05-01',  2, 14, KK_A,  ['אוראל אפנזר','ירין צור','טל סימקו','לאון','מאור לוי'], true, 5),
  taskDef('2026-05-01',  2, 10, KK_B,  ['נתניאל לישה','מיתר לזימי','יואב חדד','זיו צארום','אופיר אלטמן'], true, 5),
  taskDef('2026-05-01',  3,  7, SHG,   ['אנדריי טיאן']),
  taskDef('2026-05-01',  7, 11, SHG,   ['נתן לדקוב']),
  taskDef('2026-05-01', 14,  2, KK_A,  ['דביר משה','נתניאל לישה','מיתר לזימי','יואב חדד','עידן אלמו'], true, 5),
  taskDef('2026-05-01', 14,  2, KK_B,  ['יהונתן בוצר','ירין צור','טל סימקו','מאור כליפה','חגי פייגנבום'], true, 5),
  taskDef('2026-05-01', 23,  3, SHG,   ['לאון']),

  // ── שבת 2.5.26 ───────────────────────────────────────────────────────────
  taskDef('2026-05-02',  2, 14, KK_A,  ['יהונתן בוצר','נתן לדקוב','אנדריי טיאן','מאור כליפה','חגי פייגנבום'], true, 5),
  taskDef('2026-05-02',  2, 14, KK_B,  ['דביר משה','עידן אלמו','טל סימקו','מיתר לזימי','יואב חדד'], true, 5),
  taskDef('2026-05-02', 14,  2, KK_A,  ['דביר משה','עידן אלמו','טל סימקו','מיתר לזימי','יואב חדד'], true, 5),
  taskDef('2026-05-02', 14,  2, KK_B,  ['יהונתן בוצר','נתן לדקוב','אנדריי טיאן','מאור כליפה','חגי פייגנבום'], true, 5),
  taskDef('2026-05-02', 15, 19, SHG,   ['לאון']),
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Seeding Firestore for שבצ"ק שבוע 1...\n')

  // 1. Soldiers
  console.log('1. Clearing and re-creating soldiers...')
  await clearCollection('soldiers')
  const soldierIdMap = {}
  for (const s of SOLDIERS) {
    const ref = await addDoc(collection(db, 'soldiers'), {
      ...s,
      fixed_home_ranges: [],
    })
    soldierIdMap[s.full_name] = ref.id
  }
  console.log(`  created ${SOLDIERS.length} soldiers`)

  // 2. Schedule
  console.log('\n2. Creating schedule document...')
  const schedRef = await addDoc(collection(db, 'schedules'), {
    name: 'שבצ"ק שבוע 1 — 28.4–2.5.26',
    start_datetime: ts('2026-04-28', 14),
    end_datetime:   ts('2026-05-03',  2),
    status: 'published',
    created_by: 'seed',
  })
  const scheduleId = schedRef.id
  console.log(`  schedule id: ${scheduleId}`)

  // 3. Tasks + Assignments
  console.log('\n3. Creating tasks and assignments...')
  let taskCount = 0
  let assignCount = 0

  for (const t of TASKS) {
    const startTs = ts(t.date, t.startH)
    const endDate = t.endH < t.startH ? nextDay(t.date) : t.date
    const endTs   = ts(endDate, t.endH)

    const taskRef = await addDoc(collection(db, 'tasks'), {
      schedule_id: scheduleId,
      task_name: `${t.type} ${t.date}`,
      task_type: t.type,
      difficulty: t.type === KK_A || t.type === KK_B ? 'hard' : 'easy',
      start_datetime: startTs,
      end_datetime:   endTs,
      required_people_count: t.requiredPeople,
      requires_commander: t.requiresCommander,
      notes: '',
    })
    taskCount++

    for (const name of t.soldiers) {
      const sid = soldierIdMap[name]
      if (!sid) { console.warn(`  ⚠ soldier not found: ${name}`); continue }
      await addDoc(collection(db, 'assignments'), {
        task_id: taskRef.id,
        soldier_id: sid,
      })
      assignCount++
    }
  }

  console.log(`  created ${taskCount} tasks, ${assignCount} assignments`)
  console.log('\n✅ Done!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
