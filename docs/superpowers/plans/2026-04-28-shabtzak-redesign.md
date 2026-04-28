# שבצק צוות אוראל — Implementation Plan (Redesign v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the 5 core modules — HR management, leave requests (self-service grid), leave approval (final), schedule grid view (public + builder with helper columns), and justice table — based on the approved spec.

**Architecture:** Next.js 14 Pages Router + Firebase Firestore with onSnapshot real-time listeners. Shared `ScheduleGrid` component used by both public view and admin builder. Leave requests split into `is_final=false` (requests) and `is_final=true` (approved final).

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Firebase Firestore, RTL Hebrew

---

## File Map

**Modified:**
- `src/types/index.ts` — add `is_commander`, `notes`, `fixed_home_ranges` to Soldier; `requires_commander` to Task; `is_final` to LeaveRequest; extend TaskType
- `src/utils/validation.ts` — add leave-conflict, commander-missing, returning-unassigned checks
- `scripts/seed.ts` — add is_commander + notes to soldiers
- `src/pages/index.tsx` — replace card list with ScheduleGrid
- `src/pages/leave/new.tsx` — replace form with LeaveGrid
- `src/pages/admin/leave.tsx` — replace table with final leave grid
- `src/pages/admin/schedule/new.tsx` — add task-type definition step + ScheduleGrid builder mode
- `src/components/admin/JusticeTable.tsx` — all tasks + emphasis + commander filter
- `src/pages/admin/justice.tsx` — add date range + commander filter

**Created:**
- `src/components/schedule/ScheduleGrid.tsx` — shared grid (public + builder)
- `src/components/schedule/ScheduleCell.tsx` — one cell: task type × time slot
- `src/components/schedule/SoldierChip.tsx` — soldier chip with optional remove button
- `src/components/leave/LeaveGrid.tsx` — self-service leave grid (soldiers × dates)
- `src/hooks/useFinalLeave.ts` — onSnapshot for is_final=true leave requests
- `src/pages/admin/soldiers.tsx` — HR management page
- `src/components/admin/SoldiersTable.tsx` — editable soldiers table

---

## Task 1: Extend types + update seed

**Files:**
- Modify: `src/types/index.ts`
- Modify: `scripts/seed.ts`

- [ ] **Step 1: Update types**

Replace `src/types/index.ts` with:

```ts
export interface Soldier {
  id: string
  full_name: string
  team: string
  is_active: boolean
  is_commander: boolean
  notes: string
  fixed_home_ranges: Array<{ from: string; to: string }> // YYYY-MM-DD
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
  requires_commander: boolean
  soldiers_required: number
  shift_duration_hours: number
  is_emphasized: boolean // true for מטבח/רס"פ/של"ז
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
  requires_commander: boolean
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
  date: string // 'YYYY-MM-DD'
  status: 'pending' | 'approved' | 'rejected'
  is_final: boolean
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

- [ ] **Step 2: Update seed — add is_commander + notes**

In `scripts/seed.ts`, replace the `soldiers` array:

```ts
const commanders = new Set([
  'אוראל אפנזר', 'יהונתן בוצר', 'דביר משה',
  'אופיר אלטמן', 'רפאל אלקיים', 'עמיחי עוזיאל',
])

const soldierNotes: Record<string, string> = {
  'עמיחי עוזיאל': 'ראשון שני',
  'זיו צארום': 'שבוע-שבוע',
  'אמיתי ברמה': 'שלישי רביעי',
}

const soldiers = [
  'אוראל אפנזר', 'יהונתן בוצר', 'דביר משה', 'אופיר אלטמן',
  'רפאל אלקיים', 'עמיחי עוזיאל', 'זיו צארום', 'נתניאל לישה',
  'מאור לוי', 'עדן יהודה', 'חגי פייגנבום', 'אחיה בכרך',
  'אנדריי טיאן', 'עידן אלמו', 'לאון', 'מאור כליפה',
  'נתן לדקוב', 'ירין צור', 'יואב חדד', 'אילון אומן',
  'יגל משה', 'מיתר לזימי', 'אמיתי ברמה', 'טל סימקו',
].map(name => ({
  full_name: name,
  team: '',
  is_active: true,
  is_commander: commanders.has(name),
  notes: soldierNotes[name] ?? '',
  fixed_home_ranges: [],
}))
```

Also update `taskTypes` to include new fields:

```ts
const taskTypes = [
  { name: 'פילבוקס', difficulty: 'hard', color: '#3b82f6', requires_commander: true, soldiers_required: 2, shift_duration_hours: 2, is_emphasized: false },
  { name: 'כיתת כוננות', difficulty: 'hard', color: '#ef4444', requires_commander: true, soldiers_required: 3, shift_duration_hours: 4, is_emphasized: false },
  { name: 'עמדה אחורית', difficulty: 'hard', color: '#f59e0b', requires_commander: false, soldiers_required: 1, shift_duration_hours: 4, is_emphasized: false },
  { name: 'של"ז', difficulty: 'easy', color: '#8b5cf6', requires_commander: false, soldiers_required: 1, shift_duration_hours: 4, is_emphasized: true },
  { name: 'מטבח', difficulty: 'easy', color: '#22c55e', requires_commander: false, soldiers_required: 2, shift_duration_hours: 8, is_emphasized: true },
  { name: 'רס"פ', difficulty: 'easy', color: '#06b6d4', requires_commander: false, soldiers_required: 1, shift_duration_hours: 8, is_emphasized: true },
]
```

Also update leave_requests to include `is_final: true` in the seed:

```ts
await addDoc(collection(db, 'leave_requests'), {
  soldier_id: soldierId,
  date: lr.date,
  status: 'approved',
  is_final: true,
  created_at: Timestamp.now(),
})
```

- [ ] **Step 3: Run seed**

```powershell
cd "C:\Users\USER\OneDrive - Amit\Documents\קלוד\shabtzak-app"
npx ts-node --project tsconfig.json scripts/seed.ts
```

Expected output: `Seed complete`

- [ ] **Step 4: Verify build**

```powershell
npm run build
```

Expected: no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts scripts/seed.ts
git commit -m "feat: extend types with commander, leave is_final, task requires_commander"
git push
```

---

## Task 2: HR Management page (`/admin/soldiers`)

**Files:**
- Create: `src/components/admin/SoldiersTable.tsx`
- Create: `src/pages/admin/soldiers.tsx`
- Modify: `src/components/layout/AdminLayout.tsx` — add nav link

