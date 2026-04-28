/**
 * Seed script: populates Firestore with week-1 schedule data
 * Run: node scripts/seed-week1.mjs
 */
import { initializeApp } from 'firebase/app'
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc, writeBatch, Timestamp, query, where
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

function ts(dateStr, hour, min = 0) {
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

async function clearBySchedule(scheduleId) {
  // Clear tasks belonging to this schedule
  const taskSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', scheduleId)))
  if (!taskSnap.empty) {
    const taskIds = taskSnap.docs.map(d => d.id)
    // Clear assignments for those tasks
    const chunks = []
    for (let i = 0; i < taskIds.length; i += 30) chunks.push(taskIds.slice(i, i + 30))
    for (const chunk of chunks) {
      const aSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', 'in', chunk)))
      if (!aSnap.empty) {
        const b = writeBatch(db)
        aSnap.docs.forEach(d => b.delete(d.ref))
        await b.commit()
      }
    }
    const b = writeBatch(db)
    taskSnap.docs.forEach(d => b.delete(d.ref))
    await b.commit()
    console.log(`  cleared ${taskSnap.size} tasks`)
  }
}

// ── מצבה (roster order) ──────────────────────────────────────────────────────
// is_commander = leads shifts as first-listed in כ"כ
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
  { full_name: 'אמיתי ברמה',    team: 'ב', is_active: true, is_commander: false, notes: '' },
  { full_name: 'טל סימקו',       team: 'א', is_active: true, is_commander: false, notes: '' },
]

const KK_A = 'כ"כ א'
const KK_B = 'כ"כ ב'
const SHG  = 'ש"ג'
const ACHR = 'אחורית'
const SHLZ = 'של"ז'

// Fixed durations per type
const DURATION = { [KK_A]: 12, [KK_B]: 12, [SHG]: 4, [ACHR]: 4, [SHLZ]: 8 }

// soldiers[0] = task commander (bold). End time derived from fixed duration.
function task(date, startH, type, soldiers, requiresCommander = false) {
  const dur = DURATION[type]
  const endH = (startH + dur) % 24
  return { date, startH, endH, type, soldiers, requiresCommander, requiredPeople: soldiers.length }
}

