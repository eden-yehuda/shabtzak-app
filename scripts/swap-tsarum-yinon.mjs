import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'

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

  const idTsarum = nameToId['זיו צארום']
  const idYinon  = nameToId['ינון אביטל']
  if (!idTsarum) { console.error('לא נמצא: זיו צארום'); process.exit(1) }
  if (!idYinon)  { console.error('לא נמצא: ינון אביטל'); process.exit(1) }
  console.log(`זיו צארום → ${idTsarum}`)
  console.log(`ינון אביטל → ${idYinon}`)

  // Get all assignments in שבוע 2
  const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', WEEK2_ID)))
  const taskIds = tasksSnap.docs.map(d => d.id)

  // Firestore IN query limit = 30
  const chunks = []
  for (let i = 0; i < taskIds.length; i += 30) chunks.push(taskIds.slice(i, i + 30))

  let assignsTsarum = [], assignsYinon = []
  for (const chunk of chunks) {
    const snap = await getDocs(query(collection(db, 'assignments'), where('task_id', 'in', chunk)))
    for (const d of snap.docs) {
      const data = { id: d.id, ...d.data() }
      if (data.soldier_id === idTsarum) assignsTsarum.push(data)
      if (data.soldier_id === idYinon)  assignsYinon.push(data)
    }
  }

  console.log(`צארום: ${assignsTsarum.length} שיבוצים`)
  console.log(`ינון:  ${assignsYinon.length} שיבוצים`)

  // Swap: צארום → ינון
  for (const a of assignsTsarum) {
    await updateDoc(doc(db, 'assignments', a.id), { soldier_id: idYinon })
    console.log(`  [צארום→ינון] task ${a.task_id}, order=${a.order}`)
  }
  // Swap: ינון → צארום
  for (const a of assignsYinon) {
    await updateDoc(doc(db, 'assignments', a.id), { soldier_id: idTsarum })
    console.log(`  [ינון→צארום] task ${a.task_id}, order=${a.order}`)
  }

  console.log('✅ החלפה הושלמה!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