### SoldiersTable.tsx

- [ ] **Step 1: Create `src/components/admin/SoldiersTable.tsx`**

```tsx
import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Soldier } from '@/types'

interface Props { soldiers: Soldier[] }

export default function SoldiersTable({ soldiers }: Props) {
  const [editing, setEditing] = useState<Record<string, Partial<Soldier>>>({})

  function patch(id: string, field: keyof Soldier, value: unknown) {
    setEditing(e => ({ ...e, [id]: { ...e[id], [field]: value } }))
  }

  async function save(soldier: Soldier) {
    const changes = editing[soldier.id]
    if (!changes) return
    await updateDoc(doc(db, 'soldiers', soldier.id), changes as Record<string, unknown>)
    setEditing(e => { const next = { ...e }; delete next[soldier.id]; return next })
  }

  function addRange(soldier: Soldier) {
    const current = editing[soldier.id]?.fixed_home_ranges ?? soldier.fixed_home_ranges
    patch(soldier.id, 'fixed_home_ranges', [...current, { from: '', to: '' }])
  }

  function updateRange(soldier: Soldier, idx: number, key: 'from' | 'to', val: string) {
    const current = [...(editing[soldier.id]?.fixed_home_ranges ?? soldier.fixed_home_ranges)]
    current[idx] = { ...current[idx], [key]: val }
    patch(soldier.id, 'fixed_home_ranges', current)
  }

  function removeRange(soldier: Soldier, idx: number) {
    const current = [...(editing[soldier.id]?.fixed_home_ranges ?? soldier.fixed_home_ranges)]
    current.splice(idx, 1)
    patch(soldier.id, 'fixed_home_ranges', current)
  }

  const sorted = [...soldiers].sort((a, b) =>
    a.full_name.localeCompare(b.full_name, 'he')
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100 text-right">
            <th className="px-3 py-2 font-semibold">שם</th>
            <th className="px-3 py-2 font-semibold">מפקד</th>
            <th className="px-3 py-2 font-semibold">הערות</th>
            <th className="px-3 py-2 font-semibold">מגבלות קבועות</th>
            <th className="px-3 py-2 font-semibold">פעיל</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => {
            const e = editing[s.id] ?? {}
            const isDirty = !!editing[s.id]
            const ranges = e.fixed_home_ranges ?? s.fixed_home_ranges
            return (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{s.full_name}</td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={e.is_commander ?? s.is_commander}
                    onChange={ev => patch(s.id, 'is_commander', ev.target.checked)}
                    className="w-4 h-4 accent-navy"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={e.notes ?? s.notes}
                    onChange={ev => patch(s.id, 'notes', ev.target.value)}
                    className="border border-slate-200 rounded px-2 py-1 w-full text-sm"
                    placeholder="הערה..."
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="space-y-1">
                    {ranges.map((r, i) => (
                      <div key={i} className="flex gap-1 items-center">
                        <input
                          type="date"
                          value={r.from}
                          onChange={ev => updateRange(s, i, 'from', ev.target.value)}
                          className="border border-slate-200 rounded px-1 py-0.5 text-xs"
                        />
                        <span className="text-xs text-slate-400">—</span>
                        <input
                          type="date"
                          value={r.to}
                          onChange={ev => updateRange(s, i, 'to', ev.target.value)}
                          className="border border-slate-200 rounded px-1 py-0.5 text-xs"
                        />
                        <button
                          onClick={() => removeRange(s, i)}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >✕</button>
                      </div>
                    ))}
                    <button
                      onClick={() => addRange(s)}
                      className="text-xs text-blue-600 hover:underline"
                    >+ מגבלה</button>
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={e.is_active ?? s.is_active}
                    onChange={ev => patch(s.id, 'is_active', ev.target.checked)}
                    className="w-4 h-4 accent-navy"
                  />
                </td>
                <td className="px-3 py-2">
                  {isDirty && (
                    <button
                      onClick={() => save(s)}
                      className="bg-navy text-white text-xs px-3 py-1 rounded-lg"
                    >שמור</button>
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

- [ ] **Step 2: Create `src/pages/admin/soldiers.tsx`**

```tsx
import AdminLayout from '@/components/layout/AdminLayout'
import SoldiersTable from '@/components/admin/SoldiersTable'
import { useSoldiers } from '@/hooks/useSoldiers'

export default function SoldiersPage() {
  const soldiers = useSoldiers(false) // include inactive
  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-navy mb-6">ניהול כוח אדם</h1>
      <SoldiersTable soldiers={soldiers} />
    </AdminLayout>
  )
}
```

- [ ] **Step 3: Add nav link in AdminLayout**

Read `src/components/layout/AdminLayout.tsx` and add a nav item:

```tsx
<Link href="/admin/soldiers" className={navClass('/admin/soldiers')}>כוח אדם</Link>
```

Add it after the existing nav links.

- [ ] **Step 4: Build check**

```powershell
npm run build
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/SoldiersTable.tsx src/pages/admin/soldiers.tsx src/components/layout/AdminLayout.tsx
git commit -m "feat: HR management page with commander flag and date range constraints"
git push
```

---

## Task 3: Leave self-service grid (`/leave/request`)

**Files:**
- Create: `src/components/leave/LeaveGrid.tsx`
- Modify: `src/pages/leave/new.tsx`

### LeaveGrid component

- [ ] **Step 1: Create `src/components/leave/LeaveGrid.tsx`**

```tsx
import { useMemo } from 'react'
import type { Soldier, LeaveRequest } from '@/types'

interface Props {
  soldiers: Soldier[]
  requests: LeaveRequest[]        // is_final=false requests
  dates: string[]                 // YYYY-MM-DD list
  currentSoldierId: string | null
  onToggle: (soldierId: string, date: string) => void
}

function countByDate(requests: LeaveRequest[], date: string) {
  return requests.filter(r => r.date === date && r.status !== 'rejected').length
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr)
  const days = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

