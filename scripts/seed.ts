// Run with: npx ts-node --project tsconfig.json scripts/seed.ts
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc, getDocs, deleteDoc, Timestamp } from 'firebase/firestore'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
})
const db = getFirestore(app)

async function clearCollection(name: string) {
  const snap = await getDocs(collection(db, name))
  for (const doc of snap.docs) await deleteDoc(doc.ref)
  console.log(`Cleared ${snap.docs.length} docs from ${name}`)
}

const commanders = new Set([
  'אוראל אפנזר', 'יהונתן בוצר', 'דביר משה',
  'אופיר אלטמן', 'רפאל אלקיים', 'עמיחי עוזיאל',
])

const soldierNotes: Record<string, string> = {
  'עמיחי עוזיאל': 'ראשון שני',
  'זיו צארום': 'שבוע-שבוע',
  'אמיתי ברמה': 'שלישי רביעי',
}

const soldiers = [
  'אוראל אפנזר', 'יהונתן בוצר', 'דביר משה', 'אופיר אלטמן',
  'רפאל אלקיים', 'עמיחי עוזיאל', 'זיו צארום', 'נתניאל לישה',
  'מאור לוי', 'עדן יהודה', 'חגי פייגנבום', 'אחיה בכרך',
  'אנדריי טיאן', 'עידן אלמו', 'לאון', 'מאור כליפה',
  'נתן לדקוב', 'ירין צור', 'יואב חדד', 'אילון אומן',
  'יגל משה', 'מיתר לזימי', 'אמיתי ברמה', 'טל סימקו',
].map(name => ({
  full_name: name,
  team: '',
  is_active: true,
  is_commander: commanders.has(name),
  notes: soldierNotes[name] ?? '',
  fixed_home_ranges: [],
}))

const taskTypes = [
  { name: 'פילבוקס', difficulty: 'hard', color: '#3b82f6', requires_commander: true, soldiers_required: 2, shift_duration_hours: 2, is_emphasized: false },
  { name: 'כיתת כוננות', difficulty: 'hard', color: '#ef4444', requires_commander: true, soldiers_required: 3, shift_duration_hours: 4, is_emphasized: false },
  { name: 'עמדה אחורית', difficulty: 'hard', color: '#f59e0b', requires_commander: false, soldiers_required: 1, shift_duration_hours: 4, is_emphasized: false },
  { name: 'של"ז', difficulty: 'easy', color: '#8b5cf6', requires_commander: false, soldiers_required: 1, shift_duration_hours: 4, is_emphasized: true },
  { name: 'מטבח', difficulty: 'easy', color: '#22c55e', requires_commander: false, soldiers_required: 2, shift_duration_hours: 8, is_emphasized: true },
  { name: 'רס"פ', difficulty: 'easy', color: '#06b6d4', requires_commander: false, soldiers_required: 1, shift_duration_hours: 8, is_emphasized: true },
]

const scheduleData = {
  name: 'שבצ"ק עוף — 26/4-1/5',
  start_datetime: new Date('2026-04-26T06:00:00'),
  end_datetime: new Date('2026-05-01T14:00:00'),
  status: 'published',
  created_by: 'seed',
}

const easyTypes = new Set(['מטבח', 'רס"פ', 'של"ז'])

