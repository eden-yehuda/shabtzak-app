import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, updateDoc, deleteDoc, addDoc, doc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'
const MONDAY = '2026-05-04'
const KKA_06_TASK_ID = 'JdlM8htKOkF8pwNWS1Yf' // כ"כ א 06:00 שני
const EMPTY_ORDER = 1 // the slot עדן left

function ilDate(ts) {
  const d = ts.toDate()
  return new Date(d.getTime() + 3 * 3600000).toISOString().slice(0, 10)
}

async function main() {
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const idToName = {}
  let simkoId = null
  for (const s of soldiersSnap.docs) {
    idToName[s.id] = s.data().full_name
    if (s.data().full_name.includes('סימקו')) {
      simkoId = s.id
      console.log(`סימקו → ${s.data().full_name} (${s.id})`)
    }
  }
  if (!simkoId) { console.error('לא נמצא חייל עם "סימקו" בשם'); process.exit(1) }

  // Get Monday tasks in שבוע 2
  const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', WEEK2_ID)))
  const mondayTasks = tasksSnap.docs
    .filter(t => ilDate(t.data().start_datetime) === MONDAY)
    .map(d => ({ id: d.id, ...d.data() }))

  const mondayIds = mondayTasks.map(t => t.id)
  const chunks = []
  for (let i = 0; i < mondayIds.length; i += 30) chunks.push(mondayIds.slice(i, i + 30))

  let simkoMonday = []
  for (const chunk of chunks) {
    const s = await getDocs(query(collection(db, 'assignments'), where('task_id', 'in', chunk)))
    for (const d of s.docs) {
      if (d.data().soldier_id === simkoId) simkoMonday.push({ id: d.id, ...d.data() })
    }
  }

  console.log(`\nשיבוצי סימקו יום שני:`)
  for (const a of simkoMonday) {
    const t = mondayTasks.find(t => t.id === a.task_id)
    const h = (t.start_datetime.toDate().getUTCHours() + 3) % 24
    console.log(`  ${t.task_type} ${h}:00 order=${a.order}`)
  }

  // Find his תרג"ד assignment on Monday
  const trgd = simkoMonday.find(a => {
    const t = mondayTasks.find(t => t.id === a.task_id)
    return t && t.task_type === 'תרג"ד'
  })
  if (!trgd) { console.error('\nסימקו לא נמצא בתרג"ד ביום שני'); process.exit(1) }

  const trgdTask = mondayTasks.find(t => t.id === trgd.task_id)
  const trgdH = (trgdTask.start_datetime.toDate().getUTCHours() + 3) % 24
  console.log(`\nמסיר מתרג"ד ${trgdH}:00 (order=${trgd.order})`)
  await deleteDoc(doc(db, 'assignments', trgd.id))

  // Verify the empty slot in כ"כ א 06:00
  const kkaAssigns = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', KKA_06_TASK_ID)))
  const existing = kkaAssigns.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order)
  console.log(`\nכ"כ א 06:00 לפני הוספה:`)
  for (const a of existing) console.log(`  order=${a.order} ${idToName[a.soldier_id] ?? a.soldier_id}`)

  // Add סימקו at the empty order=1 slot
  await addDoc(collection(db, 'assignments'), {
    task_id: KKA_06_TASK_ID,
    soldier_id: simkoId,
    order: EMPTY_ORDER,
  })
  console.log(`\nנוסף סימקו לכ"כ א 06:00 order=${EMPTY_ORDER}`)
  console.log('✅ סיום')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
