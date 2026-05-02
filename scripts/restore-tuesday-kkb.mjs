import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, addDoc, Timestamp } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'

// Shifts for May 5 (שלישי), IL timezone = UTC+3
// 06:00 IL = 03:00Z, 14:00 IL = 11:00Z, 22:00 IL = 19:00Z
const SHIFTS = [
  { startH: 3,  endH: 11, nextDay: false, ilH: 6  },
  { startH: 11, endH: 19, nextDay: false, ilH: 14 },
  { startH: 19, endH: 3,  nextDay: true,  ilH: 22 },
]

function makeTS(dateStr, utcH, nextDay = false) {
  const d = new Date(`${dateStr}T${String(utcH).padStart(2,'0')}:00:00Z`)
  if (nextDay) d.setDate(d.getDate() + 1)
  return Timestamp.fromDate(d)
}

async function main() {
  const taskSnap = await getDocs(collection(db, 'tasks'))
  const week2Tasks = taskSnap.docs.filter(d => d.data().schedule_id === WEEK2_ID)

  // Check which May 5 כ"כ ב shifts exist
  const existing = new Set()
  for (const t of week2Tasks) {
    const data = t.data()
    if (data.task_type !== 'כ"כ ב') continue
    const startDate = data.start_datetime?.toDate()
    if (!startDate) continue
    const ilDate = new Date(startDate.getTime() + 3 * 3600000)
    if (ilDate.getUTCMonth() + 1 === 5 && ilDate.getUTCDate() === 5) {
      const ilH = ilDate.getUTCHours()
      existing.add(ilH)
      console.log(`  קיים: כ"כ ב ${ilH}:00`)
    }
  }

  let created = 0
  for (const shift of SHIFTS) {
    if (existing.has(shift.ilH)) continue
    const start = makeTS('2026-05-05', shift.startH)
    const end = makeTS('2026-05-05', shift.endH, shift.nextDay)
    await addDoc(collection(db, 'tasks'), {
      schedule_id: WEEK2_ID,
      task_type: 'כ"כ ב',
      task_name: 'כ"כ ב',
      required_people_count: 3,
      requires_commander: false,
      difficulty: 'normal',
      notes: '',
      start_datetime: start,
      end_datetime: end,
    })
    console.log(`  ✓ נוצר: כ"כ ב ${shift.ilH}:00`)
    created++
  }

  console.log(`\n✅ נוצרו ${created} משימות חדשות`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
