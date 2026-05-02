import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

async function main() {
  const solSnap = await getDocs(collection(db, 'soldiers'))
  const lisha = solSnap.docs.find(d => d.data().full_name?.includes('לישה'))
  const bakrach = solSnap.docs.find(d => d.data().full_name?.includes('בכרך'))
  const eden = solSnap.docs.find(d => d.data().full_name?.includes('עדן'))

  const assignSnap = await getDocs(collection(db, 'assignments'))
  const allAssigns = assignSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Fix כ"כ ג 22:00 (task 0JKMjldboudghE7Rlzas) — all three have order=1
  const TASK_ID = '0JKMjldboudghE7Rlzas'
  const taskAssigns = allAssigns.filter(a => a.task_id === TASK_ID)

  console.log('לפני תיקון:')
  const soldierMap = Object.fromEntries(solSnap.docs.map(d=>[d.id, d.data().full_name]))
  for (const a of taskAssigns) {
    console.log(`  ${soldierMap[a.soldier_id]} order=${a.order}`)
  }

  // Set לישה → 0, עדן → 1, בכרך → 2
  const lishaA = taskAssigns.find(a => a.soldier_id === lisha?.id)
  const bakrachA = taskAssigns.find(a => a.soldier_id === bakrach?.id)
  const edenA = taskAssigns.find(a => a.soldier_id === eden?.id)

  if (lishaA) await updateDoc(doc(db, 'assignments', lishaA.id), { order: 0 })
  if (edenA) await updateDoc(doc(db, 'assignments', edenA.id), { order: 1 })
  if (bakrachA) await updateDoc(doc(db, 'assignments', bakrachA.id), { order: 2 })

  console.log('\nאחרי תיקון:')
  console.log(`  לישה → 0`)
  console.log(`  עדן → 1`)
  console.log(`  בכרך → 2`)
  console.log('\n✅ סיום')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
