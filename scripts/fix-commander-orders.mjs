import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

async function main() {
  const solSnap = await getDocs(collection(db, 'soldiers'))
  const soldierMap = Object.fromEntries(solSnap.docs.map(d => [d.id, d.data()]))
  const commanders = new Set(solSnap.docs.filter(d => d.data().is_commander).map(d => d.id))
  console.log('מפקדים:', [...commanders].map(id => soldierMap[id]?.full_name).join(', '))

  const assignSnap = await getDocs(collection(db, 'assignments'))
  const allAssigns = assignSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Group by task
  const byTask = {}
  for (const a of allAssigns) {
    if (!byTask[a.task_id]) byTask[a.task_id] = []
    byTask[a.task_id].push(a)
  }

  let fixed = 0
  for (const [taskId, assigns] of Object.entries(byTask)) {
    const commanderAssign = assigns.find(a => commanders.has(a.soldier_id))
    if (!commanderAssign) continue // no commander — nothing to fix

    if (commanderAssign.order === 0) continue // already at 0 — correct

    const name = soldierMap[commanderAssign.soldier_id]?.full_name

    // Who currently has order=0?
    const currentZero = assigns.find(a => a.order === 0 && a.id !== commanderAssign.id)

    if (currentZero) {
      // Swap: give current order=0 the commander's old order
      const oldCommanderOrder = commanderAssign.order ?? 1
      console.log(`Task ${taskId}: ${name} ${commanderAssign.order}→0, ${soldierMap[currentZero.soldier_id]?.full_name} 0→${oldCommanderOrder}`)
      await updateDoc(doc(db, 'assignments', commanderAssign.id), { order: 0 })
      await updateDoc(doc(db, 'assignments', currentZero.id), { order: oldCommanderOrder })
    } else {
      // Nobody at order=0 — just set commander to 0
      console.log(`Task ${taskId}: ${name} ${commanderAssign.order}→0 (no prior order-0)`)
      await updateDoc(doc(db, 'assignments', commanderAssign.id), { order: 0 })
    }
    fixed++
  }

  console.log(`\n✅ תוקנו ${fixed} משימות`)
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
