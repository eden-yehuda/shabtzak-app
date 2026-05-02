import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'
const TARGET_DATE = '2026-05-03' // ראשון
const TARGET_TYPE = 'כ"כ א'
const TARGET_HOUR = 14 // IL time

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

  // Find כ"כ א tasks on ראשון
  const tasksSnap = await getDocs(query(
    collection(db, 'tasks'),
    where('schedule_id', '==', WEEK2_ID),
    where('task_type', '==', TARGET_TYPE)
  ))

  let targetTask = null
  for (const t of tasksSnap.docs) {
    const start = t.data().start_datetime.toDate()
    const ilHour = start.getUTCHours() + 3
    const ilDate = new Date(start.getTime() + 3 * 3600000)
    const dateStr = ilDate.toISOString().slice(0, 10)
    if (dateStr === TARGET_DATE && ilHour === TARGET_HOUR) {
      targetTask = { id: t.id, ...t.data() }
      break
    }
  }

  if (!targetTask) { console.error(`לא נמצאה משימת ${TARGET_TYPE} ב-${TARGET_DATE} ${TARGET_HOUR}:00`); process.exit(1) }
  console.log(`✓ נמצאה משימה: ${targetTask.id}`)

  // Get assignments for this task
  const assignSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', targetTask.id)))
  const assigns = assignSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order)

  console.log(`\nשיבוצים נוכחיים:`)
  for (const a of assigns) {
    console.log(`  order=${a.order} ${idToName[a.soldier_id] ?? a.soldier_id}${a.soldier_id === idKlifa ? ' ← מאור כליפה' : a.soldier_id === idMaorL ? ' ← מאור לוי' : ''}`)
  }

  const klifaAssign = assigns.find(a => a.soldier_id === idKlifa)
  if (!klifaAssign) { console.log('\nמאור כליפה לא בכלל במשימה זו'); process.exit(0) }

  // Check מאור לוי's conflicts on ראשון
  console.log(`\n--- בדיקת קונפליקטים למאור לוי ב-${TARGET_DATE} ---`)

  // Check leave on ראשון
  const leaveSnap = await getDocs(query(
    collection(db, 'leave_requests'),
    where('soldier_id', '==', idMaorL),
    where('date', '==', TARGET_DATE),
    where('is_final', '==', true)
  ))
  if (leaveSnap.docs.length > 0) {
    console.log(`⛔ מאור לוי יוצא הביתה ב-${TARGET_DATE} — אי אפשר לשבץ!`)
    process.exit(0)
  }
  console.log('✓ אין יציאה לביתה ב-ראשון')

  // Check other assignments on ראשון
  const allTasksSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', WEEK2_ID)))
  const rishonTasks = allTasksSnap.docs.filter(t => {
    const start = t.data().start_datetime.toDate()
    const ilDate = new Date(start.getTime() + 3 * 3600000)
    return ilDate.toISOString().slice(0, 10) === TARGET_DATE
  }).map(d => ({ id: d.id, ...d.data() }))

  const rishonTaskIds = rishonTasks.map(t => t.id)
  const chunks = []
  for (let i = 0; i < rishonTaskIds.length; i += 30) chunks.push(rishonTaskIds.slice(i, i + 30))

  let conflicts = []
  for (const chunk of chunks) {
    const s = await getDocs(query(collection(db, 'assignments'), where('task_id', 'in', chunk)))
    for (const d of s.docs) {
      if (d.data().soldier_id === idMaorL) {
        const task = rishonTasks.find(t => t.id === d.data().task_id)
        const startH = task.start_datetime.toDate().getUTCHours() + 3
        conflicts.push(`  כבר משובץ: ${task.task_type} ${startH}:00`)
      }
    }
  }

  if (conflicts.length > 0) {
    console.log('⚠️ מאור לוי כבר משובץ ב-ראשון:')
    conflicts.forEach(c => console.log(c))
  } else {
    console.log('✓ אין שיבוצים אחרים למאור לוי ב-ראשון')
  }

  // Perform the swap
  console.log(`\nמחליף מאור כליפה (order=${klifaAssign.order}) → מאור לוי`)
  await updateDoc(doc(db, 'assignments', klifaAssign.id), { soldier_id: idMaorL })
  console.log('✅ הוחלף בהצלחה!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
