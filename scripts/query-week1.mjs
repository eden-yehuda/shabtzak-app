import { initializeApp } from 'firebase/app'
import { getFirestore, getDocs, query, collection, where, orderBy } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

async function main() {
  // First find שבוע 1 schedule
  const schedSnap = await getDocs(collection(db, 'schedules'))
  for (const s of schedSnap.docs) {
    const d = s.data()
    const start = d.start_datetime?.toDate()
    const end = d.end_datetime?.toDate()
    console.log(`Schedule ${s.id}: ${d.name} | ${start?.toISOString()} -> ${end?.toISOString()} | status: ${d.status}`)
  }
  console.log()

  // List all schedules and pick week 1
  const week1Id = schedSnap.docs.find(s => s.data().name?.includes('1') || s.data().name?.includes('ראשון'))?.id
  // Let's just print tasks for all schedules
  const tasksSnap = await getDocs(collection(db, 'tasks'))
  const tasks = tasksSnap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      scheduleId: data.schedule_id,
      taskType: data.task_type,
      start: data.start_datetime?.toDate(),
      end: data.end_datetime?.toDate(),
      notes: data.notes,
    }
  }).sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0))

  // Group by schedule
  const bySchedule = {}
  for (const t of tasks) {
    if (!bySchedule[t.scheduleId]) bySchedule[t.scheduleId] = []
    bySchedule[t.scheduleId].push(t)
  }

  for (const [schedId, tasks] of Object.entries(bySchedule)) {
    const sched = schedSnap.docs.find(s => s.id === schedId)?.data()
    console.log(`\n=== Schedule ${schedId}: ${sched?.name} ===`)
    for (const t of tasks) {
      const startIL = t.start ? new Date(t.start.getTime()) : null
      const endIL = t.end ? new Date(t.end.getTime()) : null
      // IL = UTC+3
      const fmtIL = (d) => d ? `${String(d.getUTCHours()+3).padStart(2,'0')}:00 ${d.toISOString().slice(0,10)}` : '?'
      const hrs = t.start && t.end ? (t.end.getTime() - t.start.getTime()) / 3600000 : '?'
      console.log(`  ${t.id} | ${t.taskType.padEnd(10)} | ${fmtIL(t.start)} -> ${fmtIL(t.end)} (${hrs}h) ${t.notes ? '| '+t.notes : ''}`)
    }
  }
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
