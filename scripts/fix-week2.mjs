import { initializeApp } from 'firebase/app'
import { getFirestore, doc, deleteDoc, getDocs, query, collection, where, updateDoc, Timestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function main() {
  const wrongTaskIds = ['Nn1Vy1UqoiOvSdlYrQXS', 'khpPIuFnq6Clr6Fu8979']
  
  for (const taskId of wrongTaskIds) {
    // Delete assignments for this task
    const assignSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', taskId)))
    console.log(`Task ${taskId}: deleting ${assignSnap.docs.length} assignments`)
    for (const a of assignSnap.docs) {
      await deleteDoc(doc(db, 'assignments', a.id))
      console.log(`  Deleted assignment ${a.id}`)
    }
    // Delete the task
    await deleteDoc(doc(db, 'tasks', taskId))
    console.log(`  Deleted task ${taskId}`)
  }

  // Reset schedule start_datetime to Sunday 14:00 IL = 11:00 UTC
  const scheduleId = '8B2b9nS7Yu4x0boBxRzD'
  const newStart = new Date('2026-05-03T11:00:00.000Z')
  await updateDoc(doc(db, 'schedules', scheduleId), {
    start_datetime: Timestamp.fromDate(newStart)
  })
  console.log(`Updated schedule ${scheduleId} start_datetime to ${newStart.toISOString()}`)
  
  console.log('Done!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
