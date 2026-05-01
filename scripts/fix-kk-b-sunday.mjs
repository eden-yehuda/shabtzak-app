import { initializeApp } from 'firebase/app'
import { getFirestore, getDocs, query, collection, where, deleteDoc, doc, addDoc, updateDoc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

// כ"כ ב Sunday 02:00-14:00 in שבוע 1
const KK_B_SUNDAY = 'RT7PxHpPmLu8iBnUSByC'

// Desired order: דביר★, טל, אלמו, לישה, מיתר
const DESIRED = ['דביר משה', 'טל סימקו', 'עידן אלמו', 'נתניאל לישה', 'מיתר לזימי']

async function main() {
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const nameToId = {}
  for (const s of soldiersSnap.docs) nameToId[s.data().full_name] = s.id

  // Delete ALL existing assignments for this task
  const existingSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', KK_B_SUNDAY)))
  for (const a of existingSnap.docs) {
    await deleteDoc(doc(db, 'assignments', a.id))
    console.log(`Deleted assignment ${a.id}`)
  }

  // Add correct assignments in order
  for (let i = 0; i < DESIRED.length; i++) {
    const name = DESIRED[i]
    const id = nameToId[name]
    if (!id) { console.log(`WARNING: soldier not found: ${name}`); continue }
    await addDoc(collection(db, 'assignments'), { task_id: KK_B_SUNDAY, soldier_id: id, order: i })
    console.log(`Added ${name} (order=${i})`)
  }

  console.log('Done!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
