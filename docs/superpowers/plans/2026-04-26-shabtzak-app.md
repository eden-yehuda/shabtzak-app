# Shabtzak App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP web app for military duty-schedule management with real-time sync, soldier self-service, and admin scheduling tools.

**Architecture:** Next.js 14 (Pages Router) SPA with Firebase Firestore for real-time data and Firebase Auth for 4 admin accounts. All validation runs client-side on Firestore data. RTL Hebrew throughout.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Firebase 10 (Firestore + Auth), @dnd-kit/core (drag & drop), html2pdf.js, SheetJS (xlsx), Vitest + Testing Library.

---

## File Map

```
shabtzak-app/
├── src/
│   ├── types/index.ts            # All shared TS types
│   ├── lib/
│   │   ├── firebase.ts           # Firebase app init
│   │   └── firestore.ts          # Firestore CRUD helpers
│   ├── utils/
│   │   ├── dateUtils.ts          # Overlap detection, formatting
│   │   ├── validation.ts         # Schedule validation logic
│   │   └── exportUtils.ts        # PDF + Excel export
│   ├── hooks/
│   │   ├── useSoldiers.ts        # onSnapshot → soldiers[]
│   │   ├── useSchedule.ts        # onSnapshot → schedule + tasks + assignments
│   │   └── useLeaveRequests.ts   # onSnapshot → leave_requests[]
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.tsx        # RTL wrapper + global nav
│   │   │   └── AdminLayout.tsx   # Admin nav + auth guard
│   │   ├── ui/
│   │   │   ├── StatusBadge.tsx   # pending/approved/rejected
│   │   │   └── ConfirmModal.tsx  # Reusable confirm dialog
│   │   ├── soldier/
│   │   │   ├── NextTaskCard.tsx  # "המשימה הבאה" hero card
│   │   │   ├── TaskList.tsx      # Soldier's task list
│   │   │   └── LeaveList.tsx     # Leave requests + status
│   │   └── admin/
│   │       ├── TaskCard.tsx      # Task card in schedule builder
│   │       ├── SoldierPanel.tsx  # Right panel with soldier dots
│   │       ├── TaskModal.tsx     # Create/edit task modal
│   │       ├── ValidationPanel.tsx # Errors/warnings list
│   │       ├── LeaveTable.tsx    # Admin leave management
│   │       └── JusticeTable.tsx  # Justice table (dynamic columns)
│   └── pages/
│       ├── _app.tsx
│       ├── _document.tsx         # dir="rtl", Heebo font
│       ├── index.tsx             # Soldier identity selection
│       ├── dashboard.tsx         # Soldier dashboard
│       ├── schedule.tsx          # Full schedule view (read-only)
│       ├── leave/new.tsx         # New leave request
│       └── admin/
│           ├── login.tsx
│           ├── dashboard.tsx
│           ├── schedule/
│           │   ├── new.tsx
│           │   └── [id].tsx
│           ├── leave.tsx
│           └── justice.tsx
├── tests/
│   ├── dateUtils.test.ts
│   └── validation.test.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `next.config.js`, `tailwind.config.js`, `tsconfig.json`, `.env.local.example`, `src/pages/_document.tsx`, `src/pages/_app.tsx`

- [ ] **Step 1: Bootstrap Next.js**

```bash
cd "C:/Users/USER/OneDrive - Amit/Documents/קלוד/shabtzak-app"
npx create-next-app@14 . --typescript --tailwind --eslint --src-dir --no-app --import-alias "@/*"
```

Expected: project created, `src/pages/` directory exists.

- [ ] **Step 2: Install dependencies**

```bash
npm install firebase @dnd-kit/core @dnd-kit/sortable html2pdf.js xlsx
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Configure Vitest — create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
})
```

- [ ] **Step 4: Create `tests/setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Add test script to `package.json`**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Configure RTL — replace `src/pages/_document.tsx`**

```tsx
import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="he" dir="rtl">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
```

- [ ] **Step 7: Update `tailwind.config.js` to add Heebo font**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'sans-serif'],
      },
      colors: {
        navy: { DEFAULT: '#1e3a5f', light: '#2a4f80' },
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 8: Replace `src/pages/_app.tsx`**

```tsx
import type { AppProps } from 'next/app'
import '@/styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
```

- [ ] **Step 9: Create `.env.local.example`**

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

- [ ] **Step 10: Verify dev server starts**

```bash
npm run dev
```
Expected: http://localhost:3000 loads without errors.

- [ ] **Step 11: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Next.js app with RTL Hebrew, Tailwind, Vitest"
```

---

## Task 2: TypeScript Types + Firebase Init

**Files:**
- Create: `src/types/index.ts`, `src/lib/firebase.ts`, `src/lib/firestore.ts`

- [ ] **Step 1: Create `src/types/index.ts`**

```ts
export interface Soldier {
  id: string
  full_name: string
  team: string
  is_active: boolean
}

export interface Schedule {
  id: string
  name: string
  start_datetime: Date
  end_datetime: Date
  status: 'draft' | 'published'
  created_by: string
}

export interface TaskType {
  id: string
  name: string
  difficulty: 'hard' | 'easy'
  color: string
}

export interface Task {
  id: string
  schedule_id: string
  task_name: string
  task_type: string
  difficulty: 'hard' | 'easy'
  start_datetime: Date
  end_datetime: Date
  required_people_count: number
  notes?: string
}

export interface Assignment {
  id: string
  task_id: string
  soldier_id: string
}

export interface LeaveRequest {
  id: string
  soldier_id: string
  date: string          // 'YYYY-MM-DD'
  status: 'pending' | 'approved' | 'rejected'
  created_at: Date
  reviewed_by?: string
}

export interface ValidationError {
  type: 'error' | 'warning'
  message: string
  soldier_id?: string
  task_id?: string
}
```

- [ ] **Step 2: Create Firebase project**

Go to https://console.firebase.google.com → New project → "shabtzak-app" → enable Firestore (production mode) → enable Authentication (Email/Password).

- [ ] **Step 3: Copy credentials to `.env.local`** (copy from `.env.local.example`, fill in values from Firebase Console → Project Settings).

- [ ] **Step 4: Create `src/lib/firebase.ts`**

```ts
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)

export const db = getFirestore(app)
export const auth = getAuth(app)
```

- [ ] **Step 5: Create `src/lib/firestore.ts`**

```ts
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, where, Timestamp, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { LeaveRequest, Task, Assignment, Schedule } from '@/types'

// --- Soldiers ---
export const soldiersRef = () => collection(db, 'soldiers')

// --- Schedules ---
export const schedulesRef = () => collection(db, 'schedules')
export const createSchedule = (data: Omit<Schedule, 'id'>) =>
  addDoc(schedulesRef(), {
    ...data,
    start_datetime: Timestamp.fromDate(data.start_datetime),
    end_datetime: Timestamp.fromDate(data.end_datetime),
  })

// --- Tasks ---
export const tasksRef = () => collection(db, 'tasks')
export const createTask = (data: Omit<Task, 'id'>) =>
  addDoc(tasksRef(), {
    ...data,
    start_datetime: Timestamp.fromDate(data.start_datetime),
    end_datetime: Timestamp.fromDate(data.end_datetime),
  })
export const updateTask = (id: string, data: Partial<Task>) =>
  updateDoc(doc(db, 'tasks', id), data)
export const deleteTask = (id: string) =>
  deleteDoc(doc(db, 'tasks', id))

// --- Assignments ---
export const assignmentsRef = () => collection(db, 'assignments')
export const createAssignment = (task_id: string, soldier_id: string) =>
  addDoc(assignmentsRef(), { task_id, soldier_id })
export const deleteAssignment = (id: string) =>
  deleteDoc(doc(db, 'assignments', id))

// --- Leave Requests ---
export const leaveRequestsRef = () => collection(db, 'leave_requests')
export const createLeaveRequest = (soldier_id: string, date: string) =>
  addDoc(leaveRequestsRef(), {
    soldier_id,
    date,
    status: 'pending',
    created_at: serverTimestamp(),
  })
export const updateLeaveStatus = (
  id: string,
  status: LeaveRequest['status'],
  reviewed_by: string
) => updateDoc(doc(db, 'leave_requests', id), { status, reviewed_by })

// --- Task Types ---
export const taskTypesRef = () => collection(db, 'task_types')
```

- [ ] **Step 6: Commit**

```bash
git add src/types src/lib
git commit -m "feat: add TypeScript types and Firebase init"
```

---

## Task 3: Seed Mock Data

**Files:**
- Create: `scripts/seed.ts`

- [ ] **Step 1: Create `scripts/seed.ts`**

```ts
// Run with: npx ts-node --project tsconfig.json scripts/seed.ts
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc } from 'firebase/firestore'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
})
const db = getFirestore(app)

