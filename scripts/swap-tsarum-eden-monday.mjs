import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, updateDoc, deleteDoc, doc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'
const MONDAY = '2026-05-04'

function ilDate(ts) {
  const d = ts.toDate()
  return new Date(d.getTime() + 3 * 3600000).toISOString().slice(0, 10)
}

async function main() {
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const nameToId = {}, idToName = {}
  for (const s of soldiersSnap.docs) {
    nameToId[s.data().full_name] = s.id
    idToName[s.id] = s.data().full_name
  }

  const idTsarum = nameToId['זיו צארום']
  const idEden   = nameToId['עדן יהודה']
  if (!idTsarum) { console.error('לא נמצא: זיו צארום'); process.exit(1) }
  if (!idEden)   { console.error('לא נמצא: עדן יהודה'); process.exit(1) }
  console.log(`זיו צארום → ${idTsarum}`)
  console.log(`עדן יהודה → ${idEden}`)

  // Get all tasks on Monday in שבוע 2
  const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', WEEK2_ID)))
  const mondayTasks = tasksSnap.docs
    .filter(t => ilDate(t.data().start_datetime) === MONDAY)
    .map(d => ({ id: d.id, ...d.data() }))

  console.log(`\nמשימות יום שני (${MONDAY}): ${mondayTasks.length}`)
  for (const t of mondayTasks) {
    const h = (t.start_datetime.toDate().getUTCHours() + 3) % 24
    console.log(`  ${t.task_type} ${h}:00 (${t.id})`)
  }

  const mondayIds = mondayTasks.map(t => t.id)
  const chunks = []
  for (let i = 0; i < mondayIds.length; i += 30) chunks.push(mondayIds.slice(i, i + 30))

  let allAssigns = []
  for (const chunk of chunks) {
    const s = await getDocs(query(collection(db, 'assignments'), where('task_id', 'in', chunk)))
    allAssigns.push(...s.docs.map(d => ({ id: d.id, ...d.data() })))
  }

  // 1. Replace צארום → עדן
  const tsarumAssigns = allAssigns.filter(a => a.soldier_id === idTsarum)
  console.log(`\nשיבוצי צארום ביום שני: ${tsarumAssigns.length}`)
  for (const a of tsarumAssigns) {
    const t = mondayTasks.find(t => t.id === a.task_id)
    const h = (t.start_datetime.toDate().getUTCHours() + 3) % 24
    console.log(`  ${t.task_type} ${h}:00 order=${a.order} → מחליף בעדן`)
    await updateDoc(doc(db, 'assignments', a.id), { soldier_id: idEden })
  }

  // 2. Remove עדן from כ"כ א on Monday (leave empty)
  const edenKKAssigns = allAssigns.filter(a => {
    if (a.soldier_id !== idEden) return false
    const t = mondayTasks.find(t => t.id === a.task_id)
    return t && t.task_type === 'כ"כ א'
  })
  console.log(`\nשיבוצי עדן בכ"כ א יום שני: ${edenKKAssigns.length}`)
  for (const a of edenKKAssigns) {
    const t = mondayTasks.find(t => t.id === a.task_id)
    const h = (t.start_datetime.toDate().getUTCHours() + 3) % 24
    console.log(`  כ"כ א ${h}:00 order=${a.order} → מוחק (משאיר ריק)`)
    await deleteDoc(doc(db, 'assignments', a.id))
  }

  if (tsarumAssigns.length === 0 && edenKKAssigns.length === 0) {
    console.log('\n⚠️ לא נמצאו שיבוצים לביצוע')
  } else {
    console.log('\n✅ סיום')
  }
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
