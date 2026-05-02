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
  const bakrach = solSnap.docs.find(d => d.data().full_name?.includes('בכרך'))
  const lisha = solSnap.docs.find(d => d.data().full_name?.includes('לישה'))
  if (!bakrach || !lisha) { console.log('לא נמצא'); process.exit(1) }
  console.log(`בכרך: ${bakrach.id}, לישה: ${lisha.id}`)

  const assignSnap = await getDocs(collection(db, 'assignments'))
  const allAssigns = assignSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Find tasks where bakrach is order=0
  const bakrachOrder0 = allAssigns.filter(a => a.soldier_id === bakrach.id && a.order === 0)

  for (const bAssign of bakrachOrder0) {
    const taskId = bAssign.task_id
    const lishaInTask = allAssigns.find(a => a.task_id === taskId && a.soldier_id === lisha.id)

    console.log(`\nTask ${taskId}: בכרך order=${bAssign.order}, לישה order=${lishaInTask?.order ?? 'לא שובץ'}`)

    if (lishaInTask) {
      // Swap orders: לישה → 0, בכרך → לישה's old order
      const oldLishaOrder = lishaInTask.order
      console.log(`  מחליף: לישה→0, בכרך→${oldLishaOrder}`)
      await updateDoc(doc(db, 'assignments', lishaInTask.id), { order: 0 })
      await updateDoc(doc(db, 'assignments', bAssign.id), { order: oldLishaOrder })
      console.log('  ✓ בוצע')
    } else {
      // לישה not in this task — just demote בכרך to order=1 (or next available)
      const taskAssigns = allAssigns.filter(a => a.task_id === taskId).sort((a,b)=>(a.order??99)-(b.order??99))
      console.log('  לישה לא שובצה. שיבוצי המשימה:', taskAssigns.map(a=>a.order))
      // Give bakrach the next order after existing
      const maxOrder = Math.max(...taskAssigns.map(a=>a.order??0).filter(o=>o!==0))
      const newOrder = isFinite(maxOrder) ? maxOrder + 1 : 1
      console.log(`  מוריד בכרך ל-order=${newOrder}`)
      await updateDoc(doc(db, 'assignments', bAssign.id), { order: newOrder })
      console.log('  ✓ בוצע')
    }
  }

  console.log('\n✅ סיום')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