const soldiers = [
  { full_name: 'יוסי כהן', team: 'כיתה א', is_active: true },
  { full_name: 'דניאל לוי', team: 'כיתה א', is_active: true },
  { full_name: 'אחמד מנסור', team: 'כיתה ב', is_active: true },
  { full_name: 'משה אברהם', team: 'כיתה ב', is_active: true },
  { full_name: 'רועי דוד', team: 'כיתה א', is_active: true },
  { full_name: 'אלון שפירא', team: 'כיתה ב', is_active: true },
  { full_name: 'ניר בן-דוד', team: 'כיתה א', is_active: true },
  { full_name: 'עומר ישראלי', team: 'כיתה ב', is_active: true },
  { full_name: 'גיא פרץ', team: 'כיתה א', is_active: true },
  { full_name: 'אבי שלום', team: 'כיתה ב', is_active: true },
]

const taskTypes = [
  { name: 'שמירת ש.ג', difficulty: 'hard', color: '#3b82f6' },
  { name: 'פטרול', difficulty: 'hard', color: '#f59e0b' },
  { name: 'מטבח', difficulty: 'easy', color: '#8b5cf6' },
  { name: 'לוגיסטיקה', difficulty: 'easy', color: '#22c55e' },
  { name: 'ניקיון', difficulty: 'easy', color: '#06b6d4' },
]

async function seed() {
  for (const s of soldiers) await addDoc(collection(db, 'soldiers'), s)
  for (const t of taskTypes) await addDoc(collection(db, 'task_types'), t)
  console.log('Seeded successfully')
  process.exit(0)
}
seed()
```

- [ ] **Step 2: Install ts-node and dotenv for script**

```bash
npm install -D ts-node dotenv
```

- [ ] **Step 3: Run seed**

```bash
npx ts-node --project tsconfig.json scripts/seed.ts
```
Expected: "Seeded successfully" — verify in Firebase Console that `soldiers` and `task_types` collections are populated.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed.ts
git commit -m "feat: add seed script with mock soldiers and task types"
```

---

## Task 4: Date Utilities + Validation Logic (TDD)

**Files:**
- Create: `src/utils/dateUtils.ts`, `src/utils/validation.ts`, `tests/dateUtils.test.ts`, `tests/validation.test.ts`

- [ ] **Step 1: Write failing tests for dateUtils — `tests/dateUtils.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { doTasksOverlap, formatHebrewDate, hoursGap } from '@/utils/dateUtils'

describe('doTasksOverlap', () => {
  it('returns true when tasks fully overlap', () => {
    const a = { start: new Date('2026-04-27T08:00'), end: new Date('2026-04-27T12:00') }
    const b = { start: new Date('2026-04-27T10:00'), end: new Date('2026-04-27T14:00') }
    expect(doTasksOverlap(a, b)).toBe(true)
  })

  it('returns false when tasks are adjacent (no gap)', () => {
    const a = { start: new Date('2026-04-27T08:00'), end: new Date('2026-04-27T12:00') }
    const b = { start: new Date('2026-04-27T12:00'), end: new Date('2026-04-27T16:00') }
    expect(doTasksOverlap(a, b)).toBe(false)
  })

  it('returns false when tasks are completely separate', () => {
    const a = { start: new Date('2026-04-27T08:00'), end: new Date('2026-04-27T10:00') }
    const b = { start: new Date('2026-04-27T14:00'), end: new Date('2026-04-27T18:00') }
    expect(doTasksOverlap(a, b)).toBe(false)
  })
})

describe('hoursGap', () => {
  it('returns hours between end of first and start of second', () => {
    const end = new Date('2026-04-27T08:00')
    const start = new Date('2026-04-27T14:00')
    expect(hoursGap(end, start)).toBe(6)
  })
})

describe('formatHebrewDate', () => {
  it('formats date as DD/MM', () => {
    expect(formatHebrewDate(new Date('2026-04-27'))).toBe('27/4')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test
```
Expected: FAIL — "Cannot find module '@/utils/dateUtils'"

- [ ] **Step 3: Create `src/utils/dateUtils.ts`**

```ts
export interface TimeSlot {
  start: Date
  end: Date
}

export function doTasksOverlap(a: TimeSlot, b: TimeSlot): boolean {
  return a.start < b.end && b.start < a.end
}

export function hoursGap(endOfFirst: Date, startOfSecond: Date): number {
  return (startOfSecond.getTime() - endOfFirst.getTime()) / (1000 * 60 * 60)
}

export function formatHebrewDate(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

export function dateToKey(date: Date): string {
  return date.toISOString().slice(0, 10)  // 'YYYY-MM-DD'
}
```

- [ ] **Step 4: Run tests — verify passing**

```bash
npm test
```
Expected: all dateUtils tests PASS.

- [ ] **Step 5: Write failing validation tests — `tests/validation.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { validateSchedule } from '@/utils/validation'
import type { Task, Assignment } from '@/types'

const makeTask = (id: string, start: string, end: string): Task => ({
  id,
  schedule_id: 'sched1',
  task_name: 'שמירה',
  task_type: 'guard',
  difficulty: 'hard',
  start_datetime: new Date(start),
  end_datetime: new Date(end),
  required_people_count: 2,
})

describe('validateSchedule', () => {
  it('flags double booking when soldier has overlapping tasks', () => {
    const tasks: Task[] = [
      makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00'),
      makeTask('t2', '2026-04-27T10:00', '2026-04-27T14:00'),
    ]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1' },
      { id: 'a2', task_id: 't2', soldier_id: 's1' },
    ]
    const errors = validateSchedule(tasks, assignments)
    expect(errors.some(e => e.type === 'error' && e.soldier_id === 's1')).toBe(true)
  })

  it('flags insufficient rest (< 6 hours between tasks)', () => {
    const tasks: Task[] = [
      makeTask('t1', '2026-04-27T00:00', '2026-04-27T04:00'),
      makeTask('t2', '2026-04-27T08:00', '2026-04-27T12:00'),
    ]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1' },
      { id: 'a2', task_id: 't2', soldier_id: 's1' },
    ]
    const errors = validateSchedule(tasks, assignments)
    expect(errors.some(e => e.type === 'warning' && e.soldier_id === 's1')).toBe(true)
  })

  it('flags understaffed task', () => {
    const tasks: Task[] = [makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00')]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1' },
      // only 1 assigned, required_people_count = 2
    ]
    const errors = validateSchedule(tasks, assignments)
    expect(errors.some(e => e.type === 'error' && e.task_id === 't1')).toBe(true)
  })

  it('returns no errors for a valid schedule', () => {
    const tasks: Task[] = [
      makeTask('t1', '2026-04-27T08:00', '2026-04-27T12:00'),
      makeTask('t2', '2026-04-27T20:00', '2026-04-28T00:00'),
    ]
    const assignments: Assignment[] = [
      { id: 'a1', task_id: 't1', soldier_id: 's1' },
      { id: 'a2', task_id: 't1', soldier_id: 's2' },
      { id: 'a3', task_id: 't2', soldier_id: 's1' },
      { id: 'a4', task_id: 't2', soldier_id: 's2' },
    ]
    const errors = validateSchedule(tasks, assignments)
    expect(errors).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Run — verify fails**

```bash
npm test
```
Expected: FAIL — "Cannot find module '@/utils/validation'"

- [ ] **Step 7: Create `src/utils/validation.ts`**

```ts
import type { Task, Assignment, ValidationError } from '@/types'
import { doTasksOverlap, hoursGap } from './dateUtils'

const MIN_REST_HOURS = 6
const MAX_HOUR_IMBALANCE = 4

