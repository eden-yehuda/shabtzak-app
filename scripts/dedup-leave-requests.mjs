import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

async function main() {
  const snap = await getDocs(collection(db, 'leave_requests'))
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  console.log(`סה"כ רשומות לפני: ${all.length}`)

  // Group by soldier_id + date (keep the first, delete the rest)
  const seen = new Map() // key → first record id
  const toDelete = []

  for (const r of all) {
    const key = `${r.soldier_id}__${r.date}`
    if (!seen.has(key)) {
      seen.set(key, r.id)
    } else {
      toDelete.push(r.id)
    }
  }

  console.log(`כפילויות למחיקה: ${toDelete.length}`)

  for (const id of toDelete) {
    await deleteDoc(doc(db, 'leave_requests', id))
  }

  console.log(`✅ נמחקו ${toDelete.length} כפילויות`)
  console.log(`רשומות אחרי: ${all.length - toDelete.length}`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
