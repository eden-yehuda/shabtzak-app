import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw',
  authDomain: 'shabtzak-app.firebaseapp.com',
  projectId: 'shabtzak-app',
  storageBucket: 'shabtzak-app.firebasestorage.app',
  messagingSenderId: '207869926707',
  appId: '1:207869926707:web:544e65feac1c4a4a1e7246',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const fmt = d => d?.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour12: false }) ?? '?'

// Find week 7 schedule
const schedSnap = await getDocs(collection(db, 'schedules'))
const schedules = schedSnap.docs.map(d => ({ id: d.id, ...d.data() }))
const week7 = schedules.find(s => s.name?.includes('7') || s.name?.includes('שבע'))
if (!week7) {
  console.log('לא נמצא שבצק שבוע 7. כל השבצקים:')
  schedules.forEach(s => console.log(` - "${s.name}" day_start_hour=${s.day_start_hour}`))
  process.exit(0)
}
console.log(`שבצק: "${week7.name}" day_start_hour=${week7.day_start_hour}`)

// Find tasks without orderBy (no composite index needed)
const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('schedule_id', '==', week7.id)))
const tasks = tasksSnap.docs.map(d => {
  const data = d.data()
  const start = data.start_datetime?.toDate?.()
  const end = data.end_datetime?.toDate?.()
  return {
    id: d.id,
    type: data.task_type,
    start,
    end,
    durationH: start && end ? Math.round((end - start) / 3600000 * 10) / 10 : '?',
    time_display: data.time_display,
  }
}).sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0))

// Print כ"כ tasks
const kkTasks = tasks.filter(t => t.type?.includes('כ"כ') || t.type?.includes("כ''כ"))
console.log(`\nמשימות כ"כ (${kkTasks.length}):`)
kkTasks.forEach(t => {
  console.log(`  [${t.type}] ${fmt(t.start)} → ${fmt(t.end)} (${t.durationH}ש')`)
})

// Also show day_start_hour for all schedules for comparison
console.log('\nכל השבצקים:')
schedules.sort((a, b) => (a.start_datetime?.seconds ?? 0) - (b.start_datetime?.seconds ?? 0))
  .forEach(s => console.log(` - "${s.name}" day_start_hour=${s.day_start_hour}`))

process.exit(0)
