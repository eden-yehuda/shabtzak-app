import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, deleteDoc, updateDoc, doc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'

async function main() {
  const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', WEEK2_ID)))

  for (const t of tasksSnap.docs) {
    const d = t.data()
    const startH = d.start_datetime?.toDate().getUTCHours() + 3

    // 1. Delete wrong כ"כ ב tasks
    if (d.task_type === 'כ"כ ב') {
      const assignSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', t.id)))
      for (const a of assignSnap.docs) await deleteDoc(doc(db, 'assignments', a.id))
      await deleteDoc(doc(db, 'tasks', t.id))
      console.log(`Deleted כ"כ ב task ${t.id} (${startH}:00)`)
    }

    // 2. Add note to כ"כ א tasks that have soldiers (not the מחלקה 3 ones)
    if (d.task_type === 'כ"כ א' && d.notes !== 'מחלקה 3') {
      await updateDoc(doc(db, 'tasks', t.id), { notes: '+3 ממחלקה 3' })
      console.log(`Updated כ"כ א ${startH}:00 → notes: "+3 ממחלקה 3"`)
    }
  }

  console.log('Done!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