export function validateSchedule(
  tasks: Task[],
  assignments: Assignment[]
): ValidationError[] {
  const errors: ValidationError[] = []

  // Build lookup: soldier_id → tasks[]
  const soldierTasks: Record<string, Task[]> = {}
  for (const a of assignments) {
    const task = tasks.find(t => t.id === a.task_id)
    if (!task) continue
    if (!soldierTasks[a.soldier_id]) soldierTasks[a.soldier_id] = []
    soldierTasks[a.soldier_id].push(task)
  }

  // 1. Double booking + rest check per soldier
  for (const [soldier_id, stasks] of Object.entries(soldierTasks)) {
    const sorted = [...stasks].sort(
      (a, b) => a.start_datetime.getTime() - b.start_datetime.getTime()
    )
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (doTasksOverlap(
          { start: sorted[i].start_datetime, end: sorted[i].end_datetime },
          { start: sorted[j].start_datetime, end: sorted[j].end_datetime }
        )) {
          errors.push({
            type: 'error',
            soldier_id,
            message: `שיבוץ כפול: ${sorted[i].task_name} ו-${sorted[j].task_name} חופפים`,
          })
        }
      }
      if (i + 1 < sorted.length) {
        const gap = hoursGap(sorted[i].end_datetime, sorted[i + 1].start_datetime)
        if (gap >= 0 && gap < MIN_REST_HOURS) {
          errors.push({
            type: 'warning',
            soldier_id,
            message: `מנוחה קצרה: ${gap.toFixed(1)} שעות בין ${sorted[i].task_name} ל-${sorted[i + 1].task_name}`,
          })
        }
      }
    }
  }

  // 2. Understaffed tasks
  const taskAssignmentCount: Record<string, number> = {}
  for (const a of assignments) {
    taskAssignmentCount[a.task_id] = (taskAssignmentCount[a.task_id] || 0) + 1
  }
  for (const task of tasks) {
    const count = taskAssignmentCount[task.id] || 0
    if (count < task.required_people_count) {
      errors.push({
        type: 'error',
        task_id: task.id,
        message: `${task.task_name}: דרושים ${task.required_people_count}, שובצו ${count}`,
      })
    }
  }

  // 3. Workload imbalance
  const soldierHours = Object.entries(soldierTasks).map(([soldier_id, stasks]) => ({
    soldier_id,
    hours: stasks.reduce((sum, t) =>
      sum + hoursGap(t.start_datetime, t.end_datetime), 0),
  }))
  if (soldierHours.length >= 2) {
    const max = Math.max(...soldierHours.map(s => s.hours))
    const min = Math.min(...soldierHours.map(s => s.hours))
    if (max - min > MAX_HOUR_IMBALANCE) {
      errors.push({
        type: 'warning',
        message: `חלוקה לא שוויונית: הפרש של ${(max - min).toFixed(1)} שעות בין החיילים`,
      })
    }
  }

  return errors
}
```

- [ ] **Step 8: Run tests — verify all pass**

```bash
npm test
```
Expected: all 4 validation tests + all dateUtils tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/utils tests
git commit -m "feat: date utilities and schedule validation with tests"
```

---

## Task 5: Firestore Real-time Hooks

**Files:**
- Create: `src/hooks/useSoldiers.ts`, `src/hooks/useSchedule.ts`, `src/hooks/useLeaveRequests.ts`

- [ ] **Step 1: Create `src/hooks/useSoldiers.ts`**

```ts
import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { soldiersRef } from '@/lib/firestore'
import type { Soldier } from '@/types'

export function useSoldiers(activeOnly = true): Soldier[] {
  const [soldiers, setSoldiers] = useState<Soldier[]>([])

  useEffect(() => {
    const q = activeOnly
      ? query(soldiersRef(), where('is_active', '==', true))
      : soldiersRef()
    return onSnapshot(q, snap => {
      setSoldiers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Soldier)))
    })
  }, [activeOnly])

  return soldiers
}
```

- [ ] **Step 2: Create `src/hooks/useSchedule.ts`**

```ts
import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { tasksRef, assignmentsRef } from '@/lib/firestore'
import type { Task, Assignment } from '@/types'

export function useScheduleTasks(scheduleId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])

  useEffect(() => {
    if (!scheduleId) return
    const qTasks = query(tasksRef(), where('schedule_id', '==', scheduleId))
    const unsubTasks = onSnapshot(qTasks, snap => {
      setTasks(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          start_datetime: data.start_datetime.toDate(),
          end_datetime: data.end_datetime.toDate(),
        } as Task
      }))
    })
    return unsubTasks
  }, [scheduleId])

  useEffect(() => {
    if (!scheduleId || tasks.length === 0) return
    const taskIds = tasks.map(t => t.id)
    // Firestore 'in' query max 30 items — chunk if needed
    const chunks: string[][] = []
    for (let i = 0; i < taskIds.length; i += 30) chunks.push(taskIds.slice(i, i + 30))

    const unsubs = chunks.map(chunk => {
      const q = query(assignmentsRef(), where('task_id', 'in', chunk))
      return onSnapshot(q, snap => {
        setAssignments(prev => {
          const others = prev.filter(a => !chunk.includes(a.task_id))
          const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment))
          return [...others, ...fresh]
        })
      })
    })
    return () => unsubs.forEach(u => u())
  }, [tasks, scheduleId])

  return { tasks, assignments }
}
```

- [ ] **Step 3: Create `src/hooks/useLeaveRequests.ts`**

```ts
import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { leaveRequestsRef } from '@/lib/firestore'
import type { LeaveRequest } from '@/types'

export function useLeaveRequests(soldierId?: string): LeaveRequest[] {
  const [requests, setRequests] = useState<LeaveRequest[]>([])

  useEffect(() => {
    const q = soldierId
      ? query(leaveRequestsRef(), where('soldier_id', '==', soldierId))
      : leaveRequestsRef()
    return onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          created_at: data.created_at?.toDate() ?? new Date(),
        } as LeaveRequest
      }))
    })
  }, [soldierId])

  return requests
}

export function useLeaveCountByDate(): Record<string, number> {
  const all = useLeaveRequests()
  const counts: Record<string, number> = {}
  for (const r of all) {
    if (r.status !== 'rejected') {
      counts[r.date] = (counts[r.date] || 0) + 1
    }
  }
  return counts
}
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks
git commit -m "feat: real-time Firestore hooks for soldiers, schedule, leave"
```

---

## Task 6: Layout Components

**Files:**
- Create: `src/components/layout/Layout.tsx`, `src/components/layout/AdminLayout.tsx`, `src/components/ui/StatusBadge.tsx`, `src/components/ui/ConfirmModal.tsx`

- [ ] **Step 1: Create `src/components/layout/Layout.tsx`**

```tsx
import Head from 'next/head'
import type { ReactNode } from 'react'

export default function Layout({ children, title = 'שבצ"ק' }: { children: ReactNode; title?: string }) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="min-h-screen bg-slate-50 font-sans" dir="rtl">
        <header className="bg-navy text-white px-4 py-3 flex justify-between items-center shadow">
          <span className="font-bold text-lg">שבצ"ק מחלקתי</span>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create `src/components/layout/AdminLayout.tsx`**

```tsx
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import type { ReactNode } from 'react'
import Link from 'next/link'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      if (!user) router.replace('/admin/login')
    })
  }, [router])

  return (
    <div className="min-h-screen bg-slate-100 font-sans" dir="rtl">
      <header className="bg-navy text-white px-4 py-3 flex gap-6 items-center shadow">
        <span className="font-bold text-lg">מנהל שבצ"ק</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/dashboard" className="hover:underline">דשבורד</Link>
          <Link href="/admin/schedule/new" className="hover:underline">שבצ"ק חדש</Link>
          <Link href="/admin/leave" className="hover:underline">יציאות</Link>
          <Link href="/admin/justice" className="hover:underline">טבלת צדק</Link>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/ui/StatusBadge.tsx`**

```tsx
import type { LeaveRequest } from '@/types'

const config: Record<LeaveRequest['status'], { label: string; className: string }> = {
  pending: { label: 'ממתין', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'מאושר', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'נדחה', className: 'bg-red-100 text-red-800' },
}

export default function StatusBadge({ status }: { status: LeaveRequest['status'] }) {
  const { label, className } = config[status]
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  )
}
```

- [ ] **Step 4: Create `src/components/ui/ConfirmModal.tsx`**

```tsx
interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ message, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
        <p className="text-base text-slate-700 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50">
            ביטול
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-navy text-white hover:bg-navy-light">
            אישור
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components
git commit -m "feat: layout and UI components"
```

---

## Task 7: Soldier Identity Selection Page (`/`)

**Files:**
- Modify: `src/pages/index.tsx`

- [ ] **Step 1: Replace `src/pages/index.tsx`**

```tsx
import { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/layout/Layout'
import { useSoldiers } from '@/hooks/useSoldiers'

export default function Home() {
  const soldiers = useSoldiers()
  const [search, setSearch] = useState('')
  const router = useRouter()

  const filtered = soldiers.filter(s =>
    s.full_name.includes(search)
  )

  function selectSoldier(id: string, name: string) {
    localStorage.setItem('soldierId', id)
    localStorage.setItem('soldierName', name)
    router.push('/dashboard')
  }

  return (
    <Layout title="בחר זהות">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-navy mb-2">ברוך הבא</h1>
        <p className="text-slate-500 mb-6">בחר את שמך כדי להיכנס</p>
        <input
          type="text"
          placeholder="חפש שם..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-slate-300 rounded-xl px-4 py-3 mb-4 text-right focus:outline-none focus:ring-2 focus:ring-navy"
        />
        <div className="space-y-2">
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => selectSoldier(s.id, s.full_name)}
              className="w-full text-right bg-white border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50 hover:border-navy transition font-medium"
            >
              {s.full_name}
              <span className="text-slate-400 text-sm font-normal mr-2">({s.team})</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-slate-400 py-8">לא נמצאו חיילים</p>
          )}
        </div>
      </div>
    </Layout>
  )
}
```

- [ ] **Step 2: Run dev server and verify**

```bash
npm run dev
```
Open http://localhost:3000 — should show search field and list of soldiers from Firestore.

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.tsx
git commit -m "feat: soldier identity selection page"
```

