// ─────────────────────────────────────────────────────────────────────────────
// Seed a SEPARATE Firebase project with fake demo data, so the FULL שבצ"ק app
// can run as a public demo without exposing any real (sensitive) data.
//
// USAGE:
//   1. Create a new Firebase project in the console (e.g. "shabtzak-demo").
//   2. Add a Web App, enable Firestore + Authentication (Email/Password).
//   3. Paste the web config into scripts/demo-firebase-config.json, e.g.:
//        { "apiKey": "...", "authDomain": "...", "projectId": "...",
//          "storageBucket": "...", "messagingSenderId": "...", "appId": "..." }
//   4. node scripts/seed-demo-project.mjs
//
// It creates the demo accounts + seeds soldiers, a full published schedule,
// task types, and leave requests. Safe to re-run (clears demo collections first).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth'
import {
  getFirestore, collection, addDoc, getDocs, writeBatch, doc, Timestamp, serverTimestamp,
} from 'firebase/firestore'

const __dirname = dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(readFileSync(join(__dirname, 'demo-firebase-config.json'), 'utf8'))

// Accounts the app expects (match src/components/AuthGate.tsx + src/pages/admin/login.tsx)
const ADMIN_EMAIL = 'demo@shivzuk.app'
const ADMIN_PASS = 'demo1234'
const VIEWER_EMAIL = 'viewer@shivzuk.app'
const VIEWER_PASS = 'shivzuk-demo'   // AuthGate uses prefix 'shivzuk-' + answer; answer = "demo"

const app = initializeApp(config)
const db = getFirestore(app)
const auth = getAuth(app)

function dayAt(offset, hour) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); d.setHours(hour); return d }
function iso(d) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') }

const SOLDIERS = [
  { full_name: 'יוסי המפקד', team: 'מפקדה', is_commander: true },
  { full_name: 'דנה סגן', team: 'מפקדה', is_commander: true },
  { full_name: 'אבי כהן', team: 'חוליה 1', is_commander: false },
  { full_name: 'רון לוי', team: 'חוליה 1', is_commander: false },
  { full_name: 'מאיה בר', team: 'חוליה 1', is_commander: false },
  { full_name: 'עידו שחר', team: 'חוליה 2', is_commander: false },
  { full_name: 'נועם גל', team: 'חוליה 2', is_commander: false },
  { full_name: 'תומר דהן', team: 'חוליה 2', is_commander: false },
  { full_name: 'ליאור ניר', team: 'חוליה 3', is_commander: false },
  { full_name: 'שי רום', team: 'חוליה 3', is_commander: false },
  { full_name: 'גיא אלון', team: 'חוליה 3', is_commander: false },
  { full_name: 'איתי פז', team: 'חוליה 1', is_commander: false },
]

const TASK_TYPES = [
  { name: 'סיור', difficulty: 'hard', color: '#3B6E52', requires_commander: true, soldiers_required: 2, shift_duration_hours: 8, is_emphasized: false },
  { name: 'כ"כ א', difficulty: 'hard', color: '#516B85', requires_commander: false, soldiers_required: 2, shift_duration_hours: 12, is_emphasized: false },
  { name: 'כ"כ ב', difficulty: 'hard', color: '#40787A', requires_commander: false, soldiers_required: 2, shift_duration_hours: 8, is_emphasized: false },
  { name: 'ש"ג', difficulty: 'easy', color: '#4A7A5E', requires_commander: false, soldiers_required: 1, shift_duration_hours: 8, is_emphasized: false },
  { name: 'כוננות', difficulty: 'easy', color: '#4A5E88', requires_commander: false, soldiers_required: 2, shift_duration_hours: 12, is_emphasized: false },
  { name: 'תורן מטבח', difficulty: 'easy', color: '#6B7A40', requires_commander: false, soldiers_required: 1, shift_duration_hours: 12, is_emphasized: true },
  { name: 'של"ז', difficulty: 'easy', color: '#635E88', requires_commander: false, soldiers_required: 1, shift_duration_hours: 8, is_emphasized: true },
]

async function clearCollection(name) {
  const snap = await getDocs(collection(db, name))
  while (snap.docs.length) {
    const batch = writeBatch(db)
    snap.docs.splice(0, 400).forEach(d => batch.delete(d.ref))
    await batch.commit()
    if (snap.docs.length === 0) break
  }
}

async function ensureUser(email, pass) {
  try { await createUserWithEmailAndPassword(auth, email, pass); console.log(`  created ${email}`) }
  catch (e) {
    if (String(e).includes('email-already-in-use')) console.log(`  ${email} already exists`)
    else throw e
  }
}

