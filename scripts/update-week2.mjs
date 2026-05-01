import { initializeApp } from 'firebase/app'
import { getFirestore, getDocs, query, collection, where, deleteDoc, doc, addDoc, updateDoc, Timestamp } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'

// IL = UTC+3: IL hour → UTC = IL - 3
// May 3 (Sunday): 06:00 IL = 03:00 UTC, 14:00 IL = 11:00 UTC, 22:00 IL = 19:00 UTC
// May 4 (Monday): 06:00 IL = 03:00 UTC, 14:00 IL = 11:00 UTC, 22:00 IL = 19:00 UTC

const T = (iso) => Timestamp.fromDate(new Date(iso))

// Desired schedule
const NEW_TASKS = [
  // Sunday 06:00-14:00: מחלקה 3 for both
  { type: 'סיור',   start: '2026-05-03T03:00:00Z', end: '2026-05-03T11:00:00Z', notes: 'מחלקה 3', soldiers: [] },
  { type: 'כ"כ א', start: '2026-05-03T03:00:00Z', end: '2026-05-03T11:00:00Z', notes: 'מחלקה 3', soldiers: [] },
  // Sunday 14:00-22:00
  { type: 'סיור',   start: '2026-05-03T11:00:00Z', end: '2026-05-03T19:00:00Z', notes: '', soldiers: ['דביר משה', 'זיו צארום', 'עידן אלמו'], commanderName: 'דביר משה' },
  { type: 'כ"כ א', start: '2026-05-03T11:00:00Z', end: '2026-05-03T19:00:00Z', notes: '', soldiers: ['אחיה בכרך', 'אנדריי טיאן', 'עדן יהודה'] },
  // Sunday 22:00 - Monday 06:00
  { type: 'סיור',   start: '2026-05-03T19:00:00Z', end: '2026-05-04T03:00:00Z', notes: 'מחלקה 3', soldiers: [] },
  { type: 'כ"כ א', start: '2026-05-03T19:00:00Z', end: '2026-05-04T03:00:00Z', notes: '', soldiers: ['דביר משה', 'זיו צארום', 'עידן אלמו'], commanderName: 'דביר משה' },
  // Monday 06:00-14:00
  { type: 'סיור',   start: '2026-05-04T03:00:00Z', end: '2026-05-04T11:00:00Z', notes: '', soldiers: ['נתניאל לישה', 'עמיחי עוזיאל', 'עדן יהודה'], commanderName: 'נתניאל לישה' },
  { type: 'כ"כ א', start: '2026-05-04T03:00:00Z', end: '2026-05-04T11:00:00Z', notes: '', soldiers: ['אחיה בכרך', 'יואב חדד', 'זיו צארום'] },
  // Monday 14:00-22:00
  { type: 'סיור',   start: '2026-05-04T11:00:00Z', end: '2026-05-04T19:00:00Z', notes: 'מחלקה 3', soldiers: [] },
  { type: 'כ"כ א', start: '2026-05-04T11:00:00Z', end: '2026-05-04T19:00:00Z', notes: '', soldiers: ['נתניאל לישה', 'עמיחי עוזיאל', 'עדן יהודה'], commanderName: 'נתניאל לישה' },
]

async function main() {
  // Build soldier name→id map
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const nameToId = {}
  for (const s of soldiersSnap.docs) nameToId[s.data().full_name] = s.id
  console.log('Soldiers loaded:', Object.keys(nameToId).length)

  // Delete ALL existing tasks + assignments for שבוע 2
  const existingTasks = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', WEEK2_ID)))
  for (const t of existingTasks.docs) {
    const assignSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', t.id)))
    for (const a of assignSnap.docs) await deleteDoc(doc(db, 'assignments', a.id))
    await deleteDoc(doc(db, 'tasks', t.id))
    console.log(`Deleted task ${t.id} (${t.data().task_type})`)
  }

  // Update schedule start_datetime to Sunday 06:00 IL = 03:00 UTC
  await updateDoc(doc(db, 'schedules', WEEK2_ID), {
    start_datetime: T('2026-05-03T03:00:00Z'),
    end_datetime:   T('2026-05-04T19:00:00Z'),
    updated_at: Timestamp.now(),
  })
  console.log('Updated schedule dates: 06:00 IL Sun → 22:00 IL Mon')

  // Create new tasks + assignments
  for (const task of NEW_TASKS) {
    const taskRef = await addDoc(collection(db, 'tasks'), {
      schedule_id: WEEK2_ID,
      task_type: task.type,
      task_name: task.type,
      start_datetime: T(task.start),
      end_datetime: T(task.end),
      notes: task.notes,
      difficulty: 'normal',
      required_people_count: task.soldiers.length || 3,
      requires_commander: false,
    })
    console.log(`Created ${task.type} ${task.start.slice(11,16)}→${task.end.slice(11,16)} ${task.notes || ''}`)

    // Add assignments
    for (let i = 0; i < task.soldiers.length; i++) {
      const name = task.soldiers[i]
      const sid = nameToId[name]
      if (!sid) { console.log(`  WARNING: not found: ${name}`); continue }
      const isCommander = name === task.commanderName
      await addDoc(collection(db, 'assignments'), {
        task_id: taskRef.id,
        soldier_id: sid,
        order: isCommander ? 0 : i + 1,
      })
      console.log(`  + ${name}${isCommander ? '★' : ''} (order=${isCommander ? 0 : i+1})`)
    }
  }

  console.log('\nשבוע 2 updated!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