const tasks: { name: string; type: string; start: string; end: string; count: number; assignees: string[] }[] = [
  // חווה 7 — ראשון 26/4
  { name: 'פילבוקס', type: 'פילבוקס', start: '2026-04-26T08:00:00', end: '2026-04-26T10:00:00', count: 1, assignees: ['אופיר אלטמן'] },
  { name: 'פילבוקס', type: 'פילבוקס', start: '2026-04-26T10:00:00', end: '2026-04-26T12:00:00', count: 1, assignees: ['אופיר אלטמן'] },
  { name: 'פילבוקס', type: 'פילבוקס', start: '2026-04-26T12:00:00', end: '2026-04-26T14:00:00', count: 1, assignees: ['זיו צארום'] },
  { name: 'פילבוקס', type: 'פילבוקס', start: '2026-04-26T14:00:00', end: '2026-04-26T16:00:00', count: 2, assignees: ['זיו צארום', 'אוראל אפנזר'] },
  { name: 'פילבוקס', type: 'פילבוקס', start: '2026-04-26T16:00:00', end: '2026-04-26T18:00:00', count: 2, assignees: ['זיו צארום', 'רפאל אלקיים'] },
  { name: 'פילבוקס', type: 'פילבוקס', start: '2026-04-26T18:00:00', end: '2026-04-26T20:00:00', count: 2, assignees: ['טל סימקו', 'מאור כליפה'] },
  { name: 'פילבוקס', type: 'פילבוקס', start: '2026-04-26T20:00:00', end: '2026-04-26T22:00:00', count: 2, assignees: ['טל סימקו', 'יגל משה'] },
  { name: 'פילבוקס', type: 'פילבוקס', start: '2026-04-26T22:00:00', end: '2026-04-27T00:00:00', count: 2, assignees: ['אופיר אלטמן', 'יהונתן בוצר'] },
  { name: 'פילבוקס', type: 'פילבוקס', start: '2026-04-27T00:00:00', end: '2026-04-27T02:00:00', count: 2, assignees: ['נתניאל לישה', 'חגי פייגנבום'] },
  { name: 'פילבוקס', type: 'פילבוקס', start: '2026-04-27T02:00:00', end: '2026-04-27T04:00:00', count: 2, assignees: ['מאור לוי', 'לאון'] },
  { name: 'פילבוקס', type: 'פילבוקס', start: '2026-04-27T04:00:00', end: '2026-04-27T06:00:00', count: 2, assignees: ['מאור לוי', 'אילון אומן'] },

  // מוצב אלון מורה — ראשון 26/4 ושני 27/4
  { name: 'עמדה אחורית', type: 'עמדה אחורית', start: '2026-04-26T11:00:00', end: '2026-04-26T15:00:00', count: 1, assignees: ['עמיחי עוזיאל'] },
  { name: 'של"ז', type: 'של"ז', start: '2026-04-26T07:00:00', end: '2026-04-26T11:00:00', count: 1, assignees: ['אחיה בכרך'] },
  { name: 'עמדה אחורית', type: 'עמדה אחורית', start: '2026-04-26T23:00:00', end: '2026-04-27T03:00:00', count: 1, assignees: ['עידן אלמו'] },
  { name: 'עמדה אחורית', type: 'עמדה אחורית', start: '2026-04-27T03:00:00', end: '2026-04-27T07:00:00', count: 1, assignees: ['ירין צור'] },
  { name: 'עמדה אחורית', type: 'עמדה אחורית', start: '2026-04-27T15:00:00', end: '2026-04-27T19:00:00', count: 1, assignees: ['עמיחי עוזיאל'] },
  { name: 'עמדה אחורית', type: 'עמדה אחורית', start: '2026-04-27T19:00:00', end: '2026-04-27T23:00:00', count: 1, assignees: ['אחיה בכרך'] },
]

const leaveRequests: { soldier: string; date: string }[] = [
  { soldier: 'דביר משה', date: '2026-04-26' },
  { soldier: 'נתן לדקוב', date: '2026-04-26' },
  { soldier: 'עדן יהודה', date: '2026-04-26' },
  { soldier: 'יואב חדד', date: '2026-04-26' },
  { soldier: 'אנדריי טיאן', date: '2026-04-26' },
  { soldier: 'מיתר לזימי', date: '2026-04-26' },
  { soldier: 'אמיתי ברמה', date: '2026-04-26' },
  { soldier: 'עדן יהודה', date: '2026-04-27' },
  { soldier: 'יואב חדד', date: '2026-04-27' },
  { soldier: 'אנדריי טיאן', date: '2026-04-27' },
  { soldier: 'ירין צור', date: '2026-04-27' },
  { soldier: 'עידן אלמו', date: '2026-04-27' },
  { soldier: 'מיתר לזימי', date: '2026-04-27' },
  { soldier: 'אמיתי ברמה', date: '2026-04-27' },
  { soldier: 'אוראל אפנזר', date: '2026-04-28' },
  { soldier: 'אופיר אלטמן', date: '2026-04-28' },
  { soldier: 'נתניאל לישה', date: '2026-04-28' },
  { soldier: 'מאור לוי', date: '2026-04-28' },
  { soldier: 'לאון', date: '2026-04-28' },
  { soldier: 'עמיחי עוזיאל', date: '2026-04-28' },
  { soldier: 'חגי פייגנבום', date: '2026-04-29' },
  { soldier: 'מאור כליפה', date: '2026-04-29' },
  { soldier: 'נתניאל לישה', date: '2026-04-29' },
  { soldier: 'מאור לוי', date: '2026-04-29' },
  { soldier: 'לאון', date: '2026-04-29' },
  { soldier: 'יגל משה', date: '2026-04-29' },
  { soldier: 'עידן אלמו', date: '2026-04-29' },
  { soldier: 'עמיחי עוזיאל', date: '2026-04-29' },
  { soldier: 'רפאל אלקיים', date: '2026-04-30' },
  { soldier: 'חגי פייגנבום', date: '2026-04-30' },
  { soldier: 'מאור כליפה', date: '2026-04-30' },
  { soldier: 'אחיה בכרך', date: '2026-04-30' },
  { soldier: 'עמיחי עוזיאל', date: '2026-04-30' },
  { soldier: 'עדן יהודה', date: '2026-04-30' },
  { soldier: 'אמיתי ברמה', date: '2026-04-30' },
  { soldier: 'זיו צארום', date: '2026-05-01' },
  { soldier: 'רפאל אלקיים', date: '2026-05-01' },
  { soldier: 'דביר משה', date: '2026-05-01' },
  { soldier: 'אחיה בכרך', date: '2026-05-01' },
  { soldier: 'יגל משה', date: '2026-05-01' },
  { soldier: 'עמיחי עוזיאל', date: '2026-05-01' },
  { soldier: 'אמיתי ברמה', date: '2026-05-01' },
]

