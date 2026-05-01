import { initializeApp } from 'firebase/app'
import { getFirestore, doc, deleteDoc, getDocs, query, collection, where, updateDoc, Timestamp } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

// All 1-hour duplicate כ"כ tasks to delete
const WRONG_TASKS_DELETE = [
  // Apr 28→29 overnight duplicates
  '2RE6KdFw6cHXvqCRrOva', '7H3Kpj1pCGUMEonN16KD', 'Wg6x5YwljPb0Z6Xou2pM',
  'acdOWW5J6Fo5Hal1omQx', 'heItjVkrK5QDxZoDPhux', 'zMikJTI5z9Bb7ydfy7P6',
  // Apr 29→30 overnight duplicates
  '6BhJRTqaNK3x2fIZSLVm', 'Ry2RLCzXJi7di4IZ3JnD', 'VbKrIbkAwegxUXqm6J61',
  'hOxDh1yq1AtgNiTK3HIp', 'oyA1lM0i23QK2X3T4Sbo', 'xGcgpBleFrfZrelnEo2E',
  // Apr 30→May 1 overnight duplicates
  '3iMi5ifXwy7y1Slbbb2m', 'EEeoOHH5nG4jQ7cRZmPc', 'HGHyIduggjUdB8xJzo9I',
  'KRJaF5T9McCl5gYFaDis', 'dEQpfrQGhdIX1RhrwaeV', 'laULiY6hTcoD3GNs5Y6Q',
  // May 1→2 overnight duplicates
  '6uVM76BFbMJIbXrHx3r4', '70Zq3y6zXeNvTmHJf4Me', 'JknXDVq85OMixhZCVuZm',
  'OcQjT1vU5bGzfGc2YpLw', 'eHD1fYUl5AN2sEDKVXnf', 'iOJ4T19mQHsBpX7ngSlS',
  // Early עתודה before schedule start (Apr 28 02:00-03:00)
  'EbncJzjT2iouj1UZDZd2', 'F70u1iKUuItQXjPik8nn', 'htIG9MC7XE6G8MI6N7Gr',
]

// Sunday May 3 overnight כ"כ tasks: extend from 1h to 12h (02:00→14:00 IL = 11:00 UTC May 3)
const TASKS_EXTEND = ['BtczSGRnZLNko2Ze46aa', 'RT7PxHpPmLu8iBnUSByC']
const NEW_END = new Date('2026-05-03T11:00:00.000Z') // 14:00 IL

// Schedule week 1
const WEEK1_SCHEDULE_ID = 'brtpP7kDghHjTiRP8sQG'

async function main() {
  // 1. Delete wrong tasks + assignments
  for (const taskId of WRONG_TASKS_DELETE) {
    const assignSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', taskId)))
    for (const a of assignSnap.docs) {
      await deleteDoc(doc(db, 'assignments', a.id))
    }
    await deleteDoc(doc(db, 'tasks', taskId))
    console.log(`Deleted task ${taskId} + ${assignSnap.docs.length} assignments`)
  }

  // 2. Extend Sunday overnight tasks to 12h
  for (const taskId of TASKS_EXTEND) {
    await updateDoc(doc(db, 'tasks', taskId), {
      end_datetime: Timestamp.fromDate(NEW_END)
    })
    console.log(`Extended task ${taskId} end to ${NEW_END.toISOString()} (14:00 IL May 3)`)
  }

  // 3. Update schedule end_datetime to 14:00 IL Sunday May 3
  await updateDoc(doc(db, 'schedules', WEEK1_SCHEDULE_ID), {
    end_datetime: Timestamp.fromDate(NEW_END)
  })
  console.log(`Updated schedule ${WEEK1_SCHEDULE_ID} end to ${NEW_END.toISOString()}`)

  console.log('\nAll done!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
