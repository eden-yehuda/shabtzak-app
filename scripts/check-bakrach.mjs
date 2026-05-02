import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

async function main() {
  // Find בכרך soldier
  const solSnap = await getDocs(collection(db, 'soldiers'))
  const bakrach = solSnap.docs.find(d => d.data().full_name?.includes('בכרך'))
  const lisha = solSnap.docs.find(d => d.data().full_name?.includes('לישה') || d.data().full_name?.includes('ליש'))

  console.log('בכרך:', bakrach?.id, JSON.stringify(bakrach?.data()))
  console.log('לישה:', lisha?.id, JSON.stringify(lisha?.data()))

  if (!bakrach) { console.log('לא נמצא בכרך'); process.exit(0) }

  // Find assignments where bakrach is order=0
  const assignSnap = await getDocs(collection(db, 'assignments'))
  const bakrachAssigns = assignSnap.docs
    .filter(d => d.data().soldier_id === bakrach.id)
    .map(d => ({ id: d.id, ...d.data() }))

  console.log('\nכל השיבוצים של בכרך:')
  for (const a of bakrachAssigns.sort((x,y) => (x.order??99)-(y.order??99))) {
    console.log(`  order=${a.order} task_id=${a.task_id} id=${a.id}`)
  }

  const order0 = bakrachAssigns.filter(a => a.order === 0)
  if (order0.length > 0) {
    console.log('\nמשימות שבכרך הוא מפקד (order=0):')
    for (const a of order0) {
      // Get task details
      const taskSnap = await getDocs(query(collection(db, 'tasks'), where('__name__', '==', a.task_id)))
      // Actually use doc reference
      const taskDoc = (await getDocs(collection(db, 'tasks'))).docs.find(d => d.id === a.task_id)
      if (taskDoc) {
        const t = taskDoc.data()
        const start = t.start_datetime?.toDate()
        console.log(`  ${a.task_id}: ${t.task_name} ${start?.toISOString()}`)
      }
    }
  }

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
