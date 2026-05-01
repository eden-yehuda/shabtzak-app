import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'
const NAMES = ['יהונתן בוצר', 'חגי פייגנבום']

async function main() {
  // Find soldier IDs
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const nameToId = {}
  for (const s of soldiersSnap.docs) nameToId[s.data().full_name] = s.id

  const ids = NAMES.map(n => {
    if (!nameToId[n]) console.warn(`WARNING: soldier not found: "${n}"`)
    return nameToId[n]
  }).filter(Boolean)

  if (ids.length < 2) { console.error('Could not find both soldiers'); process.exit(1) }
  console.log(`Found: ${NAMES[0]} → ${ids[0]}`)
  console.log(`Found: ${NAMES[1]} → ${ids[1]}`)

  // Find כ"כ א tasks in שבוע 2 on Sunday May 3
  const tasksSnap = await getDocs(query(
    collection(db, 'tasks'),
    where('schedule_id', '==', WEEK2_ID),
    where('task_type', '==', 'כ"כ א'),
  ))

  let updated = 0
  for (const t of tasksSnap.docs) {
    const startH = t.data().start_datetime.toDate().getUTCHours() + 3 // IL hour
    // Find assignments for this task
    const assignSnap = await getDocs(query(
      collection(db, 'assignments'),
      where('task_id', '==', t.id)
    ))

    const assigns = assignSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const aA = assigns.find(a => a.soldier_id === ids[0])
    const aB = assigns.find(a => a.soldier_id === ids[1])

    if (aA && aB) {
      await updateDoc(doc(db, 'assignments', aA.id), { alternating_group: 1 })
      await updateDoc(doc(db, 'assignments', aB.id), { alternating_group: 1 })
      console.log(`Set alternating_group=1 for ${NAMES[0]} & ${NAMES[1]} in כ"כ א ${startH}:00`)
      updated++
    }
  }

  if (updated === 0) console.log('No tasks found with both soldiers assigned.')
  console.log('Done!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