export default function LeaveGrid({ soldiers, requests, dates, currentSoldierId, onToggle }: Props) {
  const sorted = useMemo(() =>
    [...soldiers].sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')),
    [soldiers]
  )

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse min-w-full">
        <thead>
          <tr className="text-right">
            <th className="px-3 py-2 font-semibold sticky right-0 bg-white">שם</th>
            {dates.map(d => (
              <th key={d} className="px-2 py-2 font-semibold text-center min-w-[52px]">
                {dayLabel(d)}
              </th>
            ))}
            <th className="px-2 py-2 font-semibold text-center">סה"כ</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(s => {
            const isMe = s.id === currentSoldierId
            const myCount = dates.filter(d =>
              requests.some(r => r.soldier_id === s.id && r.date === d && r.status !== 'rejected')
            ).length
            return (
              <tr key={s.id} className={`border-b border-slate-100 ${isMe ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <td className={`px-3 py-2 font-medium sticky right-0 ${isMe ? 'bg-blue-50' : 'bg-white'}`}>
                  {s.full_name}
                  {s.is_commander && <span className="text-xs text-navy mr-1">★</span>}
                </td>
                {dates.map(d => {
                  const has = requests.some(r => r.soldier_id === s.id && r.date === d && r.status !== 'rejected')
                  const canToggle = isMe
                  return (
                    <td key={d} className="px-1 py-1 text-center">
                      <button
                        disabled={!canToggle}
                        onClick={() => canToggle && onToggle(s.id, d)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                          has
                            ? 'bg-navy text-white'
                            : canToggle
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                            : 'bg-slate-50 text-slate-300 cursor-default'
                        }`}
                      >
                        {has ? '✓' : ''}
                      </button>
                    </td>
                  )
                })}
                <td className="px-2 py-2 text-center text-xs font-semibold text-slate-600">{myCount}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50">
            <td className="px-3 py-2 font-semibold sticky right-0 bg-slate-50">סה"כ ביקשו</td>
            {dates.map(d => {
              const count = countByDate(requests, d)
              return (
                <td key={d} className="px-1 py-2 text-center">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    count >= 8 ? 'bg-red-100 text-red-700' :
                    count >= 6 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>{count}</span>
                </td>
              )
            })}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `src/pages/leave/new.tsx`**

```tsx
import { useState, useMemo } from 'react'
import Layout from '@/components/layout/Layout'
import LeaveGrid from '@/components/leave/LeaveGrid'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useLeaveRequests } from '@/hooks/useLeaveRequests'
import { addDoc, deleteDoc, doc, query, where, getDocs } from 'firebase/firestore'
import { leaveRequestsRef, db } from '@/lib/firestore'

function next14Days(): string[] {
  const days: string[] = []
  const today = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

export default function LeaveRequestPage() {
  const soldiers = useSoldiers()
  const allRequests = useLeaveRequests()
  const requests = allRequests.filter(r => !r.is_final)
  const dates = useMemo(() => next14Days(), [])

  const [currentSoldierId, setCurrentSoldierId] = useState<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('soldierId') : null
  )

  async function handleToggle(soldierId: string, date: string) {
    const existing = requests.find(r => r.soldier_id === soldierId && r.date === date)
    if (existing) {
      await deleteDoc(doc(db, 'leave_requests', existing.id))
    } else {
      await addDoc(leaveRequestsRef(), {
        soldier_id: soldierId,
        date,
        status: 'pending',
        is_final: false,
        created_at: new Date(),
      })
    }
  }

  return (
    <Layout title="בקשות יציאה">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-navy mb-2">בקשות יציאה</h1>
        <p className="text-sm text-slate-500 mb-4">לחץ על הימים שאתה מבקש לצאת. עד 5 ימים בשבועיים, כולל שישי ושבת אחד.</p>
        <select
          value={currentSoldierId ?? ''}
          onChange={e => {
            setCurrentSoldierId(e.target.value || null)
            localStorage.setItem('soldierId', e.target.value)
          }}
          className="border border-slate-300 rounded-xl px-4 py-2 text-sm mb-4"
        >
          <option value="">— בחר חייל —</option>
          {[...soldiers].sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')).map(s => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>
      <LeaveGrid
        soldiers={soldiers}
        requests={requests}
        dates={dates}
        currentSoldierId={currentSoldierId}
        onToggle={handleToggle}
      />
    </Layout>
  )
}
```

- [ ] **Step 3: Build check**

```powershell
npm run build
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/leave/LeaveGrid.tsx src/pages/leave/new.tsx
git commit -m "feat: self-service leave request grid"
git push
```

---

## Task 4: Final leave admin grid (`/admin/leave`)

**Files:**
- Create: `src/hooks/useFinalLeave.ts`
- Modify: `src/pages/admin/leave.tsx`

- [ ] **Step 1: Create `src/hooks/useFinalLeave.ts`**

```ts
import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { leaveRequestsRef } from '@/lib/firestore'
import type { LeaveRequest } from '@/types'

export function useFinalLeave(): LeaveRequest[] {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  useEffect(() => {
    const q = query(leaveRequestsRef(), where('is_final', '==', true))
    return onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => {
        const data = d.data()
        return { id: d.id, ...data, created_at: data.created_at?.toDate() ?? new Date() } as LeaveRequest
      }))
    })
  }, [])
  return requests
}
```

- [ ] **Step 2: Rewrite `src/pages/admin/leave.tsx`**

