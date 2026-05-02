import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

async function main() {
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const idToName = {}
  for (const s of soldiersSnap.docs) idToName[s.id] = s.data().full_name

  const leaveSnap = await getDocs(collection(db, 'leave_requests'))
  const leaves = leaveSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  console.log(`סה"כ leave_requests: ${leaves.length}`)
  console.log('\n=== מאושרים (is_final=true) ===')

  const approved = leaves.filter(l => l.is_final && l.status === 'approved')
    .sort((a, b) => a.date.localeCompare(b.date) || (idToName[a.soldier_id] ?? '').localeCompare(idToName[b.soldier_id] ?? '', 'he'))

  for (const l of approved) {
    console.log(`  ${l.date} | ${idToName[l.soldier_id] ?? l.soldier_id}`)
  }

  console.log('\n=== ממתינים (pending) ===')
  const pending = leaves.filter(l => !l.is_final && l.status === 'pending')
    .sort((a, b) => a.date.localeCompare(b.date))
  for (const l of pending) {
    console.log(`  ${l.date} | ${idToName[l.soldier_id] ?? l.soldier_id}`)
  }

  console.log('\n=== לפי שם (מאושרים) ===')
  const byName = {}
  for (const l of approved) {
    const name = idToName[l.soldier_id] ?? l.soldier_id
    if (!byName[name]) byName[name] = []
    byName[name].push(l.date)
  }
  for (const [name, dates] of Object.entries(byName).sort()) {
    console.log(`  ${name}: ${dates.join(', ')}`)
  }

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