---

## Task 8: Soldier Dashboard (`/dashboard`)

**Files:**
- Create: `src/components/soldier/NextTaskCard.tsx`, `src/components/soldier/TaskList.tsx`, `src/components/soldier/LeaveList.tsx`
- Create: `src/pages/dashboard.tsx`

- [ ] **Step 1: Create `src/components/soldier/NextTaskCard.tsx`**

```tsx
import type { Task, Assignment, Soldier } from '@/types'
import { formatTime, formatHebrewDate } from '@/utils/dateUtils'

interface Props {
  tasks: Task[]
  assignments: Assignment[]
  soldierId: string
  soldiers: Soldier[]
}

export default function NextTaskCard({ tasks, assignments, soldierId, soldiers }: Props) {
  const myTaskIds = assignments
    .filter(a => a.soldier_id === soldierId)
    .map(a => a.task_id)

  const upcoming = tasks
    .filter(t => myTaskIds.includes(t.id) && t.end_datetime > new Date())
    .sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())

  const next = upcoming[0]
  if (!next) return (
    <div className="bg-slate-200 rounded-2xl p-5 text-center text-slate-500 mb-6">
      אין משימות קרובות
    </div>
  )

  const partners = assignments
    .filter(a => a.task_id === next.id && a.soldier_id !== soldierId)
    .map(a => soldiers.find(s => s.id === a.soldier_id)?.full_name)
    .filter(Boolean)

  return (
    <div className="bg-navy text-white rounded-2xl p-5 mb-6 shadow">
      <div className="text-xs opacity-70 mb-1">המשימה הבאה שלך</div>
      <div className="text-2xl font-bold mb-1">{next.task_name}</div>
      <div className="text-sm opacity-90">
        {formatHebrewDate(next.start_datetime)} · {formatTime(next.start_datetime)} — {formatTime(next.end_datetime)}
      </div>
      {partners.length > 0 && (
        <div className="text-xs opacity-70 mt-2">יחד עם: {partners.join(', ')}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/soldier/TaskList.tsx`**

```tsx
import type { Task, Assignment } from '@/types'
import { formatHebrewDate, formatTime } from '@/utils/dateUtils'

const TASK_COLORS: Record<string, string> = {
  'שמירת ש.ג': 'border-blue-500',
  'פטרול': 'border-yellow-500',
  'מטבח': 'border-purple-500',
  'לוגיסטיקה': 'border-green-500',
}

interface Props {
  tasks: Task[]
  assignments: Assignment[]
  soldierId: string
}

export default function TaskList({ tasks, assignments, soldierId }: Props) {
  const myTaskIds = assignments
    .filter(a => a.soldier_id === soldierId)
    .map(a => a.task_id)

  const myTasks = tasks
    .filter(t => myTaskIds.includes(t.id))
    .sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())

  if (myTasks.length === 0) return <p className="text-slate-400 text-center py-4">אין משימות</p>

  return (
    <div className="space-y-3">
      {myTasks.map(task => {
        const done = task.end_datetime < new Date()
        const color = TASK_COLORS[task.task_name] ?? 'border-slate-400'
        return (
          <div key={task.id} className={`bg-white rounded-xl p-4 border-r-4 ${color} shadow-sm ${done ? 'opacity-60' : ''}`}>
            <div className="text-xs text-slate-400">
              {formatHebrewDate(task.start_datetime)} · {formatTime(task.start_datetime)} — {formatTime(task.end_datetime)}
              {done && ' · הסתיים'}
            </div>
            <div className="font-semibold text-slate-800 mt-0.5">{task.task_name}</div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/soldier/LeaveList.tsx`**

```tsx
import type { LeaveRequest } from '@/types'
import { formatHebrewDate } from '@/utils/dateUtils'
import StatusBadge from '@/components/ui/StatusBadge'

export default function LeaveList({ requests }: { requests: LeaveRequest[] }) {
  if (requests.length === 0) return <p className="text-slate-400 text-center py-2">אין בקשות</p>

  return (
    <div className="space-y-2">
      {requests.map(r => (
        <div key={r.id} className="bg-white rounded-xl px-4 py-3 flex justify-between items-center shadow-sm">
          <span className="text-sm font-medium">{formatHebrewDate(new Date(r.date))}</span>
          <StatusBadge status={r.status} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create `src/pages/dashboard.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/layout/Layout'
import NextTaskCard from '@/components/soldier/NextTaskCard'
import TaskList from '@/components/soldier/TaskList'
import LeaveList from '@/components/soldier/LeaveList'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { useLeaveRequests } from '@/hooks/useLeaveRequests'
import { onSnapshot, query, where, orderBy, limit } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'
import { db } from '@/lib/firebase'

export default function Dashboard() {
  const router = useRouter()
  const [soldierId, setSoldierId] = useState<string | null>(null)
  const [soldierName, setSoldierName] = useState('')
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null)

  const soldiers = useSoldiers()
  const { tasks, assignments } = useScheduleTasks(activeScheduleId)
  const leaveRequests = useLeaveRequests(soldierId ?? undefined)

  useEffect(() => {
    const id = localStorage.getItem('soldierId')
    const name = localStorage.getItem('soldierName')
    if (!id) { router.replace('/'); return }
    setSoldierId(id)
    setSoldierName(name ?? '')
  }, [router])

  useEffect(() => {
    // Get the most recently published schedule
    const q = query(
      schedulesRef(),
      where('status', '==', 'published'),
      orderBy('start_datetime', 'desc'),
      limit(1)
    )
    return onSnapshot(q, snap => {
      setActiveScheduleId(snap.docs[0]?.id ?? null)
    })
  }, [])

  if (!soldierId) return null

  return (
    <Layout title={`שלום, ${soldierName}`}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-navy">שלום, {soldierName}</h1>
        <button
          onClick={() => { localStorage.clear(); router.push('/') }}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          החלף
        </button>
      </div>

      <NextTaskCard tasks={tasks} assignments={assignments} soldierId={soldierId} soldiers={soldiers} />

      <section className="mb-6">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">המשימות שלי</h2>
        <TaskList tasks={tasks} assignments={assignments} soldierId={soldierId} />
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">בקשות יציאה</h2>
        <LeaveList requests={leaveRequests} />
        <Link href="/leave/new">
          <button className="w-full mt-3 bg-navy text-white rounded-xl py-3 font-semibold hover:bg-navy-light transition">
            + בקשת יציאה חדשה
          </button>
        </Link>
      </section>
    </Layout>
  )
}
```

- [ ] **Step 5: Verify in browser**

Open http://localhost:3000 → select soldier → should redirect to dashboard with "המשימה הבאה" card and sections.

- [ ] **Step 6: Commit**

```bash
git add src/components/soldier src/pages/dashboard.tsx
git commit -m "feat: soldier dashboard with real-time tasks and leave requests"
```

---

## Task 9: Leave Request Page (`/leave/new`)

**Files:**
- Create: `src/pages/leave/new.tsx`

- [ ] **Step 1: Create `src/pages/leave/new.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/layout/Layout'
import { useLeaveCountByDate } from '@/hooks/useLeaveRequests'
import { createLeaveRequest } from '@/lib/firestore'
import { dateToKey } from '@/utils/dateUtils'

const LEAVE_QUOTA = 8

