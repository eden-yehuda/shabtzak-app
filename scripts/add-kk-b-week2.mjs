import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'
const T = iso => Timestamp.fromDate(new Date(iso))

// כ"כ ב for all slots — מחלקה 3
const SLOTS = [
  { start: '2026-05-03T03:00:00Z', end: '2026-05-03T11:00:00Z' }, // ראשון 06-14
  { start: '2026-05-03T11:00:00Z', end: '2026-05-03T19:00:00Z' }, // ראשון 14-22
  { start: '2026-05-03T19:00:00Z', end: '2026-05-04T03:00:00Z' }, // ראשון 22-שני 06
  { start: '2026-05-04T03:00:00Z', end: '2026-05-04T11:00:00Z' }, // שני 06-14
  { start: '2026-05-04T11:00:00Z', end: '2026-05-04T19:00:00Z' }, // שני 14-22
]

async function main() {
  for (const slot of SLOTS) {
    const startIL = new Date(slot.start).getUTCHours() + 3
    const endIL   = new Date(slot.end).getUTCHours() + 3
    await addDoc(collection(db, 'tasks'), {
      schedule_id: WEEK2_ID,
      task_type: 'כ"כ ב',
      task_name: 'כ"כ ב',
      start_datetime: T(slot.start),
      end_datetime: T(slot.end),
      notes: 'מחלקה 3',
      difficulty: 'normal',
      required_people_count: 3,
      requires_commander: false,
    })
    console.log(`Created כ"כ ב ${startIL}:00–${endIL}:00 IL | מחלקה 3`)
  }
  console.log('Done!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
