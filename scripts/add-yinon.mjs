import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc, getDocs, query, where } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

const TARGAD_TASK_ID = 'VmHM2jKqulkJP1ZocVJw'

async function main() {
  // Add soldier
  const soldierRef = await addDoc(collection(db, 'soldiers'), {
    full_name: 'ינון אביטל',
    is_commander: false,
    is_active: true,
  })
  console.log(`Added soldier: ינון אביטל (${soldierRef.id})`)

  // Add to תרג"ד task
  // Find current max order
  const assignSnap = await getDocs(query(collection(db, 'assignments'), where('task_id', '==', TARGAD_TASK_ID)))
  const maxOrder = Math.max(...assignSnap.docs.map(d => d.data().order ?? 0))

  await addDoc(collection(db, 'assignments'), {
    task_id: TARGAD_TASK_ID,
    soldier_id: soldierRef.id,
    order: maxOrder + 1,
  })
  console.log(`Added to תרג"ד (order=${maxOrder + 1})`)

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
