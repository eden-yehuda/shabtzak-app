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
  const nameToId = {}, idToName = {}
  for (const s of soldiersSnap.docs) {
    nameToId[s.data().full_name] = s.id
    idToName[s.id] = s.data().full_name
  }

  const idOfir = nameToId['אופיר אלטמן']
  console.log(`אופיר אלטמן → ${idOfir}`)

  // Find all כ"כ tasks in שבוע 2
  const tasksSnap = await getDocs(query(
    collection(db, 'tasks'),
    where('schedule_id', '==', WEEK2_ID),
  ))

  const kkTasks = tasksSnap.docs
    .filter(d => d.data().task_type === 'כ"כ א' || d.data().task_type === 'כ"כ ב')
    .map(d => ({ id: d.id, ...d.data() }))

  console.log(`\nמצא ${kkTasks.length} משימות כ"כ`)

  for (const t of kkTasks) {
    const startH = t.start_datetime.toDate().getUTCHours() + 3
    const ilDate = new Date(t.start_datetime.toDate().getTime() + 3 * 3600000)
    const dateStr = ilDate.toISOString().slice(0, 10)

    const assignSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', t.id)))
    const assigns = assignSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order)

    console.log(`\n${dateStr} ${t.task_type} ${startH}:00:`)
    for (const a of assigns) {
      console.log(`  order=${a.order} ${idToName[a.soldier_id] ?? a.soldier_id}`)
    }

    const ofirAssign = assigns.find(a => a.soldier_id === idOfir)
    if (ofirAssign) {
      if (ofirAssign.order === 0) {
        console.log(`  → אופיר כבר מפקד ✓`)
        continue
      }
      // Find current order=0 (the commander)
      const currentCommander = assigns.find(a => a.order === 0)
      const ofirOldOrder = ofirAssign.order

      // Swap: אופיר → order=0, current commander → אופיר's old order
      await updateDoc(doc(db, 'assignments', ofirAssign.id), { order: 0 })
      if (currentCommander) {
        await updateDoc(doc(db, 'assignments', currentCommander.id), { order: ofirOldOrder })
        console.log(`  → אופיר: ${ofirOldOrder}→0 | ${idToName[currentCommander.soldier_id]}: 0→${ofirOldOrder}`)
      } else {
        console.log(`  → אופיר: ${ofirOldOrder}→0`)
      }
    }
  }

  console.log('\n✅ סיום')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
