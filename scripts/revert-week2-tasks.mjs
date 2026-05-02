import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'

async function main() {
  const taskSnap = await getDocs(collection(db, 'tasks'))
  const week2Tasks = taskSnap.docs.filter(d => d.data().schedule_id === WEEK2_ID)

  let reverted = 0
  for (const t of week2Tasks) {
    const data = t.data()
    if (data.task_type !== 'כ"כ א') continue
    const startDate = data.start_datetime?.toDate()
    if (!startDate) continue
    const ilDate = new Date(startDate.getTime() + 3 * 3600000)
    const month = ilDate.getUTCMonth() + 1
    const dayNum = ilDate.getUTCDate()
    if (month === 5 && dayNum >= 5 && dayNum <= 9) {
      await updateDoc(doc(db, 'tasks', t.id), { task_type: 'כ"כ ב', task_name: 'כ"כ ב' })
      console.log(`  ✓ ${dayNum}/5 כ"כ א → כ"כ ב`)
      reverted++
    }
  }
  console.log(`\n✅ חזרו ${reverted} משימות`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
