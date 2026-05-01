import { initializeApp } from 'firebase/app'
import { getFirestore, getDocs, query, collection, where, addDoc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

// Sunday 02:00-14:00 tasks in שבוע 1
const KK_A = 'BtczSGRnZLNko2Ze46aa' // כ"כ א
const KK_B = 'RT7PxHpPmLu8iBnUSByC' // כ"כ ב

async function main() {
  // Find soldier IDs
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const soldierMap = {}
  for (const s of soldiersSnap.docs) soldierMap[s.data().full_name] = s.id

  const hagay = soldierMap['חגי פייגנבום']
  const botzr = soldierMap['יהונתן בוצר']
  console.log('חגי:', hagay, 'בוצר:', botzr)

  // Check existing assignments
  for (const [taskId, name] of [[KK_A, 'כ"כ א'], [KK_B, 'כ"כ ב']]) {
    const snap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', taskId)))
    const existing = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    console.log(`\n${name} (${taskId}) - existing assignments:`, existing.map(a => `${soldierMap[a.soldier_id] ?? a.soldier_id} order=${a.order}`))

    // Check if already assigned
    const hagayAssigned = existing.some(a => a.soldier_id === hagay)
    const botzrAssigned = existing.some(a => a.soldier_id === botzr)
    const nextOrder = Math.max(...existing.map(a => a.order ?? 0), 0) + 1

    if (!hagayAssigned) {
      // בוצר is a commander (is_commander=true), give order=0 if no commander yet
      const hasCommander = existing.some(a => a.order === 0)
      const hagayOrder = hasCommander ? nextOrder : 0
      await addDoc(collection(db, 'assignments'), { task_id: taskId, soldier_id: hagay, order: hagayOrder })
      console.log(`  Added חגי (order=${hagayOrder})`)
    } else console.log('  חגי already assigned')

    if (!botzrAssigned) {
      const snap2 = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', taskId)))
      const existing2 = snap2.docs.map(d => d.data())
      const hasCommander2 = existing2.some(a => a.order === 0)
      const botzrOrder = hasCommander2 ? existing2.length : 0
      await addDoc(collection(db, 'assignments'), { task_id: taskId, soldier_id: botzr, order: botzrOrder })
      console.log(`  Added בוצר (order=${botzrOrder})`)
    } else console.log('  בוצר already assigned')
  }

  console.log('\nDone!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