async function seed() {
  // 1. Clear all collections
  await clearCollection('soldiers')
  await clearCollection('task_types')
  await clearCollection('schedules')
  await clearCollection('tasks')
  await clearCollection('assignments')
  await clearCollection('leave_requests')

  // 2. Create soldiers (store name→id map)
  const soldierIdMap: Record<string, string> = {}
  for (const s of soldiers) {
    const ref = await addDoc(collection(db, 'soldiers'), s)
    soldierIdMap[s.full_name] = ref.id
  }
  console.log(`Created ${soldiers.length} soldiers`)

  // 3. Create task types
  for (const t of taskTypes) await addDoc(collection(db, 'task_types'), t)
  console.log(`Created ${taskTypes.length} task types`)

  // 4. Create schedule
  const scheduleRef = await addDoc(collection(db, 'schedules'), {
    ...scheduleData,
    start_datetime: Timestamp.fromDate(scheduleData.start_datetime),
    end_datetime: Timestamp.fromDate(scheduleData.end_datetime),
  })
  const scheduleId = scheduleRef.id
  console.log('Created schedule:', scheduleId)

  // 5. Create tasks and assignments
  let taskCount = 0
  let assignmentCount = 0
  for (const t of tasks) {
    const taskRef = await addDoc(collection(db, 'tasks'), {
      schedule_id: scheduleId,
      task_name: t.name,
      task_type: t.type,
      difficulty: easyTypes.has(t.type) ? 'easy' : 'hard',
      start_datetime: Timestamp.fromDate(new Date(t.start)),
      end_datetime: Timestamp.fromDate(new Date(t.end)),
      required_people_count: t.count,
    })
    taskCount++
    for (const soldierName of t.assignees) {
      const soldierId = soldierIdMap[soldierName]
      if (soldierId) {
        await addDoc(collection(db, 'assignments'), {
          task_id: taskRef.id,
          soldier_id: soldierId,
        })
        assignmentCount++
      } else {
        console.warn(`Soldier not found: ${soldierName}`)
      }
    }
  }
  console.log(`Created ${taskCount} tasks and ${assignmentCount} assignments`)

  // 6. Create leave requests
  let leaveCount = 0
  for (const lr of leaveRequests) {
    const soldierId = soldierIdMap[lr.soldier]
    if (!soldierId) {
      console.warn(`Leave: soldier not found: ${lr.soldier}`)
      continue
    }
    await addDoc(collection(db, 'leave_requests'), {
      soldier_id: soldierId,
      date: lr.date,
      status: 'approved',
      is_final: true,
      created_at: Timestamp.now(),
    })
    leaveCount++
  }
  console.log(`Created ${leaveCount} leave requests`)

  console.log('Seed complete')
  process.exit(0)
}

seed().catch(e => { console.error(e); process.exit(1) })
