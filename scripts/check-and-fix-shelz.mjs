import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

const WEEK1_ID = 'xDdtAGrNHuGmrRQVjYP7' // שבוע 1
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD' // שבוע 2

async function main() {
  // Find אופיר אלטמן
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const nameToId = {}
  for (const s of soldiersSnap.docs) nameToId[s.data().full_name] = s.id
  const ofirId = nameToId['אופיר אלטמן']
  if (!ofirId) { console.error('לא נמצא: אופיר אלטמן'); process.exit(1) }
  console.log(`אופיר אלטמן → ${ofirId}`)

  // Find של"ז tasks in both schedules
  for (const [label, schedId] of [['שבוע 1', WEEK1_ID], ['שבוע 2', WEEK2_ID]]) {
    const tasksSnap = await getDocs(query(
      collection(db, 'tasks'),
      where('schedule_id', '==', schedId),
      where('task_type', '==', 'של"ז')
    ))
    console.log(`\n${label}: נמצאו ${tasksSnap.docs.length} משימות של"ז`)

    for (const t of tasksSnap.docs) {
      const data = t.data()
      const start = data.start_datetime.toDate()
      const end = data.end_datetime.toDate()
      const startH = start.getUTCHours() + 3  // IL time
      const endH = end.getUTCHours() + 3

      // Check if אופיר is assigned to this task
      const assignSnap = await getDocs(query(
        collection(db, 'assignments'),
        where('task_id', '==', t.id),
        where('soldier_id', '==', ofirId)
      ))
      const hasOfir = assignSnap.docs.length > 0

      console.log(`  task ${t.id}: ${startH}:00–${endH}:00, time_display="${data.time_display ?? 'לא מוגדר'}", אופיר=${hasOfir ? '✓' : '✗'}`)

      // Set time_display on tasks where אופיר is assigned
      if (hasOfir && data.time_display !== '08:00–20:00') {
        await updateDoc(doc(db, 'tasks', t.id), { time_display: '08:00–20:00' })
        console.log(`    → עדכן time_display="08:00–20:00"`)
      } else if (hasOfir) {
        console.log(`    → כבר מוגדר נכון ✓`)
      }
    }
  }

  console.log('\n✅ סיום')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