```tsx
import { useState, useMemo } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useLeaveRequests } from '@/hooks/useLeaveRequests'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { leaveRequestsRef, db } from '@/lib/firestore'
import type { Soldier } from '@/types'

function next14Days(): string[] {
  const days: string[] = []
  const today = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr)
  const days = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

export default function AdminLeavePage() {
  const soldiers = useSoldiers(false)
  const pending = useLeaveRequests()
  const finalLeave = useFinalLeave()
  const dates = useMemo(() => next14Days(), [])
  const [tab, setTab] = useState<'requests' | 'final'>('final')

  const sorted = useMemo(() =>
    [...soldiers].filter(s => s.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')),
    [soldiers]
  )

  async function toggleFinal(soldier: Soldier, date: string) {
    const existing = finalLeave.find(r => r.soldier_id === soldier.id && r.date === date)
    if (existing) {
      await deleteDoc(doc(db, 'leave_requests', existing.id))
    } else {
      await addDoc(leaveRequestsRef(), {
        soldier_id: soldier.id,
        date,
        status: 'approved',
        is_final: true,
        created_at: new Date(),
      })
    }
  }

  const requests = pending.filter(r => !r.is_final)

  function countFinal(date: string) {
    return finalLeave.filter(r => r.date === date && r.status === 'approved').length
  }

  function presentCount(date: string) {
    return soldiers.filter(s => s.is_active).length - countFinal(date)
  }

  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-navy mb-4">ניהול יציאות</h1>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('final')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'final' ? 'bg-navy text-white' : 'bg-slate-100'}`}>
          יציאות סופי
        </button>
        <button onClick={() => setTab('requests')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'requests' ? 'bg-navy text-white' : 'bg-slate-100'}`}>
          בקשות ממתינות ({requests.filter(r => r.status === 'pending').length})
        </button>
      </div>

      {tab === 'final' && (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse min-w-full">
            <thead>
              <tr className="text-right bg-slate-50">
                <th className="px-3 py-2 sticky right-0 bg-slate-50">שם</th>
                {dates.map(d => (
                  <th key={d} className="px-2 py-2 text-center min-w-[52px]">{dayLabel(d)}</th>
                ))}
                <th className="px-2 py-2 text-center">סה"כ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => {
                const myCount = dates.filter(d =>
                  finalLeave.some(r => r.soldier_id === s.id && r.date === d)
                ).length
                return (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium sticky right-0 bg-white">
                      {s.full_name}
                      {s.is_commander && <span className="text-xs text-navy mr-1">★</span>}
                    </td>
                    {dates.map(d => {
                      const approved = finalLeave.some(r => r.soldier_id === s.id && r.date === d)
                      const requested = requests.some(r => r.soldier_id === s.id && r.date === d)
                      return (
                        <td key={d} className="px-1 py-1 text-center">
                          <button
                            onClick={() => toggleFinal(s, d)}
                            title={requested && !approved ? 'ביקש יציאה' : ''}
                            className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                              approved
                                ? 'bg-green-500 text-white'
                                : requested
                                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-400'
                            }`}
                          >
                            {approved ? '✓' : requested ? '?' : ''}
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 text-center text-xs font-semibold">{myCount}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className="px-3 py-2 sticky right-0 bg-slate-50">בבית</td>
                {dates.map(d => (
                  <td key={d} className="px-1 py-2 text-center">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      countFinal(d) >= 8 ? 'bg-red-100 text-red-700' :
                      countFinal(d) >= 6 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>{countFinal(d)}</span>
                  </td>
                ))}
                <td />
              </tr>
              <tr className="bg-slate-50">
                <td className="px-3 py-2 sticky right-0 bg-slate-50 text-slate-500 text-xs">נוכחים</td>
                {dates.map(d => (
                  <td key={d} className="px-1 py-2 text-center text-xs text-slate-500">{presentCount(d)}</td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-2">
          {requests.length === 0 && <p className="text-slate-400 text-center py-8">אין בקשות ממתינות</p>}
          {requests
            .filter(r => r.status === 'pending')
            .map(r => {
              const soldier = soldiers.find(s => s.id === r.soldier_id)
              return (
                <div key={r.id} className="bg-white rounded-xl p-3 border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="font-semibold">{soldier?.full_name}</span>
                    <span className="text-slate-400 text-sm mr-2">{r.date}</span>
                  </div>
                  <button
                    onClick={() => toggleFinal(soldier!, r.date)}
                    className="bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg"
                  >אשר ביציאות סופי</button>
                </div>
              )
            })}
        </div>
      )}
    </AdminLayout>
  )
}
```

- [ ] **Step 3: Build check + commit**

```bash
npm run build
git add src/hooks/useFinalLeave.ts src/pages/admin/leave.tsx
git commit -m "feat: final leave admin grid with request approval"
git push
```

---

## Task 5: Shared ScheduleGrid component

**Files:**
- Create: `src/components/schedule/SoldierChip.tsx`
- Create: `src/components/schedule/ScheduleCell.tsx`
- Create: `src/components/schedule/ScheduleGrid.tsx`

This component powers both the public view (`/`) and the builder (`/admin/schedule/[id]`).

- [ ] **Step 1: Create `src/components/schedule/SoldierChip.tsx`**

```tsx
interface Props {
  name: string
  highlight?: boolean   // navy bg when it's the current soldier
  onRemove?: () => void // undefined = read-only
  isCommander?: boolean
}

export default function SoldierChip({ name, highlight, onRemove, isCommander }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
      highlight ? 'bg-white text-navy font-bold' : 'bg-blue-100 text-blue-800'
    }`}>
      {isCommander && <span>★</span>}
      {name}
      {onRemove && (
        <button onClick={onRemove} className="hover:text-red-500 ml-1">✕</button>
      )}
    </span>
  )
}
```

- [ ] **Step 2: Create `src/components/schedule/ScheduleCell.tsx`**

```tsx
import SoldierChip from './SoldierChip'
import type { Task, Assignment, Soldier } from '@/types'

interface Props {
  task: Task | null
  assigned: Soldier[]
  currentSoldierId?: string | null
  builderMode?: boolean
  onRemoveSoldier?: (soldierId: string) => void
  onClick?: () => void
  isSelected?: boolean
}

export default function ScheduleCell({
  task, assigned, currentSoldierId, builderMode, onRemoveSoldier, onClick, isSelected
}: Props) {
  if (!task) {
    return <td className="border border-slate-100 px-2 py-2 text-center text-slate-200 text-xs">—</td>
  }

  const isMine = currentSoldierId ? assigned.some(s => s.id === currentSoldierId) : false
  const missing = task.required_people_count - assigned.length
  const needsCommander = task.requires_commander
  const hasCommander = assigned.some(s => s.is_commander)
  const commanderMissing = needsCommander && !hasCommander

  return (
    <td
      className={`border border-slate-100 px-2 py-2 align-top cursor-pointer transition ${
        isSelected ? 'bg-blue-50 ring-2 ring-navy ring-inset' :
        isMine ? 'bg-navy' :
        commanderMissing ? 'bg-red-50' :
        missing > 0 ? 'bg-orange-50' :
        'bg-white hover:bg-slate-50'
      }`}
      onClick={onClick}
    >
      <div className="flex flex-wrap gap-1 min-h-[24px]">
        {assigned.map(s => (
          <SoldierChip
            key={s.id}
            name={s.full_name}
            highlight={isMine && s.id === currentSoldierId}
            isCommander={s.is_commander}
            onRemove={builderMode && onRemoveSoldier ? () => onRemoveSoldier(s.id) : undefined}
          />
        ))}
        {missing > 0 && (
          <span className="text-xs text-orange-600 font-semibold">−{missing}</span>
        )}
        {commanderMissing && (
          <span className="text-xs text-red-600 font-semibold">★?</span>
        )}
      </div>
    </td>
  )
}
```

- [ ] **Step 3: Create `src/components/schedule/ScheduleGrid.tsx`**

