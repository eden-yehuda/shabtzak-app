import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, updateDoc, addDoc, doc, serverTimestamp } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'

async function main() {
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const nameToId = {}
  for (const s of soldiersSnap.docs) nameToId[s.data().full_name] = s.id

  const idHadad = nameToId['יואב חדד']
  const idOfir  = nameToId['אופיר אלטמן']
  if (!idHadad) { console.error('לא נמצא: יואב חדד'); process.exit(1) }
  if (!idOfir)  { console.error('לא נמצא: אופיר אלטמן'); process.exit(1) }
  console.log(`יואב חדד   → ${idHadad}`)
  console.log(`אופיר אלטמן → ${idOfir}`)

  // Get all tasks in שבוע 2
  const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', WEEK2_ID)))
  const taskMap = {}
  for (const t of tasksSnap.docs) taskMap[t.id] = { id: t.id, ...t.data() }
  const taskIds = Object.keys(taskMap)

  // Find חדד's assignments
  const chunks = []
  for (let i = 0; i < taskIds.length; i += 30) chunks.push(taskIds.slice(i, i + 30))

  let hadadAssigns = []
  for (const chunk of chunks) {
    const snap = await getDocs(query(collection(db, 'assignments'), where('task_id', 'in', chunk)))
    for (const d of snap.docs) {
      const data = { id: d.id, ...d.data() }
      if (data.soldier_id === idHadad) hadadAssigns.push(data)
    }
  }

  console.log(`\nשיבוצי חדד (${hadadAssigns.length}):`)
  for (const a of hadadAssigns) {
    const t = taskMap[a.task_id]
    const startH = t.start_datetime.toDate().getUTCHours() + 3
    const ilDate = new Date(t.start_datetime.toDate().getTime() + 3 * 3600000)
    const dateStr = ilDate.toISOString().slice(0, 10)
    console.log(`  ${dateStr} ${t.task_type} ${startH}:00, order=${a.order}`)
  }

  // Replace חדד → אופיר in all assignments
  for (const a of hadadAssigns) {
    await updateDoc(doc(db, 'assignments', a.id), { soldier_id: idOfir })
    console.log(`  [חדד→אופיר] task ${a.task_id}`)
  }

  // Add leave request for חדד on Monday 2026-05-04
  const LEAVE_DATE = '2026-05-04'
  // Check if already exists
  const existingLeave = await getDocs(query(
    collection(db, 'leave_requests'),
    where('soldier_id', '==', idHadad),
    where('date', '==', LEAVE_DATE)
  ))
  if (existingLeave.docs.length > 0) {
    console.log(`\nיציאה ל-${LEAVE_DATE} כבר קיימת`)
    // Make sure it's approved and final
    await updateDoc(doc(db, 'leave_requests', existingLeave.docs[0].id), {
      status: 'approved', is_final: true
    })
    console.log('  → עדכן ל-approved+final')
  } else {
    await addDoc(collection(db, 'leave_requests'), {
      soldier_id: idHadad,
      date: LEAVE_DATE,
      status: 'approved',
      is_final: true,
      created_at: serverTimestamp(),
    })
    console.log(`\nנוספה יציאה ל-${LEAVE_DATE} (approved+final)`)
  }

  console.log('\n✅ סיום')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
