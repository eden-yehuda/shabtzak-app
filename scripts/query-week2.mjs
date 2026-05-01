import { initializeApp } from 'firebase/app'
import { getFirestore, getDocs, query, collection, where } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

async function main() {
  const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'

  // Get all soldiers
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const soldiers = {}
  for (const s of soldiersSnap.docs) {
    const d = s.data()
    soldiers[s.id] = { name: d.full_name, isCommander: d.is_commander }
  }

  // Get week 2 tasks
  const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', WEEK2_ID)))
  const tasks = tasksSnap.docs.map(d => {
    const data = d.data()
    return { id: d.id, taskType: data.task_type, start: data.start_datetime?.toDate(), end: data.end_datetime?.toDate(), notes: data.notes }
  }).sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0))

  // Get all assignments for week 2 tasks
  const taskIds = tasks.map(t => t.id)
  const allAssigns = []
  for (const taskId of taskIds) {
    const snap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', taskId)))
    for (const a of snap.docs) {
      allAssigns.push({ ...a.data(), taskId })
    }
  }

  // Print
  for (const t of tasks) {
    const fmtIL = (d) => d ? `${String(d.getUTCHours()+3).padStart(2,'0')}:00 ${d.toISOString().slice(0,10)}` : '?'
    const assigns = allAssigns.filter(a => a.taskId === t.id).sort((a,b) => (a.order??99)-(b.order??99))
    const names = assigns.map(a => `${soldiers[a.soldier_id]?.name ?? a.soldier_id}${a.order===0?'★':''}`)
    console.log(`${t.id} | ${t.taskType.padEnd(8)} | ${fmtIL(t.start)} → ${fmtIL(t.end)} ${t.notes?'| '+t.notes:''} | [${names.join(', ')}]`)
  }

  console.log('\n=== All soldiers ===')
  for (const [id, s] of Object.entries(soldiers).sort((a,b) => a[1].name.localeCompare(b[1].name))) {
    console.log(`  ${id}: ${s.name} ${s.isCommander ? '★' : ''}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