```tsx
import { useMemo } from 'react'
import ScheduleCell from './ScheduleCell'
import type { Task, Assignment, Soldier, LeaveRequest } from '@/types'

interface Props {
  tasks: Task[]
  assignments: Assignment[]
  soldiers: Soldier[]
  finalLeave?: LeaveRequest[]
  currentSoldierId?: string | null
  builderMode?: boolean
  selectedTaskId?: string | null
  onSelectTask?: (taskId: string) => void
  onRemoveSoldier?: (taskId: string, soldierId: string) => void
}

function formatTime(d: Date) {
  return d.toTimeString().slice(0, 5)
}

function formatDate(d: Date) {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

export default function ScheduleGrid({
  tasks, assignments, soldiers, finalLeave = [],
  currentSoldierId, builderMode, selectedTaskId, onSelectTask, onRemoveSoldier,
}: Props) {
  // Group tasks by day, then build time slots and columns
  const { days, columns, grid } = useMemo(() => {
    if (tasks.length === 0) return { days: [], columns: [], grid: {} }

    // Unique task types (columns)
    const colNames = [...new Set(tasks.map(t => t.task_type))].sort()

    // Group by day
    const byDay = new Map<string, Task[]>()
    for (const t of tasks) {
      const key = isoDate(t.start_datetime)
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key)!.push(t)
    }

    const sortedDays = [...byDay.keys()].sort()

    // For each day, unique time slots
    const daySlots = new Map<string, string[]>()
    for (const [day, dayTasks] of byDay) {
      const slots = [...new Set(dayTasks.map(t => formatTime(t.start_datetime) + '–' + formatTime(t.end_datetime)))]
        .sort()
      daySlots.set(day, slots)
    }

    // grid[day][slot][col] = Task | null
    const grid: Record<string, Record<string, Record<string, Task | null>>> = {}
    for (const [day, dayTasks] of byDay) {
      grid[day] = {}
      for (const slot of daySlots.get(day)!) {
        grid[day][slot] = {}
        for (const col of colNames) {
          const task = dayTasks.find(t => {
            const tSlot = formatTime(t.start_datetime) + '–' + formatTime(t.end_datetime)
            return tSlot === slot && t.task_type === col
          }) ?? null
          grid[day][slot][col] = task
        }
      }
    }

    return { days: sortedDays, columns: colNames, grid, daySlots }
  }, [tasks])

  // Build soldierMap for quick lookup
  const soldierMap = useMemo(() => {
    const m: Record<string, Soldier> = {}
    for (const s of soldiers) m[s.id] = s
    return m
  }, [soldiers])

  // For each task, get assigned soldiers
  function assignedFor(task: Task): Soldier[] {
    return assignments
      .filter(a => a.task_id === task.id)
      .map(a => soldierMap[a.soldier_id])
      .filter(Boolean)
  }

  // Helper columns: יוצאים/חוזרים/נוכחים per day (only in builder)
  function helperForDay(dateStr: string) {
    const leaving = finalLeave.filter(r => r.date === dateStr && r.status === 'approved')
      .map(r => soldierMap[r.soldier_id]?.full_name).filter(Boolean)
    // Returning: had leave yesterday, not today
    const prev = new Date(dateStr)
    prev.setDate(prev.getDate() - 1)
    const prevStr = isoDate(prev)
    const returning = finalLeave.filter(r => r.date === prevStr && r.status === 'approved')
      .filter(r => !finalLeave.some(f => f.date === dateStr && f.soldier_id === r.soldier_id))
      .map(r => soldierMap[r.soldier_id]?.full_name).filter(Boolean)
    const totalActive = soldiers.filter(s => s.is_active).length
    const present = totalActive - leaving.length
    return { leaving, returning, present }
  }

  const CHANGEOVER = '10:00'

  if (days.length === 0) return <p className="text-slate-400 text-center py-8">אין משימות בשבצ"ק זה</p>

  return (
    <div className="overflow-x-auto">
      {days.map(day => {
        const slots = Object.keys(grid[day] ?? {}).sort()
        const helper = builderMode ? helperForDay(day) : null
        const dayDate = new Date(day + 'T12:00:00')

        return (
          <div key={day} className="mb-8">
            {/* Day header */}
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-bold text-navy text-base">{formatDate(dayDate)}</h3>
              {helper && (
                <div className="flex gap-3 text-xs text-slate-500">
                  {helper.leaving.length > 0 && (
                    <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full">
                      יוצאים 10:00: {helper.leaving.join(', ')}
                    </span>
                  )}
                  {helper.returning.length > 0 && (
                    <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                      חוזרים 10:00: {helper.returning.join(', ')}
                    </span>
                  )}
                  <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    נוכחים: {helper.present}
                  </span>
                </div>
              )}
            </div>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-right">
                  <th className="border border-slate-200 px-3 py-2 w-28">שעות</th>
                  {columns.map(col => (
                    <th key={col} className="border border-slate-200 px-3 py-2">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slots.map(slot => {
                  const isChangeover = slot.startsWith(CHANGEOVER)
                  return (
                    <tr
                      key={slot}
                      className={isChangeover && builderMode ? 'bg-yellow-50' : ''}
                    >
                      <td className={`border border-slate-200 px-3 py-2 font-mono text-xs font-semibold ${
                        isChangeover && builderMode ? 'text-yellow-700' : 'text-slate-600'
                      }`}>
                        {slot}
                        {isChangeover && builderMode && <span className="block text-yellow-600">⟳ חילוף</span>}
                      </td>
                      {columns.map(col => {
                        const task = grid[day]?.[slot]?.[col] ?? null
                        const assigned = task ? assignedFor(task) : []
                        return (
                          <ScheduleCell
                            key={col}
                            task={task}
                            assigned={assigned}
                            currentSoldierId={currentSoldierId}
                            builderMode={builderMode}
                            isSelected={!!task && task.id === selectedTaskId}
                            onClick={task && onSelectTask ? () => onSelectTask(task.id) : undefined}
                            onRemoveSoldier={task && onRemoveSoldier
                              ? (sid) => onRemoveSoldier(task.id, sid)
                              : undefined}
                          />
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Build check + commit**

```bash
npm run build
git add src/components/schedule/
git commit -m "feat: ScheduleGrid component with builder mode, helper columns, changeover highlight"
git push
```

---

## Task 6: Public schedule view using ScheduleGrid

**Files:**
- Modify: `src/pages/index.tsx` — replace card list with ScheduleGrid + personal filter toggle

- [ ] **Step 1: Rewrite `src/pages/index.tsx`**

```tsx
import { useEffect, useState, useMemo } from 'react'
import Layout from '@/components/layout/Layout'
import ScheduleGrid from '@/components/schedule/ScheduleGrid'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'
import type { Schedule } from '@/types'

