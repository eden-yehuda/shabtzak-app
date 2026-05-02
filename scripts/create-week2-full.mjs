import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where, addDoc, Timestamp } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw",
  authDomain: "shabtzak-app.firebaseapp.com",
  projectId: "shabtzak-app",
})
const db = getFirestore(app)
const WEEK2_ID = '8B2b9nS7Yu4x0boBxRzD'

// IL offset: UTC+3
// IL h:00 → UTC (h-3+24)%24 : 00Z
// Shifts: 06:00-14:00, 14:00-22:00, 22:00-06:00(+1d)
// UTC: 03:00-11:00, 11:00-19:00, 19:00-03:00(+1d)

const SHIFTS = [
  { startH: 3,  endH: 11, nextDay: false }, // 06:00-14:00 IL
  { startH: 11, endH: 19, nextDay: false }, // 14:00-22:00 IL
  { startH: 19, endH: 3,  nextDay: true  }, // 22:00-06:00 IL
]

function makeTS(dateStr, utcH, nextDay = false) {
  const d = new Date(`${dateStr}T${String(utcH).padStart(2,'0')}:00:00Z`)
  if (nextDay) d.setDate(d.getDate() + 1)
  return Timestamp.fromDate(d)
}

async function main() {
  // Get existing tasks to avoid duplicates
  const snap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', WEEK2_ID)))
  const existing = new Set()
  for (const t of snap.docs) {
    const d = t.data()
    const ilDate = new Date(d.start_datetime.toDate().getTime() + 3*3600000).toISOString().slice(0,10)
    const h = (d.start_datetime.toDate().getUTCHours() + 3) % 24
    existing.add(`${ilDate}_${d.task_type}_${h}`)
  }

  const TASK_DEFAULTS = {
    schedule_id: WEEK2_ID,
    required_people_count: 3,
    requires_commander: false,
    difficulty: 'normal',
    notes: '',
  }

  let created = 0

  async function maybeCreate(ilDate, type, shift) {
    const ilH = (shift.startH + 3) % 24  // convert UTC start to IL hour
    const key = `${ilDate}_${type}_${ilH}`
    if (existing.has(key)) return
    const start = makeTS(ilDate, shift.startH)
    const end   = makeTS(ilDate, shift.endH, shift.nextDay)
    await addDoc(collection(db, 'tasks'), {
      ...TASK_DEFAULTS,
      task_type: type,
      task_name: type,
      start_datetime: start,
      end_datetime: end,
    })
    console.log(`  ✓ ${ilDate} ${type} ${ilH}:00`)
    existing.add(key)
    created++
  }

  // May 3 (ראשון) — week starts at 14:00, so only shifts 14:00 and 22:00
  // (no 06:00 shift since week begins here)
  console.log('\n=== 3/5 ===')
  for (const type of ['כ"כ ב', 'כ"כ ג']) {
    await maybeCreate('2026-05-03', type, SHIFTS[1]) // 14:00
    await maybeCreate('2026-05-03', type, SHIFTS[2]) // 22:00
  }

  // May 4 (שני) — all 3 shifts, add כ"כ ב and כ"כ ג only (סיור + כ"כ א exist)
  console.log('\n=== 4/5 ===')
  for (const type of ['כ"כ ב', 'כ"כ ג']) {
    for (const shift of SHIFTS) await maybeCreate('2026-05-04', type, shift)
  }

  // May 5–9 — all 3 types × all 3 shifts
  const days = ['2026-05-05','2026-05-06','2026-05-07','2026-05-08','2026-05-09']
  for (const day of days) {
    console.log(`\n=== ${day.slice(5)} ===`)
    for (const type of ['סיור', 'כ"כ ב', 'כ"כ ג']) {
      for (const shift of SHIFTS) await maybeCreate(day, type, shift)
    }
  }

  console.log(`\n✅ נוצרו ${created} משימות`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
