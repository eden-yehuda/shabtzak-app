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
  const bakrach = solSnap.docs.find(d => d.data().full_name?.includes('בכרך'))
  const lisha = solSnap.docs.find(d => d.data().full_name?.includes('לישה'))
  const eden = solSnap.docs.find(d => d.data().full_name?.includes('עדן'))
  console.log(`בכרך: ${bakrach?.id}, לישה: ${lisha?.id}, עדן: ${eden?.id}`)

  const assignSnap = await getDocs(collection(db, 'assignments'))
  const allAssigns = assignSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const taskSnap = await getDocs(collection(db, 'tasks'))
  const allTasks = taskSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Find tasks where BOTH bakrach AND lisha are assigned
  const taskIdsWithBakrach = new Set(allAssigns.filter(a=>a.soldier_id===bakrach?.id).map(a=>a.task_id))
  const taskIdsWithLisha = new Set(allAssigns.filter(a=>a.soldier_id===lisha?.id).map(a=>a.task_id))
  const sharedTasks = [...taskIdsWithBakrach].filter(id => taskIdsWithLisha.has(id))

  console.log('\nמשימות משותפות לבכרך ולישה:')
  for (const taskId of sharedTasks) {
    const task = allTasks.find(t => t.id === taskId)
    if (!task) continue
    const start = task.start_datetime?.toDate()
    const taskAssigns = allAssigns.filter(a=>a.task_id===taskId).sort((a,b)=>(a.order??99)-(b.order??99))
    const soldierMap = Object.fromEntries(solSnap.docs.map(d=>[d.id, d.data().full_name]))
    const assignList = taskAssigns.map(a=>`order=${a.order} ${soldierMap[a.soldier_id]}`).join(', ')
    console.log(`  ${task.task_name} ${start?.toLocaleString('he-IL')} — ${assignList}`)
    console.log(`    task_id=${taskId}`)
  }

  // Show all tasks where bakrach is order=0 (commander)
  console.log('\nכל המקומות שבכרך ב-order=0:')
  const bakrachOrder0 = allAssigns.filter(a=>a.soldier_id===bakrach?.id && a.order===0)
  for (const a of bakrachOrder0) {
    const task = allTasks.find(t=>t.id===a.task_id)
    const start = task?.start_datetime?.toDate()
    console.log(`  ${task?.task_name} ${start?.toLocaleString('he-IL')} (${a.id})`)
  }

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
