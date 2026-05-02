import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, addDoc, Timestamp } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'

// IL 22:00 Mon May 4 = UTC 19:00 May 4
// IL 02:00 Tue May 5 = UTC 23:00 May 4
const start = Timestamp.fromDate(new Date('2026-05-04T19:00:00Z'))
const end   = Timestamp.fromDate(new Date('2026-05-04T23:00:00Z'))

async function main() {
  const soldiersSnap = await getDocs(collection(db, 'soldiers'))
  const nameToId = {}
  for (const s of soldiersSnap.docs) nameToId[s.data().full_name] = s.id

  const find = name => {
    const id = nameToId[name]
    if (!id) { console.error('לא נמצא: ' + name); process.exit(1) }
    return id
  }

  const idAlman  = find('אופיר אלטמן')
  const idSimko  = find('טל סימקו')
  const idYinon  = find('ינון אביטל')
  const idBozer  = find('יהונתן בוצר')
  const idMaorL  = find('מאור לוי')
  const idAndrei = find('אנדריי טיאן')

  // Create סיור 22:00-02:00
  const siyurRef = await addDoc(collection(db, 'tasks'), {
    schedule_id: WEEK2_ID,
    task_type: 'סיור',
    task_name: 'סיור',
    start_datetime: start,
    end_datetime: end,
    required_people_count: 3,
    requires_commander: false,
    difficulty: 'normal',
    notes: '',
  })
  console.log('✓ נוצר סיור 22:00:', siyurRef.id)

  // Assign סיור: אלטמן(0), סימקו(1), ינון(2)
  for (const [order, sid] of [[0, idAlman], [1, idSimko], [2, idYinon]]) {
    await addDoc(collection(db, 'assignments'), { task_id: siyurRef.id, soldier_id: sid, order })
  }
  console.log('  שובצו: אלטמן, סימקו, ינון')

  // Create כ"כ א 22:00-02:00
  const kkaRef = await addDoc(collection(db, 'tasks'), {
    schedule_id: WEEK2_ID,
    task_type: 'כ"כ א',
    task_name: 'כ"כ א',
    start_datetime: start,
    end_datetime: end,
    required_people_count: 3,
    requires_commander: false,
    difficulty: 'normal',
    notes: '',
  })
  console.log('✓ נוצר כ"כ א 22:00:', kkaRef.id)

  // Assign כ"כ א: בוצר(0), מאור לוי(1), אנדריי(2)
  for (const [order, sid] of [[0, idBozer], [1, idMaorL], [2, idAndrei]]) {
    await addDoc(collection(db, 'assignments'), { task_id: kkaRef.id, soldier_id: sid, order })
  }
  console.log('  שובצו: בוצר, מאור לוי, אנדריי')

  console.log('\n✅ סיום')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
