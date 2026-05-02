import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK1_ID = 'brtpP7kDghHjTiRP8sQG'
const TARGET_TASK_ID = 'BtczSGRnZLNko2Ze46aa' // ראשון 02:00 כ"כ א שבוע 1

async function main() {
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const nameToId = {}, idToName = {}
  for (const s of soldiersSnap.docs) {
    nameToId[s.data().full_name] = s.id
    idToName[s.id] = s.data().full_name
  }

  const idKlifa = nameToId['מאור כליפה']
  const idMaorL = nameToId['מאור לוי']
  if (!idKlifa) { console.error('לא נמצא מאור כליפה'); process.exit(1) }
  if (!idMaorL) { console.error('לא נמצא מאור לוי'); process.exit(1) }
  console.log(`מאור כליפה → ${idKlifa}`)
  console.log(`מאור לוי   → ${idMaorL}`)

  // Get assignments for the target task
  const assignSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', TARGET_TASK_ID)))
  const assigns = assignSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order)

  console.log('\nשיבוצים נוכחיים:')
  for (const a of assigns) {
    const name = idToName[a.soldier_id] ?? a.soldier_id
    console.log(`  order=${a.order} ${name}${a.soldier_id === idKlifa ? ' ← מאור כליפה' : ''}`)
  }

  const klifaAssign = assigns.find(a => a.soldier_id === idKlifa)
  if (!klifaAssign) { console.error('\nמאור כליפה לא נמצא במשימה זו'); process.exit(1) }

  // Check מאור לוי not already in this task
  const maorLAssign = assigns.find(a => a.soldier_id === idMaorL)
  if (maorLAssign) { console.error('\nמאור לוי כבר במשימה זו'); process.exit(1) }

  console.log(`\nמחליף: מאור כליפה (order=${klifaAssign.order}) → מאור לוי`)
  await updateDoc(doc(db, 'assignments', klifaAssign.id), { soldier_id: idMaorL })
  console.log('✅ הוחלף בהצלחה!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
