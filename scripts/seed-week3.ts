/**
 * Seed script for שבוע 3 schedule
 * Run: npx ts-node --project tsconfig.json scripts/seed-week3.ts
 *
 * Creates a new schedule without touching existing soldiers/leave data.
 * כוננות  — 8 soldiers, 3 shifts/day  (06-14 × 3, 14-22 × 3, 22-06 × 2)
 * סיור    — 3 soldiers, 1 midday shift (10:00-18:00)
 * תורן מטבח — 1 soldier, 12h shift   (06:00-18:00)
 * בלת"מ  — optional 24h              (06:00-06:00)
 */
import { initializeApp } from 'firebase/app'
import {
  getFirestore, collection, addDoc, getDocs, query, where, Timestamp,
} from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const app = initializeApp({
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
})
const db   = getFirestore(app)
const auth = getAuth(app)

// ─── Week 3 boundaries ──────────────────────────────────────────────────────
const WEEK_START = '2026-05-07'
const WEEK_DAYS  = 7          // 7 days: 2026-05-07 … 2026-05-13
const DAY_START_HOUR  = 6
const HOME_LEAVE_HOUR = 14

// Helper: build ISO datetime string for a given date and hour
function dt(dateStr: string, hour: number, minute = 0): string {
  return `${dateStr}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00`
}

// Add N days to a YYYY-MM-DD string
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Build all tasks for the week
function buildTasks(): Array<{
  task_type: string
  start: string
  end: string
  required_people_count: number
  requires_commander: boolean
}> {
  const tasks: ReturnType<typeof buildTasks> = []

  for (let i = 0; i < WEEK_DAYS; i++) {
    const day  = addDays(WEEK_START, i)
    const next = addDays(WEEK_START, i + 1)

    // כוננות — 3 shifts: 06-14 (3 soldiers), 14-22 (3 soldiers), 22-06 (2 soldiers)
    tasks.push({ task_type: 'כוננות', start: dt(day, 6),  end: dt(day, 14), required_people_count: 3, requires_commander: true  })
    tasks.push({ task_type: 'כוננות', start: dt(day, 14), end: dt(day, 22), required_people_count: 3, requires_commander: true  })
    tasks.push({ task_type: 'כוננות', start: dt(day, 22), end: dt(next, 6), required_people_count: 2, requires_commander: true  })

    // סיור — 1 midday shift per day (10:00-18:00), 3 soldiers
    tasks.push({ task_type: 'סיור', start: dt(day, 10), end: dt(day, 18), required_people_count: 3, requires_commander: true })

    // תורן מטבח — 12h (06:00-18:00), 1 soldier
    tasks.push({ task_type: 'תורן מטבח', start: dt(day, 6), end: dt(day, 18), required_people_count: 1, requires_commander: false })

    // בלת"מ — 24h optional (06:00-06:00 next day), 0 required (fill only if needed)
    tasks.push({ task_type: 'בלת"מ', start: dt(day, 6), end: dt(next, 6), required_people_count: 0, requires_commander: false })
  }

  return tasks
}

async function seed() {
  // Authenticate as admin so Firestore rules allow writes
  const email    = process.env.SEED_ADMIN_EMAIL    ?? process.env.NEXT_PUBLIC_DEMO_EMAIL    ?? 'admin@shabtzak.app'
  const password = process.env.SEED_ADMIN_PASSWORD ?? process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? ''
  if (!password) {
    console.error('Set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD in .env.local or pass env vars')
    process.exit(1)
  }

  console.log(`Signing in as ${email}...`)
  await signInWithEmailAndPassword(auth, email, password)
  console.log('Authenticated ✓')

  // Check if שבוע 3 schedule already exists to avoid duplicates
  const existing = await getDocs(query(collection(db, 'schedules'), where('name', '==', 'שבצ"ק שבוע 3')))
  if (!existing.empty) {
    console.warn('Schedule "שבצ"ק שבוע 3" already exists. Aborting to avoid duplicates.')
    process.exit(0)
  }

  // Create schedule document
  const weekEnd = addDays(WEEK_START, WEEK_DAYS)
  const scheduleRef = await addDoc(collection(db, 'schedules'), {
    name:             'שבצ"ק שבוע 3',
    status:           'draft',
    day_start_hour:   DAY_START_HOUR,
    home_leave_hour:  HOME_LEAVE_HOUR,
    start_datetime:   Timestamp.fromDate(new Date(dt(WEEK_START, DAY_START_HOUR))),
    end_datetime:     Timestamp.fromDate(new Date(dt(weekEnd,    DAY_START_HOUR))),
    created_by:       'seed-week3',
    created_at:       Timestamp.now(),
    updated_at:       Timestamp.now(),
  })
  console.log('Created schedule:', scheduleRef.id)

  // Create tasks
  const tasks = buildTasks()
  let count = 0
  for (const t of tasks) {
    await addDoc(collection(db, 'tasks'), {
      schedule_id:            scheduleRef.id,
      task_type:              t.task_type,
      task_name:              t.task_type,
      start_datetime:         Timestamp.fromDate(new Date(t.start)),
      end_datetime:           Timestamp.fromDate(new Date(t.end)),
      required_people_count:  t.required_people_count,
      requires_commander:     t.requires_commander,
      difficulty:             t.task_type === 'תורן מטבח' ? 'easy' : 'normal',
      notes:                  '',
    })
    count++
  }
  console.log(`Created ${count} tasks ✓`)
  console.log('Done! Open admin panel and navigate to שבוע 3 to start assigning soldiers.')
  process.exit(0)
}

seed().catch(e => { console.error(e); process.exit(1) })
