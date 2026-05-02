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

  const idEden   = nameToId['עדן יהודה']
  const idBakrekh = nameToId['אחיה בכרך']
  if (!idEden)    { console.error('לא נמצא: עדן יהודה');  process.exit(1) }
  if (!idBakrekh) { console.error('לא נמצא: אחיה בכרך'); process.exit(1) }
  console.log(`עדן יהודה  → ${idEden}`)
  console.log(`אחיה בכרך → ${idBakrekh}`)

  const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', WEEK2_ID)))
  const taskIds = tasksSnap.docs.map(d => d.id)

  const chunks = []
  for (let i = 0; i < taskIds.length; i += 30) chunks.push(taskIds.slice(i, i + 30))

  let assignsEden = [], assignsBakrekh = []
  for (const chunk of chunks) {
    const snap = await getDocs(query(collection(db, 'assignments'), where('task_id', 'in', chunk)))
    for (const d of snap.docs) {
      const data = { id: d.id, ...d.data() }
      if (data.soldier_id === idEden)    assignsEden.push(data)
      if (data.soldier_id === idBakrekh) assignsBakrekh.push(data)
    }
  }

  console.log(`עדן:   ${assignsEden.length} שיבוצים`)
  console.log(`בכרך:  ${assignsBakrekh.length} שיבוצים`)

  // Swap: בכרך → עדן
  for (const a of assignsBakrekh) {
    await updateDoc(doc(db, 'assignments', a.id), { soldier_id: idEden })
    console.log(`  [בכרך→עדן] task ${a.task_id}, order=${a.order}`)
  }
  // Swap: עדן → בכרך
  for (const a of assignsEden) {
    await updateDoc(doc(db, 'assignments', a.id), { soldier_id: idBakrekh })
    console.log(`  [עדן→בכרך] task ${a.task_id}, order=${a.order}`)
  }

  console.log('✅ החלפה הושלמה!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