async function run() {
  console.log('Creating demo accounts…')
  await ensureUser(ADMIN_EMAIL, ADMIN_PASS)
  await ensureUser(VIEWER_EMAIL, VIEWER_PASS)
  await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASS)
  console.log('Authenticated as admin.')

  console.log('Clearing old demo data…')
  for (const c of ['soldiers', 'schedules', 'tasks', 'assignments', 'task_types', 'published_versions', 'leave_requests']) {
    await clearCollection(c)
  }

  console.log('Seeding task types…')
  for (const tt of TASK_TYPES) await addDoc(collection(db, 'task_types'), tt)

  console.log('Seeding soldiers…')
  const soldierIds = []
  for (const s of SOLDIERS) {
    const ref = await addDoc(collection(db, 'soldiers'), {
      ...s, is_active: true, notes: '', fixed_home_ranges: [],
    })
    soldierIds.push(ref.id)
  }

  console.log('Seeding schedule + tasks + assignments…')
  const schedRef = await addDoc(collection(db, 'schedules'), {
    name: 'שבצ"ק דמו — השבוע', start_datetime: Timestamp.fromDate(dayAt(0, 6)),
    end_datetime: Timestamp.fromDate(dayAt(5, 6)), status: 'published',
    created_by: 'demo', day_start_hour: 6, home_leave_hour: 14, updated_at: serverTimestamp(),
  })
  const schedId = schedRef.id

  const tasks = []
  const assigns = []
  const addTask = (type, off, s, e, count, cmd, who) => {
    tasks.push({
      _who: who, schedule_id: schedId, task_name: type, task_type: type, difficulty: 'hard',
      start_datetime: Timestamp.fromDate(dayAt(off, s)), end_datetime: Timestamp.fromDate(dayAt(off, e)),
      required_people_count: count, requires_commander: cmd,
    })
  }
  for (let d = 0; d < 5; d++) {
    addTask('ש"ג', d, 6, 14, 1, false, [soldierIds[(d + 2) % 12]])
    addTask('ש"ג', d, 14, 22, 1, false, [soldierIds[(d + 3) % 12]])
    addTask('סיור', d, 8, 16, 2, true, [soldierIds[(d) % 2], soldierIds[5 + (d % 5)]])
    addTask('כ"כ א', d, 6, 18, 2, false, [soldierIds[(d + 6) % 12], soldierIds[(d + 7) % 12]])
    addTask('תורן מטבח', d, 6, 18, 1, false, [soldierIds[(d + 8) % 12]])
    if (d % 2 === 0) addTask('כוננות', d, 18, 24, 2, false, [soldierIds[(d + 9) % 12], soldierIds[(d + 10) % 12]])
  }
  const taskDocs = []
  for (const t of tasks) {
    const { _who, ...data } = t
    const ref = await addDoc(collection(db, 'tasks'), data)
    _who.forEach((sid, i) => assigns.push({ task_id: ref.id, soldier_id: sid, order: i }))
    taskDocs.push({ id: ref.id, ...data })
  }
  for (const a of assigns) await addDoc(collection(db, 'assignments'), a)

  console.log('Creating published snapshot (for the soldier view)…')
  await addDoc(collection(db, 'published_versions'), {
    schedule_id: schedId, schedule_name: 'שבצ"ק דמו — השבוע',
    schedule_start: Timestamp.fromDate(dayAt(0, 6)), schedule_end: Timestamp.fromDate(dayAt(5, 6)),
    day_start_hour: 6, home_leave_hour: 14,
    tasks: taskDocs.map(t => ({
      id: t.id, task_type: t.task_type, task_name: t.task_name,
      start_datetime: t.start_datetime, end_datetime: t.end_datetime,
      requires_commander: t.requires_commander, required_people_count: t.required_people_count, notes: '',
    })),
    assignments: assigns.map((a, i) => ({ id: 'a' + i, task_id: a.task_id, soldier_id: a.soldier_id, order: a.order })),
    published_at: serverTimestamp(), published_by: 'demo',
  })

  console.log('Seeding some approved leave…')
  for (let i = 0; i < 6; i++) {
    await addDoc(collection(db, 'leave_requests'), {
      soldier_id: soldierIds[i], date: iso(dayAt(2 + (i % 3), 0)),
      status: 'approved', is_final: true, created_at: serverTimestamp(),
    })
  }

  console.log('\n✅ Done. Demo project seeded.')
  console.log(`   Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASS}`)
  console.log(`   Viewer (soldier interface): answer "demo" to the MP-name question`)
  process.exit(0)
}
run().catch(e => { console.error(e); process.exit(1) })