export default function HomePage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleIdx, setScheduleIdx] = useState(0)
  const soldiers = useSoldiers()
  const finalLeave = useFinalLeave()

  const [selectedSoldierId, setSelectedSoldierId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [myTasksOnly, setMyTasksOnly] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('soldierId')
    if (saved) setSelectedSoldierId(saved)
  }, [])

  useEffect(() => {
    const q = query(schedulesRef(), orderBy('start_datetime', 'desc'))
    return onSnapshot(q, snap => {
      setSchedules(snap.docs
        .map(d => ({ id: d.id, ...d.data(), start_datetime: d.data().start_datetime?.toDate(), end_datetime: d.data().end_datetime?.toDate() } as Schedule))
        .filter(s => s.status === 'published')
      )
    })
  }, [])

  const currentSchedule = schedules[scheduleIdx] ?? null
  const { tasks, assignments } = useScheduleTasks(currentSchedule?.id ?? null)

  const filteredSoldiers = useMemo(() =>
    soldiers.filter(s => s.full_name.includes(search)).slice(0, 20),
    [soldiers, search]
  )

  function selectSoldier(id: string, name: string) {
    setSelectedSoldierId(id)
    setSearch(name)
    setShowDropdown(false)
    localStorage.setItem('soldierId', id)
  }

  // If myTasksOnly: filter tasks to only those the soldier is assigned to
  const visibleTasks = useMemo(() => {
    if (!myTasksOnly || !selectedSoldierId) return tasks
    const myTaskIds = new Set(assignments.filter(a => a.soldier_id === selectedSoldierId).map(a => a.task_id))
    return tasks.filter(t => myTaskIds.has(t.id))
  }, [tasks, assignments, myTasksOnly, selectedSoldierId])

  const canGoBack = scheduleIdx < schedules.length - 1
  const canGoForward = scheduleIdx > 0

  return (
    <Layout title="שבצק צוות אוראל">
      {/* Soldier selector */}
      <div className="relative mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              placeholder="חפש שם..."
              className="w-full border border-slate-300 rounded-xl px-4 py-2 text-sm"
            />
            {showDropdown && filteredSoldiers.length > 0 && (
              <div className="absolute top-full right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto mt-1">
                {filteredSoldiers.map(s => (
                  <button key={s.id} onClick={() => selectSoldier(s.id, s.full_name)}
                    className="w-full text-right px-4 py-2 text-sm hover:bg-slate-50">
                    {s.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedSoldierId && (
            <button onClick={() => { setSelectedSoldierId(null); setSearch(''); setMyTasksOnly(false) }}
              className="text-slate-400 px-2">✕</button>
          )}
        </div>
        {showDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />}
      </div>

      {/* Schedule nav */}
      {schedules.length > 0 && (
        <div className="flex justify-between items-center mb-3">
          <button onClick={() => setScheduleIdx(i => i + 1)} disabled={!canGoBack}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30">← קודם</button>
          <span className="text-sm font-semibold text-navy">{currentSchedule?.name}</span>
          <button onClick={() => setScheduleIdx(i => i - 1)} disabled={!canGoForward}
            className="text-sm px-3 py-1 rounded-lg border border-slate-300 disabled:opacity-30">הבא →</button>
        </div>
      )}

      {/* My tasks toggle */}
      {selectedSoldierId && (
        <div className="flex justify-end mb-3">
          <button onClick={() => setMyTasksOnly(v => !v)}
            className={`text-sm px-4 py-1.5 rounded-full border transition ${
              myTasksOnly ? 'bg-navy text-white border-navy' : 'border-slate-300 text-slate-600'
            }`}>
            {myTasksOnly ? '✓ המשמרות שלי' : 'המשמרות שלי'}
          </button>
        </div>
      )}

      {schedules.length === 0
        ? <p className="text-slate-400 text-center py-12">אין שבצ"ק פעיל</p>
        : <ScheduleGrid
            tasks={visibleTasks}
            assignments={assignments}
            soldiers={soldiers}
            currentSoldierId={selectedSoldierId}
          />
      }
    </Layout>
  )
}
```

- [ ] **Step 2: Build check + commit**

```bash
npm run build
git add src/pages/index.tsx
git commit -m "feat: public schedule grid view with soldier filter and my-tasks toggle"
git push
```

---

## Task 7: Update validation with new checks

**Files:**
- Modify: `src/utils/validation.ts`

- [ ] **Step 1: Replace `src/utils/validation.ts`**

```ts
import type { Task, Assignment, Soldier, LeaveRequest, ValidationError } from '@/types'
import { doTasksOverlap, hoursGap } from './dateUtils'

const MIN_REST_HOURS = 8
const MAX_HOUR_IMBALANCE = 4

export function validateSchedule(
  tasks: Task[],
  assignments: Assignment[],
  soldiers: Soldier[],
  finalLeave: LeaveRequest[]
): ValidationError[] {
  const errors: ValidationError[] = []
  const soldierMap: Record<string, Soldier> = {}
  for (const s of soldiers) soldierMap[s.id] = s

  // Build: soldier_id → tasks[]
  const soldierTasks: Record<string, Task[]> = {}
  for (const a of assignments) {
    const task = tasks.find(t => t.id === a.task_id)
    if (!task) continue
    if (!soldierTasks[a.soldier_id]) soldierTasks[a.soldier_id] = []
    soldierTasks[a.soldier_id].push(task)
  }

  // Build: approved final leave dates per soldier
  const homeDates: Record<string, Set<string>> = {}
  for (const r of finalLeave) {
    if (r.status !== 'approved') continue
    if (!homeDates[r.soldier_id]) homeDates[r.soldier_id] = new Set()
    homeDates[r.soldier_id].add(r.date)
  }

  // Also add fixed_home_ranges
  for (const s of soldiers) {
    for (const range of s.fixed_home_ranges ?? []) {
      if (!range.from || !range.to) continue
      const from = new Date(range.from)
      const to = new Date(range.to)
      const cur = new Date(from)
      while (cur <= to) {
        if (!homeDates[s.id]) homeDates[s.id] = new Set()
        homeDates[s.id].add(cur.toISOString().split('T')[0])
        cur.setDate(cur.getDate() + 1)
      }
    }
  }

  // 1. Assignment during home time
  for (const a of assignments) {
    const task = tasks.find(t => t.id === a.task_id)
    if (!task) continue
    const taskDate = task.start_datetime.toISOString().split('T')[0]
    if (homeDates[a.soldier_id]?.has(taskDate)) {
      const soldier = soldierMap[a.soldier_id]
      errors.push({
        type: 'error',
        soldier_id: a.soldier_id,
        task_id: a.task_id,
        message: `${soldier?.full_name ?? a.soldier_id}: משובץ ל-${task.task_name} בתאריך שהוא בבית`,
      })
    }
  }

  // 2. Double booking + rest check
  for (const [soldier_id, stasks] of Object.entries(soldierTasks)) {
    const sorted = [...stasks].sort((a, b) => a.start_datetime.getTime() - b.start_datetime.getTime())
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (doTasksOverlap(
          { start: sorted[i].start_datetime, end: sorted[i].end_datetime },
          { start: sorted[j].start_datetime, end: sorted[j].end_datetime }
        )) {
          errors.push({ type: 'error', soldier_id, message: `שיבוץ כפול: ${sorted[i].task_name} ו-${sorted[j].task_name}` })
        }
      }
      if (i + 1 < sorted.length) {
        const gap = hoursGap(sorted[i].end_datetime, sorted[i + 1].start_datetime)
        if (gap >= 0 && gap < MIN_REST_HOURS) {
          errors.push({ type: 'warning', soldier_id, message: `מנוחה קצרה (${gap.toFixed(1)}h): ${sorted[i].task_name} → ${sorted[i + 1].task_name}` })
        }
      }
    }
  }

  // 3. Understaffed tasks
  const taskCount: Record<string, number> = {}
  for (const a of assignments) taskCount[a.task_id] = (taskCount[a.task_id] || 0) + 1
  for (const task of tasks) {
    const count = taskCount[task.id] || 0
    if (count < task.required_people_count) {
      errors.push({ type: 'error', task_id: task.id, message: `${task.task_name}: חסרים ${task.required_people_count - count} חיילים` })
    }
  }

  // 4. Commander required but missing
  for (const task of tasks) {
    if (!task.requires_commander) continue
    const assignedSoldiers = assignments
      .filter(a => a.task_id === task.id)
      .map(a => soldierMap[a.soldier_id])
      .filter(Boolean)
    const hasCommander = assignedSoldiers.some(s => s.is_commander)
    if (!hasCommander) {
      errors.push({ type: 'error', task_id: task.id, message: `${task.task_name}: נדרש מפקד — אף מפקד לא משובץ` })
    }
  }

  // 5. Returning soldier not assigned (warning only)
  // For each day, find soldiers returning from leave (had leave yesterday, not today)
  const tasksByDate = new Map<string, Task[]>()
  for (const t of tasks) {
    const d = t.start_datetime.toISOString().split('T')[0]
    if (!tasksByDate.has(d)) tasksByDate.set(d, [])
    tasksByDate.get(d)!.push(t)
  }
  for (const [dateStr, dayTasks] of tasksByDate) {
    const prev = new Date(dateStr)
    prev.setDate(prev.getDate() - 1)
    const prevStr = prev.toISOString().split('T')[0]
    for (const s of soldiers) {
      if (!s.is_active) continue
      const wasHome = homeDates[s.id]?.has(prevStr)
      const isHome = homeDates[s.id]?.has(dateStr)
      if (wasHome && !isHome) {
        // Returning soldier — check if assigned to anything this day after 10:00
        const after10 = dayTasks.filter(t => t.start_datetime.getHours() >= 10)
        const isAssigned = assignments.some(a =>
          a.soldier_id === s.id && after10.some(t => t.id === a.task_id)
        )
        if (!isAssigned) {
          errors.push({ type: 'warning', soldier_id: s.id, message: `${s.full_name} חוזר ב-${dateStr} — לא משובץ לאחר 10:00` })
        }
      }
    }
  }

  // 6. Workload imbalance
  const soldierHours = Object.entries(soldierTasks).map(([soldier_id, stasks]) => ({
    soldier_id,
    hours: stasks.reduce((sum, t) => sum + hoursGap(t.start_datetime, t.end_datetime), 0),
  }))
  if (soldierHours.length >= 2) {
    const max = Math.max(...soldierHours.map(s => s.hours))
    const min = Math.min(...soldierHours.map(s => s.hours))
    if (max - min > MAX_HOUR_IMBALANCE) {
      errors.push({ type: 'warning', message: `חלוקה לא שוויונית: הפרש ${(max - min).toFixed(1)} שעות` })
    }
  }

  return errors
}
```

- [ ] **Step 2: Fix validation callers**

In `src/pages/admin/schedule/new.tsx`, find the `validateSchedule` call and update it to pass `soldiers` and `finalLeave`:

```ts
const errors = validateSchedule(tasks, assignments, soldiers, finalLeave)
```

Add `const finalLeave = useFinalLeave()` and `const soldiers = useSoldiers()` imports to the page if not already present.

- [ ] **Step 3: Build check + commit**

```bash
npm run build
git add src/utils/validation.ts src/pages/admin/schedule/new.tsx
git commit -m "feat: extended validation — home conflicts, commander missing, returning unassigned"
git push
```

---

## Task 8: Justice table — all tasks + emphasis + filter

**Files:**
- Modify: `src/components/admin/JusticeTable.tsx`
- Modify: `src/pages/admin/justice.tsx`

- [ ] **Step 1: Rewrite `src/components/admin/JusticeTable.tsx`**

```tsx
import { useMemo } from 'react'
import type { Task, Assignment, Soldier, TaskType } from '@/types'
import { hoursGap } from '@/utils/dateUtils'

interface Props {
  tasks: Task[]
  assignments: Assignment[]
  soldiers: Soldier[]
  taskTypes: TaskType[]
  filter: 'all' | 'commanders' | 'soldiers'
}

export default function JusticeTable({ tasks, assignments, soldiers, taskTypes, filter }: Props) {
  const { rows, columns } = useMemo(() => {
    // Columns = all task type names that appear in tasks
    const usedTypes = [...new Set(tasks.map(t => t.task_type))]
    const columns = taskTypes.filter(tt => usedTypes.includes(tt.name))
      .sort((a, b) => {
        // emphasized first, then alphabetical
        if (a.is_emphasized && !b.is_emphasized) return -1
        if (!a.is_emphasized && b.is_emphasized) return 1
        return a.name.localeCompare(b.name, 'he')
      })

    const filteredSoldiers = soldiers.filter(s => {
      if (!s.is_active) return false
      if (filter === 'commanders') return s.is_commander
      if (filter === 'soldiers') return !s.is_commander
      return true
    })

    const rows = filteredSoldiers.map(s => {
      const myAssignments = assignments.filter(a => a.soldier_id === s.id)
      const myTasks = myAssignments.map(a => tasks.find(t => t.id === a.task_id)).filter(Boolean) as Task[]

      const hoursByType: Record<string, number> = {}
      for (const col of columns) {
        const typeTasks = myTasks.filter(t => t.task_type === col.name)
        hoursByType[col.name] = typeTasks.reduce((sum, t) =>
          sum + hoursGap(t.start_datetime, t.end_datetime), 0)
      }

      const totalHours = Object.values(hoursByType).reduce((a, b) => a + b, 0)
      const totalTasks = myTasks.length

      return { soldier: s, hoursByType, totalHours, totalTasks }
    }).sort((a, b) => b.totalHours - a.totalHours)

    return { rows, columns }
  }, [tasks, assignments, soldiers, taskTypes, filter])

  const avgHours = rows.length > 0
    ? rows.reduce((sum, r) => sum + r.totalHours, 0) / rows.length
    : 0

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 text-right">
            <th className="px-3 py-2 font-semibold sticky right-0 bg-slate-50">שם</th>
            {columns.map(col => (
              <th
                key={col.name}
                className={`px-3 py-2 font-semibold text-center ${col.is_emphasized ? 'bg-blue-50' : ''}`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span style={{ color: col.color }}>●</span>
                  <span>{col.name}</span>
                </div>
              </th>
            ))}
            <th className="px-3 py-2 font-semibold text-center">סה"כ שעות</th>
            <th className="px-3 py-2 font-semibold text-center">משימות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ soldier, hoursByType, totalHours, totalTasks }) => {
            const isHigh = totalHours > avgHours * 1.2
            const isLow = totalHours < avgHours * 0.8 && avgHours > 0
            return (
              <tr
                key={soldier.id}
                className={`border-b border-slate-100 ${
                  isHigh ? 'bg-red-50' : isLow ? 'bg-green-50' : 'hover:bg-slate-50'
                }`}
              >
                <td className={`px-3 py-2 font-medium sticky right-0 ${isHigh ? 'bg-red-50' : isLow ? 'bg-green-50' : 'bg-white'}`}>
                  {soldier.full_name}
                  {soldier.is_commander && <span className="text-xs text-navy mr-1">★</span>}
                </td>
                {columns.map(col => (
                  <td
                    key={col.name}
                    className={`px-3 py-2 text-center ${col.is_emphasized ? 'bg-blue-50 font-semibold' : ''}`}
                  >
                    {hoursByType[col.name] > 0 ? `${hoursByType[col.name]}h` : '—'}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-bold">{totalHours > 0 ? `${totalHours}h` : '—'}</td>
                <td className="px-3 py-2 text-center text-slate-500">{totalTasks}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `src/pages/admin/justice.tsx`**

```tsx
import { useState } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import JusticeTable from '@/components/admin/JusticeTable'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { onSnapshot, query, orderBy } from 'firebase/firestore'
import { schedulesRef, taskTypesRef } from '@/lib/firestore'
import { useEffect } from 'react'
import type { Schedule, TaskType } from '@/types'

export default function JusticePage() {
  const soldiers = useSoldiers(false)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([])
  const [filter, setFilter] = useState<'all' | 'commanders' | 'soldiers'>('all')

  useEffect(() => {
    return onSnapshot(query(schedulesRef(), orderBy('start_datetime', 'desc')), snap => {
      const list = snap.docs.map(d => ({
        id: d.id, ...d.data(),
        start_datetime: d.data().start_datetime?.toDate(),
        end_datetime: d.data().end_datetime?.toDate(),
      } as Schedule))
      setSchedules(list)
      if (!selectedId && list.length > 0) setSelectedId(list[0].id)
    })
  }, [])

  useEffect(() => {
    return onSnapshot(taskTypesRef(), snap => {
      setTaskTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskType)))
    })
  }, [])

  const { tasks, assignments } = useScheduleTasks(selectedId || null)

  return (
    <AdminLayout>
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <h1 className="text-xl font-bold text-navy">טבלת צדק</h1>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
        >
          {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <div className="flex gap-1">
          {(['all', 'commanders', 'soldiers'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm ${filter === f ? 'bg-navy text-white' : 'bg-slate-100'}`}>
              {f === 'all' ? 'הכל' : f === 'commanders' ? 'מפקדים' : 'לוחמים'}
            </button>
          ))}
        </div>
      </div>
      <JusticeTable
        tasks={tasks}
        assignments={assignments}
        soldiers={soldiers}
        taskTypes={taskTypes}
        filter={filter}
      />
    </AdminLayout>
  )
}
```

- [ ] **Step 3: Build check + commit**

```bash
npm run build
git add src/components/admin/JusticeTable.tsx src/pages/admin/justice.tsx
git commit -m "feat: justice table with all task types, emphasized easy tasks, commander filter"
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1: types + seed with is_commander, fixed_home_ranges, is_final
- ✅ Task 2: /admin/soldiers page with inline editing, commander flag, date ranges
- ✅ Task 3: self-service leave request grid
- ✅ Task 4: final leave admin grid with approve/toggle
- ✅ Task 5: ScheduleGrid shared component with builder mode + helper columns
- ✅ Task 6: public schedule grid replacing card list
- ✅ Task 7: extended validation with all 6 checks from spec
- ✅ Task 8: justice table with all tasks + is_emphasized columns + commander filter

**Gaps fixed:**
- Added `taskTypesRef` usage in justice page (must exist in `src/lib/firestore.ts` — verify it exports this)
- Validation passes `soldiers` and `finalLeave` — schedule builder page must import `useFinalLeave`

**Type consistency confirmed:**
- `Soldier.is_commander` used consistently across Tasks 1-8
- `LeaveRequest.is_final` used in Task 3, 4, 5, 7
- `Task.requires_commander` used in Task 1, 7, 8
- `hoursGap` from `dateUtils` used in Tasks 7, 8 (already exists)