const TASKS = [
  // ── שלישי 28.4.26 ─────────────────────────────────────────────────────────
  task('2026-04-28',  8, SHLZ, ['חגי פייגנבום']),                                          // 08–16
  task('2026-04-28', 11, SHG,  ['עדן יהודה']),                                              // 11–15
  task('2026-04-28', 14, KK_A, ['דביר משה','עידן אלמו','אמיתי ברמה','יואב חדד','אנדריי טיאן'], true),   // 14–02
  task('2026-04-28', 14, KK_B, ['רפאל אלקיים','יגל משה','טל סימקו','אחיה בכרך','נתן לדקוב'], true),     // 14–02
  task('2026-04-28', 23, ACHR, ['יהונתן בוצר']),                                            // 23–03

  // ── רביעי 29.4.26 ─────────────────────────────────────────────────────────
  task('2026-04-29',  2, KK_A, ['רפאל אלקיים','ירין צור','טל סימקו','אחיה בכרך','נתן לדקוב'], true),    // 02–14
  task('2026-04-29',  2, KK_B, ['דביר משה','עידן אלמו','אמיתי ברמה','יואב חדד','אנדריי טיאן'], true),   // 02–14
  task('2026-04-29',  3, SHG,  ['עדן יהודה']),                                              // 03–07
  task('2026-04-29', 14, KK_A, ['דביר משה','מיתר לזימי','עידן אלמו','יואב חדד','זיו צארום'], true),      // 14–02
  task('2026-04-29', 14, KK_B, ['רפאל אלקיים','ירין צור','טל סימקו','עדן יהודה','נתן לדקוב'], true),    // 14–02

  // ── חמישי 30.4.26 ─────────────────────────────────────────────────────────
  task('2026-04-30',  2, KK_A, ['אוראל אפנזר','ירין צור','טל סימקו','אנדריי טיאן','נתן לדקוב'], true),  // 02–14
  task('2026-04-30',  2, KK_B, ['אופיר אלטמן','זיו צארום','מיתר לזימי','יואב חדד','עידן אלמו'], true),  // 02–14
  task('2026-04-30',  3, SHG,  ['עדן יהודה']),                                              // 03–07
  task('2026-04-30', 11, SHG,  ['מאור לוי']),                                               // 11–15
  task('2026-04-30', 14, KK_A, ['אופיר אלטמן','זיו צארום','מיתר לזימי','יואב חדד','נתניאל לישה'], true),// 14–02
  task('2026-04-30', 14, KK_B, ['אוראל אפנזר','ירין צור','טל סימקו','לאון','מאור לוי'], true),          // 14–02

  // ── שישי 1.5.26 ──────────────────────────────────────────────────────────
  task('2026-05-01',  2, KK_A, ['אוראל אפנזר','ירין צור','טל סימקו','לאון','מאור לוי'], true),          // 02–14
  task('2026-05-01',  2, KK_B, ['נתניאל לישה','מיתר לזימי','יואב חדד','זיו צארום','אופיר אלטמן'], true),// 02–14
  task('2026-05-01',  3, SHG,  ['אנדריי טיאן']),                                            // 03–07
  task('2026-05-01',  7, SHG,  ['נתן לדקוב']),                                              // 07–11
  task('2026-05-01', 14, KK_A, ['דביר משה','נתניאל לישה','מיתר לזימי','יואב חדד','עידן אלמו'], true),   // 14–02
  task('2026-05-01', 14, KK_B, ['יהונתן בוצר','ירין צור','טל סימקו','מאור כליפה','חגי פייגנבום'], true),// 14–02
  task('2026-05-01', 23, SHG,  ['לאון']),                                                    // 23–03

  // ── שבת 2.5.26 ───────────────────────────────────────────────────────────
  task('2026-05-02',  2, KK_A, ['יהונתן בוצר','נתן לדקוב','אנדריי טיאן','מאור כליפה','חגי פייגנבום'], true), // 02–14
  task('2026-05-02',  2, KK_B, ['דביר משה','עידן אלמו','טל סימקו','מיתר לזימי','יואב חדד'], true),           // 02–14
  task('2026-05-02', 14, KK_A, ['דביר משה','עידן אלמו','טל סימקו','מיתר לזימי','יואב חדד'], true),           // 14–02
  task('2026-05-02', 14, KK_B, ['יהונתן בוצר','נתן לדקוב','אנדריי טיאן','מאור כליפה','חגי פייגנבום'], true),// 14–02
  task('2026-05-02', 15, SHG,  ['לאון']),                                                    // 15–19
]

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Seeding שבצ"ק שבוע 1...\n')

  // 1. Soldiers — clear and recreate in מצבה order
  console.log('1. Resetting soldiers...')
  await clearCollection('soldiers')
  const soldierIdMap = {}
  for (const s of SOLDIERS) {
    const ref = await addDoc(collection(db, 'soldiers'), { ...s, fixed_home_ranges: [] })
    soldierIdMap[s.full_name] = ref.id
  }
  console.log(`  created ${SOLDIERS.length} soldiers`)

  // 2. Clear old week-1 schedules
  console.log('\n2. Clearing old schedules...')
  const oldSnap = await getDocs(collection(db, 'schedules'))
  for (const d of oldSnap.docs) {
    await clearBySchedule(d.id)
    await deleteDoc(d.ref)
  }
  console.log(`  cleared ${oldSnap.size} old schedules`)

  // 3. Create schedule
  console.log('\n3. Creating schedule...')
  const schedRef = await addDoc(collection(db, 'schedules'), {
    name: 'שבצ"ק שבוע 1 — 28.4–2.5.26',
    start_datetime: ts('2026-04-28', 14),
    end_datetime:   ts('2026-05-03',  2),
    status: 'published',
    created_by: 'seed',
  })
  console.log(`  id: ${schedRef.id}`)

  // 4. Tasks + Assignments (with order field)
  console.log('\n4. Creating tasks and assignments...')
  let taskCount = 0, assignCount = 0

  for (const t of TASKS) {
    const endDate = t.endH < t.startH ? nextDay(t.date) : t.date
    const taskRef = await addDoc(collection(db, 'tasks'), {
      schedule_id: schedRef.id,
      task_name: `${t.type} ${t.date}`,
      task_type: t.type,
      difficulty: t.type === KK_A || t.type === KK_B ? 'hard' : 'easy',
      start_datetime: ts(t.date, t.startH),
      end_datetime:   ts(endDate, t.endH),
      required_people_count: t.requiredPeople,
      requires_commander: t.requiresCommander,
      notes: '',
    })
    taskCount++

    for (let i = 0; i < t.soldiers.length; i++) {
      const sid = soldierIdMap[t.soldiers[i]]
      if (!sid) { console.warn(`  ⚠ not found: ${t.soldiers[i]}`); continue }
      await addDoc(collection(db, 'assignments'), {
        task_id: taskRef.id,
        soldier_id: sid,
        order: i,   // 0 = task commander (displayed bold)
      })
      assignCount++
    }
  }

  console.log(`  created ${taskCount} tasks, ${assignCount} assignments`)
  console.log('\n✅ Done!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
