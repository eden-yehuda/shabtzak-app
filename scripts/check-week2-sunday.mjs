import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'

async function main() {
  const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', WEEK2_ID)))
  const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Group by date
  const byDate = {}
  for (const t of tasks) {
    const start = t.start_datetime.toDate()
    const ilHour = start.getUTCHours() + 3
    const ilDate = new Date(start.getTime() + 3 * 3600000)
    const dateStr = ilDate.toISOString().slice(0, 10)
    if (!byDate[dateStr]) byDate[dateStr] = []
    byDate[dateStr].push({ type: t.task_type, startH: ilHour, id: t.id })
  }

  for (const [date, dayTasks] of Object.entries(byDate).sort()) {
    const sorted = dayTasks.sort((a, b) => a.startH - b.startH)
    const earliest = sorted[0].startH
    console.log(`\n${date} (earliest: ${earliest}:00)`)
    for (const t of sorted) {
      console.log(`  ${t.type}: ${t.startH}:00`)
    }
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