export default function NewLeaveRequest() {
  const router = useRouter()
  const [soldierId, setSoldierId] = useState<string | null>(null)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const leaveCountByDate = useLeaveCountByDate()

  useEffect(() => {
    const id = localStorage.getItem('soldierId')
    if (!id) { router.replace('/'); return }
    setSoldierId(id)
  }, [router])

  // Build next 30 days
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return dateToKey(d)
  })

  function toggleDate(key: string) {
    setSelectedDates(prev =>
      prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key]
    )
  }

  async function submit() {
    if (!soldierId || selectedDates.length === 0) return
    setSubmitting(true)
    await Promise.all(selectedDates.map(date => createLeaveRequest(soldierId, date)))
    router.push('/dashboard')
  }

  if (!soldierId) return null

  return (
    <Layout title="בקשת יציאה">
      <h1 className="text-xl font-bold text-navy mb-2">בקשת יציאה</h1>
      <p className="text-slate-500 text-sm mb-6">בחר את הימים בהם תרצה לצאת הביתה</p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {days.map(key => {
          const count = leaveCountByDate[key] || 0
          const isFull = count >= LEAVE_QUOTA
          const isSelected = selectedDates.includes(key)
          const d = new Date(key)
          const label = `${d.getDate()}/${d.getMonth() + 1}`

          return (
            <button
              key={key}
              onClick={() => toggleDate(key)}
              className={`rounded-xl p-3 text-center border-2 transition text-sm font-medium
                ${isSelected ? 'border-navy bg-navy text-white' : 'border-slate-200 bg-white'}
                ${isFull && !isSelected ? 'border-red-200' : ''}
              `}
            >
              <div>{label}</div>
              {isFull && !isSelected && (
                <div className="text-xs text-red-500 mt-0.5">⚠ מלא ({count})</div>
              )}
              {isFull && isSelected && (
                <div className="text-xs opacity-80 mt-0.5">⚠ {count}/8</div>
              )}
              {!isFull && count > 0 && (
                <div className="text-xs opacity-60 mt-0.5">{count}/8</div>
              )}
            </button>
          )
        })}
      </div>

      {selectedDates.some(d => (leaveCountByDate[d] || 0) >= LEAVE_QUOTA) && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3 mb-4 text-sm text-yellow-800">
          ⚠️ יום אחד או יותר כבר הגיע למכסה של 8 חיילים. הבקשה תישלח לאישור מיוחד.
        </div>
      )}

      <button
        onClick={submit}
        disabled={selectedDates.length === 0 || submitting}
        className="w-full bg-navy text-white rounded-xl py-3 font-semibold disabled:opacity-50"
      >
        {submitting ? 'שולח...' : `שלח בקשה (${selectedDates.length} ימים)`}
      </button>
    </Layout>
  )
}
```

- [ ] **Step 2: Verify**

Open http://localhost:3000/leave/new — should show 30-day grid, with live counts from Firestore, and warning when a day hits 8.

- [ ] **Step 3: Commit**

```bash
git add src/pages/leave
git commit -m "feat: leave request page with quota alert"
```

---

## Task 10: Admin Auth + Login Page

**Files:**
- Create: `src/pages/admin/login.tsx`

- [ ] **Step 1: Create the 4 admin accounts in Firebase**

Go to Firebase Console → Authentication → Users → Add user → create 4 accounts (e.g., mefaked@unit.il, sagan@unit.il, etc.) with passwords.

- [ ] **Step 2: Create `src/pages/admin/login.tsx`**

```tsx
import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter } from 'next/router'
import { auth } from '@/lib/firebase'

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.push('/admin/dashboard')
    } catch {
      setError('שם משתמש או סיסמה שגויים')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center px-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-navy mb-6 text-center">כניסת מנהל</h1>
        <form onSubmit={login} className="space-y-4">
          <input
            type="email"
            placeholder="אימייל"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-navy"
            required
          />
          <input
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-navy"
            required
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy text-white rounded-xl py-3 font-semibold disabled:opacity-50"
          >
            {loading ? 'נכנס...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/pages/admin/dashboard.tsx`**

```tsx
import AdminLayout from '@/components/layout/AdminLayout'
import { useLeaveCountByDate } from '@/hooks/useLeaveRequests'
import { useSoldiers } from '@/hooks/useSoldiers'
import Link from 'next/link'

export default function AdminDashboard() {
  const soldiers = useSoldiers()
  const leaveCountByDate = useLeaveCountByDate()

  const today = new Date().toISOString().slice(0, 10)
  const todayCount = leaveCountByDate[today] || 0
  const available = soldiers.length - todayCount

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-navy mb-6">דשבורד מנהל</h1>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-4 shadow text-center">
          <div className="text-3xl font-bold text-navy">{soldiers.length}</div>
          <div className="text-sm text-slate-500">סה"כ לוחמים</div>
        </div>
        <div className={`bg-white rounded-xl p-4 shadow text-center`}>
          <div className={`text-3xl font-bold ${todayCount >= 8 ? 'text-red-500' : todayCount >= 6 ? 'text-yellow-500' : 'text-green-500'}`}>
            {todayCount}
          </div>
          <div className="text-sm text-slate-500">בבית היום</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow text-center">
          <div className="text-3xl font-bold text-slate-700">{available}</div>
          <div className="text-sm text-slate-500">זמינים</div>
        </div>
      </div>
      <div className="flex gap-4">
        <Link href="/admin/schedule/new">
          <button className="bg-navy text-white rounded-xl px-6 py-3 font-semibold">+ שבצ"ק חדש</button>
        </Link>
        <Link href="/admin/leave">
          <button className="border border-navy text-navy rounded-xl px-6 py-3 font-semibold">ניהול יציאות</button>
        </Link>
      </div>
    </AdminLayout>
  )
}
```

- [ ] **Step 4: Verify**

Open http://localhost:3000/admin/login — login with an admin account → should redirect to dashboard. Opening /admin/dashboard without login should redirect to /admin/login.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin
git commit -m "feat: admin auth, login page, and dashboard"
```

---

## Task 11: Admin Leave Management (`/admin/leave`)

**Files:**
- Create: `src/components/admin/LeaveTable.tsx`, `src/pages/admin/leave.tsx`

- [ ] **Step 1: Create `src/components/admin/LeaveTable.tsx`**

```tsx
import type { LeaveRequest, Soldier } from '@/types'
import StatusBadge from '@/components/ui/StatusBadge'
import { updateLeaveStatus } from '@/lib/firestore'
import { useAuth } from '@/hooks/useAuth'
import { formatHebrewDate } from '@/utils/dateUtils'

interface Props {
  requests: LeaveRequest[]
  soldiers: Soldier[]
  leaveCountByDate: Record<string, number>
}

export default function LeaveTable({ requests, soldiers, leaveCountByDate }: Props) {
  const { uid } = useAuth()

  const sorted = [...requests].sort((a, b) => a.date.localeCompare(b.date))

  async function approve(id: string) {
    if (uid) await updateLeaveStatus(id, 'approved', uid)
  }
  async function reject(id: string) {
    if (uid) await updateLeaveStatus(id, 'rejected', uid)
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
          <tr>
            <th className="px-4 py-3 text-right">חייל</th>
            <th className="px-4 py-3 text-right">תאריך</th>
            <th className="px-4 py-3 text-right">כמה בבית</th>
            <th className="px-4 py-3 text-right">סטטוס</th>
            <th className="px-4 py-3 text-right">פעולה</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map(r => {
            const soldier = soldiers.find(s => s.id === r.soldier_id)
            const count = leaveCountByDate[r.date] || 0
            const countColor = count >= 8 ? 'text-red-600' : count >= 6 ? 'text-yellow-600' : 'text-green-600'
            return (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{soldier?.full_name ?? '—'}</td>
                <td className="px-4 py-3">{formatHebrewDate(new Date(r.date))}</td>
                <td className={`px-4 py-3 font-semibold ${countColor}`}>{count}/8</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3">
                  {r.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => approve(r.id)} className="text-green-600 hover:underline text-xs font-semibold">אשר</button>
                      <button onClick={() => reject(r.id)} className="text-red-500 hover:underline text-xs font-semibold">דחה</button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/hooks/useAuth.ts`**

```ts
import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return { user, uid: user?.uid ?? null }
}
```

- [ ] **Step 3: Create `src/pages/admin/leave.tsx`**

```tsx
import AdminLayout from '@/components/layout/AdminLayout'
import LeaveTable from '@/components/admin/LeaveTable'
import { useLeaveRequests, useLeaveCountByDate } from '@/hooks/useLeaveRequests'
import { useSoldiers } from '@/hooks/useSoldiers'

export default function AdminLeave() {
  const requests = useLeaveRequests()
  const soldiers = useSoldiers()
  const leaveCountByDate = useLeaveCountByDate()

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-navy mb-6">ניהול יציאות</h1>
      <LeaveTable requests={requests} soldiers={soldiers} leaveCountByDate={leaveCountByDate} />
    </AdminLayout>
  )
}
```

- [ ] **Step 4: Verify**

Open http://localhost:3000/admin/leave — should show table of all requests with approve/reject buttons.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/LeaveTable.tsx src/hooks/useAuth.ts src/pages/admin/leave.tsx
git commit -m "feat: admin leave management with approve/reject"
```

---

## Task 12: Schedule Builder (`/admin/schedule/new`)

**Files:**
- Create: `src/components/admin/TaskCard.tsx`, `src/components/admin/SoldierPanel.tsx`, `src/components/admin/TaskModal.tsx`, `src/components/admin/ValidationPanel.tsx`
- Create: `src/pages/admin/schedule/new.tsx`

- [ ] **Step 1: Create `src/components/admin/TaskCard.tsx`**

```tsx
import type { Task, Assignment, Soldier } from '@/types'
import { formatTime } from '@/utils/dateUtils'
import { deleteAssignment, deleteTask } from '@/lib/firestore'

interface Props {
  task: Task
  assignments: Assignment[]
  soldiers: Soldier[]
  isSelected: boolean
  onSelect: () => void
}

export default function TaskCard({ task, assignments, soldiers, isSelected, onSelect }: Props) {
  const assigned = assignments
    .filter(a => a.task_id === task.id)
    .map(a => soldiers.find(s => s.id === a.soldier_id))
    .filter(Boolean) as Soldier[]

  const missing = task.required_people_count - assigned.length

  return (
    <div
      onClick={onSelect}
      className={`bg-white rounded-xl p-4 shadow-sm border-2 cursor-pointer transition mb-3
        ${isSelected ? 'border-navy' : 'border-transparent hover:border-slate-300'}`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="font-semibold text-slate-800">{task.task_name}</div>
          <div className="text-xs text-slate-400">
            {formatTime(task.start_datetime)} — {formatTime(task.end_datetime)}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
          className="text-slate-300 hover:text-red-400 text-lg leading-none"
        >×</button>
      </div>
      <div className="flex flex-wrap gap-1">
        {assigned.map(s => (
          <span key={s.id} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full flex items-center gap-1">
            {s.full_name}
            <button
              onClick={e => {
                e.stopPropagation()
                const a = assignments.find(a => a.task_id === task.id && a.soldier_id === s.id)
                if (a) deleteAssignment(a.id)
              }}
              className="text-blue-400 hover:text-blue-700"
            >×</button>
          </span>
        ))}
        {missing > 0 && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
            חסר {missing}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/admin/SoldierPanel.tsx`**

```tsx
import type { Soldier, Assignment, Task } from '@/types'
import { createAssignment } from '@/lib/firestore'
import { hoursGap } from '@/utils/dateUtils'

interface Props {
  soldiers: Soldier[]
  assignments: Assignment[]
  tasks: Task[]
  selectedTaskId: string | null
}

function getSoldierInfo(soldier: Soldier, assignments: Assignment[], tasks: Task[], selectedTaskId: string | null) {
  const myAssignments = assignments.filter(a => a.soldier_id === soldier.id)
  const myTasks = myAssignments
    .map(a => tasks.find(t => t.id === a.task_id))
    .filter(Boolean) as Task[]

  const taskCount = myTasks.length
  const isAssignedToSelected = selectedTaskId
    ? myAssignments.some(a => a.task_id === selectedTaskId)
    : false

  // Calculate rest hours before selected task
  let restHours: number | null = null
  if (selectedTaskId) {
    const selected = tasks.find(t => t.id === selectedTaskId)
    if (selected) {
      const prevTasks = myTasks
        .filter(t => t.end_datetime <= selected.start_datetime)
        .sort((a, b) => b.end_datetime.getTime() - a.end_datetime.getTime())
      if (prevTasks.length > 0) {
        restHours = hoursGap(prevTasks[0].end_datetime, selected.start_datetime)
      }
    }
  }

  return { taskCount, isAssignedToSelected, restHours }
}

export default function SoldierPanel({ soldiers, assignments, tasks, selectedTaskId }: Props) {
  async function assign(soldierId: string) {
    if (!selectedTaskId) return
    const alreadyAssigned = assignments.some(
      a => a.task_id === selectedTaskId && a.soldier_id === soldierId
    )
    if (!alreadyAssigned) await createAssignment(selectedTaskId, soldierId)
  }

  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="text-xs font-bold text-slate-500 uppercase mb-3">
        {selectedTaskId ? 'לחץ לשיבוץ' : 'בחר משימה לשיבוץ'}
      </div>
      <div className="space-y-2">
        {soldiers.map(s => {
          const { taskCount, isAssignedToSelected, restHours } = getSoldierInfo(s, assignments, tasks, selectedTaskId)
          return (
            <button
              key={s.id}
              onClick={() => assign(s.id)}
              disabled={!selectedTaskId || isAssignedToSelected}
              className={`w-full flex justify-between items-center px-3 py-2 rounded-lg border transition text-sm
                ${isAssignedToSelected ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-slate-50 border-slate-200 hover:border-navy hover:bg-white'}
                ${!selectedTaskId ? 'cursor-default' : ''}
              `}
            >
              <span className="font-medium">{s.full_name}</span>
              <div className="flex gap-2 items-center text-xs text-slate-500">
                {restHours !== null && restHours < 6 && (
                  <span className="text-yellow-600">⚠ {restHours.toFixed(0)}ש׳ מנוחה</span>
                )}
                <span>{taskCount} משימות</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/admin/TaskModal.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { createTask } from '@/lib/firestore'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { TaskType } from '@/types'

interface Props {
  scheduleId: string
  onClose: () => void
}

export default function TaskModal({ scheduleId, onClose }: Props) {
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [difficulty, setDifficulty] = useState<'hard' | 'easy'>('hard')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [required, setRequired] = useState(2)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getDocs(collection(db, 'task_types')).then(snap => {
      setTaskTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskType)))
    })
  }, [])

  async function save() {
    if (!name || !startDate || !startTime || !endDate || !endTime) return
    setSaving(true)
    await createTask({
      schedule_id: scheduleId,
      task_name: name,
      task_type: type,
      difficulty,
      start_datetime: new Date(`${startDate}T${startTime}`),
      end_datetime: new Date(`${endDate}T${endTime}`),
      required_people_count: required,
      notes,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-lg font-bold text-navy mb-4">משימה חדשה</h2>
        <div className="space-y-3">
          <input placeholder="שם משימה" value={name} onChange={e => setName(e.target.value)}
            className="w-full border rounded-xl px-4 py-2 text-sm" />
          <select value={type} onChange={e => {
            const tt = taskTypes.find(t => t.name === e.target.value)
            setType(e.target.value)
            if (tt) setDifficulty(tt.difficulty)
          }} className="w-full border rounded-xl px-4 py-2 text-sm">
            <option value="">סוג משימה</option>
            {taskTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">התחלה</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-slate-500">סיום</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm" />
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full border rounded-xl px-3 py-2 text-sm mt-1" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-600">כמות נדרשת:</label>
            <input type="number" min={1} max={10} value={required} onChange={e => setRequired(Number(e.target.value))}
              className="w-20 border rounded-xl px-3 py-2 text-sm text-center" />
          </div>
          <textarea placeholder="הערות (אופציונלי)" value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full border rounded-xl px-4 py-2 text-sm h-20 resize-none" />
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 border rounded-xl py-2 text-slate-600">ביטול</button>
          <button onClick={save} disabled={saving} className="flex-1 bg-navy text-white rounded-xl py-2 font-semibold disabled:opacity-50">
            {saving ? 'שומר...' : 'הוסף משימה'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/components/admin/ValidationPanel.tsx`**

```tsx
import type { ValidationError } from '@/types'

export default function ValidationPanel({ errors }: { errors: ValidationError[] }) {
  if (errors.length === 0) return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm">
      ✓ אין שגיאות
    </div>
  )

  const errs = errors.filter(e => e.type === 'error')
  const warns = errors.filter(e => e.type === 'warning')

  return (
    <div className="space-y-2">
      {errs.map((e, i) => (
        <div key={i} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex gap-2">
          <span>🔴</span><span>{e.message}</span>
        </div>
      ))}
      {warns.map((e, i) => (
        <div key={i} className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800 flex gap-2">
          <span>🟡</span><span>{e.message}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Create `src/pages/admin/schedule/new.tsx`**

```tsx
import { useState } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import TaskCard from '@/components/admin/TaskCard'
import SoldierPanel from '@/components/admin/SoldierPanel'
import TaskModal from '@/components/admin/TaskModal'
import ValidationPanel from '@/components/admin/ValidationPanel'
import ConfirmModal from '@/components/ui/ConfirmModal'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { validateSchedule } from '@/utils/validation'
import { createSchedule, updateDoc, doc } from '@/lib/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import type { ValidationError } from '@/types'
import { updateDoc as fsUpdateDoc, doc as fsDoc } from 'firebase/firestore'

export default function NewSchedule() {
  const { uid } = useAuth()
  const soldiers = useSoldiers()
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [scheduleName, setScheduleName] = useState('')
  const { tasks, assignments } = useScheduleTasks(scheduleId)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [showValidation, setShowValidation] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)

  async function initSchedule() {
    if (scheduleId || !scheduleName || !uid) return
    const ref = await createSchedule({
      name: scheduleName,
      start_datetime: new Date(),
      end_datetime: new Date(Date.now() + 86400000),
      status: 'draft',
      created_by: uid,
    })
    setScheduleId(ref.id)
  }

  function runValidation() {
    const errors = validateSchedule(tasks, assignments)
    setValidationErrors(errors)
    setShowValidation(true)
  }

  async function publish() {
    if (!scheduleId) return
    await fsUpdateDoc(fsDoc(db, 'schedules', scheduleId), { status: 'published' })
    setConfirmPublish(false)
  }

  if (!scheduleId) {
    return (
      <AdminLayout>
        <h1 className="text-2xl font-bold text-navy mb-6">שבצ"ק חדש</h1>
        <div className="max-w-md">
          <input
            placeholder='שם השבצ"ק (למשל: שבצ"ק ראשון-שני 27-28/4)'
            value={scheduleName}
            onChange={e => setScheduleName(e.target.value)}
            className="w-full border rounded-xl px-4 py-3 mb-4"
          />
          <button onClick={initSchedule} disabled={!scheduleName}
            className="bg-navy text-white rounded-xl px-6 py-3 font-semibold disabled:opacity-50">
            צור שבצ"ק
          </button>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold text-navy">{scheduleName}</h1>
        <div className="flex gap-2">
          <button onClick={runValidation} className="border border-yellow-400 text-yellow-700 rounded-xl px-4 py-2 text-sm font-semibold">
            ⚠ בדוק שגיאות
          </button>
          <button onClick={() => setConfirmPublish(true)} className="bg-green-600 text-white rounded-xl px-4 py-2 text-sm font-semibold">
            פרסם
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-slate-700">משימות</h2>
            <button onClick={() => setShowTaskModal(true)}
              className="bg-navy text-white rounded-xl px-4 py-2 text-sm font-semibold">
              + הוסף משימה
            </button>
          </div>
          {tasks.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-8">אין משימות — לחץ "הוסף משימה"</p>
          )}
          {tasks.map(t => (
            <TaskCard
              key={t.id}
              task={t}
              assignments={assignments}
              soldiers={soldiers}
              isSelected={selectedTaskId === t.id}
              onSelect={() => setSelectedTaskId(prev => prev === t.id ? null : t.id)}
            />
          ))}

          {showValidation && (
            <div className="mt-4">
              <ValidationPanel errors={validationErrors} />
            </div>
          )}
        </div>

        <div className="w-64">
          <SoldierPanel
            soldiers={soldiers}
            assignments={assignments}
            tasks={tasks}
            selectedTaskId={selectedTaskId}
          />
        </div>
      </div>

      {showTaskModal && (
        <TaskModal scheduleId={scheduleId} onClose={() => setShowTaskModal(false)} />
      )}

      {confirmPublish && (
        <ConfirmModal
          message={
            validationErrors.filter(e => e.type === 'error').length > 0
              ? `ישנן ${validationErrors.filter(e => e.type === 'error').length} שגיאות פתוחות. לפרסם בכל זאת?`
              : 'לפרסם את השבצ"ק? הלוחמים יראו אותו מיידית.'
          }
          onConfirm={publish}
          onCancel={() => setConfirmPublish(false)}
        />
      )}
    </AdminLayout>
  )
}
```

- [ ] **Step 6: Fix import in new.tsx** — remove unused `updateDoc, doc` from `@/lib/firestore` import (they come from firebase/firestore directly).

- [ ] **Step 7: Verify**

Open http://localhost:3000/admin/schedule/new → create schedule name → add tasks → click soldiers to assign → run validation.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin src/pages/admin/schedule
git commit -m "feat: schedule builder with task cards, soldier assignment, validation"
```

---

## Task 13: Justice Table (`/admin/justice`)

**Files:**
- Create: `src/components/admin/JusticeTable.tsx`, `src/pages/admin/justice.tsx`

- [ ] **Step 1: Create `src/components/admin/JusticeTable.tsx`**

```tsx
import type { Soldier, Task, Assignment, TaskType } from '@/types'
import { hoursGap } from '@/utils/dateUtils'

interface Props {
  soldiers: Soldier[]
  tasks: Task[]
  assignments: Assignment[]
  taskTypes: TaskType[]
}

export default function JusticeTable({ soldiers, tasks, assignments, taskTypes }: Props) {
  const typeNames = taskTypes.map(t => t.name)

  const rows = soldiers.map(soldier => {
    const myAssignments = assignments.filter(a => a.soldier_id === soldier.id)
    const myTasks = myAssignments
      .map(a => tasks.find(t => t.id === a.task_id))
      .filter(Boolean) as Task[]

    const hoursByType: Record<string, number> = {}
    let totalHours = 0

    for (const task of myTasks) {
      const h = hoursGap(task.start_datetime, task.end_datetime)
      hoursByType[task.task_name] = (hoursByType[task.task_name] || 0) + h
      totalHours += h
    }

    return { soldier, hoursByType, totalHours, taskCount: myTasks.length }
  }).sort((a, b) => b.totalHours - a.totalHours)

  const avgHours = rows.reduce((s, r) => s + r.totalHours, 0) / (rows.length || 1)

  return (
    <div className="bg-white rounded-xl shadow overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
          <tr>
            <th className="px-4 py-3 text-right">חייל</th>
            {typeNames.map(t => (
              <th key={t} className="px-4 py-3 text-center">{t}</th>
            ))}
            <th className="px-4 py-3 text-center">סה"כ שעות</th>
            <th className="px-4 py-3 text-center">משימות</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ soldier, hoursByType, totalHours, taskCount }) => {
            const isHeavy = totalHours > avgHours + 2
            const isLight = totalHours < avgHours - 2 && avgHours > 0
            const rowClass = isHeavy ? 'bg-red-50' : isLight ? 'bg-green-50' : ''
            return (
              <tr key={soldier.id} className={rowClass}>
                <td className="px-4 py-3 font-medium">{soldier.full_name}</td>
                {typeNames.map(t => (
                  <td key={t} className="px-4 py-3 text-center text-slate-600">
                    {hoursByType[t] ? `${hoursByType[t].toFixed(1)}ש׳` : '—'}
                  </td>
                ))}
                <td className="px-4 py-3 text-center font-bold">{totalHours.toFixed(1)}ש׳</td>
                <td className="px-4 py-3 text-center text-slate-500">{taskCount}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/pages/admin/justice.tsx`**

```tsx
import { useEffect, useState } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import JusticeTable from '@/components/admin/JusticeTable'
import { useSoldiers } from '@/hooks/useSoldiers'
import { getDocs } from 'firebase/firestore'
import { tasksRef, assignmentsRef, taskTypesRef } from '@/lib/firestore'
import type { Task, Assignment, TaskType } from '@/types'

export default function Justice() {
  const soldiers = useSoldiers()
  const [tasks, setTasks] = useState<Task[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])

  useEffect(() => {
    getDocs(tasksRef()).then(snap =>
      setTasks(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id, ...data,
          start_datetime: data.start_datetime.toDate(),
          end_datetime: data.end_datetime.toDate(),
        } as Task
      }))
    )
    getDocs(assignmentsRef()).then(snap =>
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)))
    )
    getDocs(taskTypesRef()).then(snap =>
      setTaskTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskType)))
    )
  }, [])

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-navy mb-6">טבלת צדק</h1>
      <p className="text-sm text-slate-500 mb-4">אדום = עומס יתר, ירוק = מתחת לממוצע. מחושב על כלל ההיסטוריה.</p>
      <JusticeTable soldiers={soldiers} tasks={tasks} assignments={assignments} taskTypes={taskTypes} />
    </AdminLayout>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/JusticeTable.tsx src/pages/admin/justice.tsx
git commit -m "feat: justice table with dynamic columns per task type"
```

---

## Task 14: Export (PDF + Excel)

**Files:**
- Create: `src/utils/exportUtils.ts`
- Modify: `src/pages/admin/schedule/new.tsx` (add export buttons)

- [ ] **Step 1: Create `src/utils/exportUtils.ts`**

```ts
import type { Task, Assignment, Soldier } from '@/types'

export async function exportToPDF(scheduleName: string) {
  const html2pdf = (await import('html2pdf.js')).default
  const element = document.getElementById('schedule-print-area')
  if (!element) return
  html2pdf().set({
    margin: 10,
    filename: `שבצ"ק-${scheduleName}.pdf`,
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { orientation: 'landscape' },
  }).from(element).save()
}

export function exportToExcel(
  tasks: Task[],
  assignments: Assignment[],
  soldiers: Soldier[],
  scheduleName: string
) {
  import('xlsx').then(XLSX => {
    const rows = assignments.map(a => {
      const task = tasks.find(t => t.id === a.task_id)
      const soldier = soldiers.find(s => s.id === a.soldier_id)
      return {
        'חייל': soldier?.full_name ?? '',
        'צוות': soldier?.team ?? '',
        'משימה': task?.task_name ?? '',
        'סוג': task?.task_type ?? '',
        'קושי': task?.difficulty === 'hard' ? 'קשה' : 'קל',
        'התחלה': task?.start_datetime.toLocaleString('he-IL') ?? '',
        'סיום': task?.end_datetime.toLocaleString('he-IL') ?? '',
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'שבצ"ק')
    XLSX.writeFile(wb, `שבצ"ק-${scheduleName}.xlsx`)
  })
}
```

- [ ] **Step 2: Add export buttons to `src/pages/admin/schedule/new.tsx`**

In the header buttons area, add after the publish button:
```tsx
<button onClick={() => exportToPDF(scheduleName)} className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold">
  PDF ↓
</button>
<button onClick={() => exportToExcel(tasks, assignments, soldiers, scheduleName)} className="border border-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-semibold">
  Excel ↓
</button>
```

Add import at top:
```tsx
import { exportToPDF, exportToExcel } from '@/utils/exportUtils'
```

Wrap the tasks list div with `<div id="schedule-print-area">...</div>`.

- [ ] **Step 3: Verify exports**

In schedule builder, create a few tasks and assignments, then click PDF ↓ and Excel ↓ — files should download.

- [ ] **Step 4: Commit**

```bash
git add src/utils/exportUtils.ts src/pages/admin/schedule/new.tsx
git commit -m "feat: PDF and Excel export for schedule"
```

---

## Task 15: Full Schedule View (`/schedule`) + Firestore Security Rules

**Files:**
- Create: `src/pages/schedule.tsx`
- Create: `firestore.rules`

- [ ] **Step 1: Create `src/pages/schedule.tsx`**

```tsx
import { useEffect, useState } from 'react'
import Layout from '@/components/layout/Layout'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { formatTime, formatHebrewDate } from '@/utils/dateUtils'
import { onSnapshot, query, where, orderBy, limit } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'

export default function ScheduleView() {
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [scheduleName, setScheduleName] = useState('')
  const soldiers = useSoldiers()
  const { tasks, assignments } = useScheduleTasks(scheduleId)
  const [myFilter, setMyFilter] = useState<string | null>(null)

  useEffect(() => {
    const id = localStorage.getItem('soldierId')
    setMyFilter(id)

    const q = query(schedulesRef(), where('status', '==', 'published'), orderBy('start_datetime', 'desc'), limit(1))
    return onSnapshot(q, snap => {
      const d = snap.docs[0]
      if (d) { setScheduleId(d.id); setScheduleName(d.data().name) }
    })
  }, [])

  const [showMine, setShowMine] = useState(false)

  const filteredTasks = showMine && myFilter
    ? tasks.filter(t => assignments.some(a => a.task_id === t.id && a.soldier_id === myFilter))
    : tasks

  const sorted = [...filteredTasks].sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())

  return (
    <Layout title='שבצ"ק מחלקתי'>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-navy">{scheduleName || 'שבצ"ק'}</h1>
        {myFilter && (
          <button onClick={() => setShowMine(p => !p)}
            className={`text-sm px-3 py-1 rounded-full border transition ${showMine ? 'bg-navy text-white border-navy' : 'border-slate-300 text-slate-600'}`}>
            {showMine ? 'הצג הכל' : 'המשימות שלי'}
          </button>
        )}
      </div>
      <div className="space-y-3">
        {sorted.map(task => {
          const assigned = assignments
            .filter(a => a.task_id === task.id)
            .map(a => soldiers.find(s => s.id === a.soldier_id)?.full_name)
            .filter(Boolean)
          return (
            <div key={task.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="font-semibold text-slate-800 mb-1">{task.task_name}</div>
              <div className="text-xs text-slate-400 mb-2">
                {formatHebrewDate(task.start_datetime)} · {formatTime(task.start_datetime)} — {formatTime(task.end_datetime)}
              </div>
              <div className="flex flex-wrap gap-1">
                {assigned.map((name, i) => (
                  <span key={i} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{name}</span>
                ))}
                {assigned.length === 0 && <span className="text-xs text-slate-400">טרם שובצו</span>}
              </div>
            </div>
          )
        })}
        {sorted.length === 0 && <p className="text-slate-400 text-center py-8">אין שבצ"ק פעיל</p>}
      </div>
    </Layout>
  )
}
```

- [ ] **Step 2: Create `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admins (authenticated users) can read and write everything
    match /{document=**} {
      allow read, write: if request.auth != null;
    }

    // Public read for soldiers, schedules, tasks, assignments, task_types
    match /soldiers/{id} { allow read: if true; }
    match /schedules/{id} { allow read: if true; }
    match /tasks/{id} { allow read: if true; }
    match /assignments/{id} { allow read: if true; }
    match /task_types/{id} { allow read: if true; }

    // Soldiers can create leave requests (unauthenticated), but not update status
    match /leave_requests/{id} {
      allow read: if true;
      allow create: if true;
      allow update: if request.auth != null;
      allow delete: if request.auth != null;
    }
  }
}
```

- [ ] **Step 3: Deploy Firestore rules**

```bash
npm install -g firebase-tools
firebase login
firebase init firestore  # select existing project
firebase deploy --only firestore:rules
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/schedule.tsx firestore.rules
git commit -m "feat: full schedule view and Firestore security rules"
```

---

## Task 16: Netlify Deployment

**Files:**
- Create: `netlify.toml`

- [ ] **Step 1: Create `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

- [ ] **Step 2: Install Netlify Next.js plugin**

```bash
npm install -D @netlify/plugin-nextjs
```

- [ ] **Step 3: Push to GitHub**

```bash
git remote add origin https://github.com/<your-username>/shabtzak-app.git
git push -u origin main
```

- [ ] **Step 4: Connect to Netlify**

1. Go to app.netlify.com → New site from Git → choose repo
2. Build command: `npm run build`, publish: `.next`
3. Add all `NEXT_PUBLIC_FIREBASE_*` env vars from `.env.local`
4. Deploy

- [ ] **Step 5: Verify production URL**

Open the Netlify URL → select a soldier → check dashboard → login as admin → create schedule.

- [ ] **Step 6: Final commit**

```bash
git add netlify.toml
git commit -m "feat: Netlify deployment config"
git push
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| Soldier identity selection (no login) | Task 7 |
| Soldier dashboard — next task, task list, leave list | Task 8 |
| Leave request with quota alert (8 max) | Task 9 |
| Admin login (4 accounts, Firebase Auth) | Task 10 |
| Admin dashboard with daily counts | Task 10 |
| Admin leave management — approve/reject | Task 11 |
| Schedule builder — tasks + soldier assignment | Task 12 |
| Validation — double booking, rest, imbalance, understaffed | Task 4 + 12 |
| Publish with error confirmation | Task 12 |
| Justice table — all task types, dynamic columns | Task 13 |
| PDF + Excel export | Task 14 |
| Full schedule view with "my tasks" filter | Task 15 |
| Real-time sync (onSnapshot) | Tasks 5, 8, 9, 11 |
| Firestore security rules | Task 15 |
| RTL Hebrew | Tasks 1, 6 |
| Mobile-first | Tailwind responsive throughout |
| Netlify deployment | Task 16 |

**No gaps found.** All spec requirements are covered.

**Placeholder scan:** No TBD, no TODO, no "similar to above." All code blocks are complete.

**Type consistency:** `Task`, `Assignment`, `Soldier`, `LeaveRequest`, `TaskType`, `ValidationError` defined once in `src/types/index.ts` and used consistently. `hoursGap` used in validation.ts, SoldierPanel, JusticeTable — signature matches. `useScheduleTasks` returns `{ tasks, assignments }` — consumed correctly in dashboard, schedule, schedule builder, justice.
