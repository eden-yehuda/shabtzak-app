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
  // 1. Check/fix day_start_hour on week2 schedule
  const schedSnap = await getDocs(collection(db, 'schedules'))
  const week2 = schedSnap.docs.find(d => d.id === WEEK2_ID)
  console.log('שבוע 2 day_start_hour:', week2?.data().day_start_hour)
  if (week2?.data().day_start_hour !== 14) {
    await updateDoc(doc(db, 'schedules', WEEK2_ID), { day_start_hour: 14 })
    console.log('✓ עודכן day_start_hour=14')
  } else {
    console.log('✓ כבר 14')
  }

  // 2. Change כ"כ ב tasks from May 5-9 to כ"כ א
  const taskSnap = await getDocs(collection(db, 'tasks'))
  const week2Tasks = taskSnap.docs.filter(d => d.data().schedule_id === WEEK2_ID)

  const toRename = []
  for (const t of week2Tasks) {
    const data = t.data()
    if (data.task_type !== 'כ"כ ב') continue
    const startDate = data.start_datetime?.toDate()
    if (!startDate) continue
    // IL date: UTC+3
    const ilDate = new Date(startDate.getTime() + 3 * 3600000)
    const month = ilDate.getUTCMonth() + 1 // 5 = May
    const dayNum = ilDate.getUTCDate()
    // May 5-9 = שלישי-שישי
    if (month === 5 && dayNum >= 5 && dayNum <= 9) {
      toRename.push({ id: t.id, ilDate: `${dayNum}/5`, taskType: data.task_type })
    }
  }

  console.log(`\nממירים ${toRename.length} משימות כ"כ ב → כ"כ א (5/5-9/5):`)
  for (const t of toRename) {
    console.log(`  ${t.ilDate} ${t.taskType}`)
    await updateDoc(doc(db, 'tasks', t.id), { task_type: 'כ"כ א', task_name: 'כ"כ א' })
  }

  console.log('\n✅ סיום')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
