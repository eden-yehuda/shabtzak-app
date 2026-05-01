import { initializeApp } from 'firebase/app'
import { getFirestore, getDocs, query, collection, where, doc, addDoc, Timestamp } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)

const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'

// ראשון 10:00 IL → שני 18:00 IL
// UTC: May 3 07:00 → May 4 15:00
const START = new Date('2026-05-03T07:00:00.000Z')
const END   = new Date('2026-05-04T15:00:00.000Z')

const SOLDIERS = [
  'אוראל אפנזר',
  'יהונתן בוצר',
  'אופיר אלטמן',
  'מאור לוי',
  'מאור כליפה',
  'חגי פייגנבום',
  'לאון',
  'נתן לדקוב',
  'ירין צור',
  'יגל משה',
  'מיתר לזימי',
  'טל סימקו',
  'ינון אביטל',
]

async function main() {
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const nameToId = {}
  for (const s of soldiersSnap.docs) {
    nameToId[s.data().full_name] = s.id
  }

  // Create the task
  const taskRef = await addDoc(collection(db, 'tasks'), {
    schedule_id: WEEK2_ID,
    task_type: 'תרג"ד',
    task_name: 'תרג"ד',
    start_datetime: Timestamp.fromDate(START),
    end_datetime: Timestamp.fromDate(END),
    notes: '',
    difficulty: 'normal',
    required_people_count: SOLDIERS.length,
    requires_commander: false,
  })
  console.log(`Created תרג"ד task: ${taskRef.id}`)
  console.log(`  ${START.toISOString()} → ${END.toISOString()}`)
  console.log(`  (ראשון 10:00 IL → שני 18:00 IL)`)

  // Add assignments (commanders first with order=0)
  const commanders = new Set(['אוראל אפנזר', 'יהונתן בוצר', 'אופיר אלטמן'])
  let cmdOrder = 0
  let solOrder = commanders.size

  for (const name of SOLDIERS) {
    const sid = nameToId[name]
    if (!sid) {
      console.log(`  WARNING: soldier not found: "${name}"`)
      continue
    }
    const order = commanders.has(name) ? cmdOrder++ : solOrder++
    await addDoc(collection(db, 'assignments'), {
      task_id: taskRef.id,
      soldier_id: sid,
      order,
    })
    console.log(`  + ${name} (order=${order})${commanders.has(name) ? ' ★' : ''}`)
  }

  console.log('\nDone!')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
