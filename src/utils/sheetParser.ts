import type { Soldier, Task, Assignment } from '@/types'

export interface SheetRow {
  date: string      // YYYY-MM-DD
  taskType: string
  hour: number      // 0-23
  soldiers: string[] // short names from sheet
}

export interface SheetBlock {
  date: string
  taskType: string
  startHour: number
  endHour: number   // exclusive (e.g. 8→16 means 08:00–16:00)
  soldiers: string[]
  soldierIds: string[]
  matchedNames: { short: string; full: string | null }[]
}

// ── Group consecutive same-soldiers hour slots into task blocks ──────────────
export function groupIntoBlocks(rows: SheetRow[]): SheetBlock[] {
  const sorted = [...rows]
    .filter(r => r.soldiers.length > 0)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date)
      if (a.taskType !== b.taskType) return a.taskType.localeCompare(b.taskType)
      return a.hour - b.hour
    })

  const blocks: SheetBlock[] = []

  for (const row of sorted) {
    const last = blocks[blocks.length - 1]
    if (
      last &&
      last.date === row.date &&
      last.taskType === row.taskType &&
      last.endHour === row.hour &&
      sameSet(last.soldiers, row.soldiers)
    ) {
      last.endHour = row.hour + 1
    } else {
      blocks.push({
        date: row.date,
        taskType: row.taskType,
        startHour: row.hour,
        endHour: row.hour + 1,
        soldiers: row.soldiers,
        soldierIds: [],
        matchedNames: [],
      })
    }
  }

  return blocks
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

// ── Normalize Hebrew string for matching ────────────────────────────────────
function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').normalize('NFC')
}

// ── Fuzzy soldier name matching ──────────────────────────────────────────────
// Handles: exact match, word match, prefix ("רפא"→"רפאל"), multi-word short names.
// Used by both task-schedule sync and leave sync.
export function matchSoldierName(shortName: string, soldiers: Soldier[]): Soldier | null {
  const q = norm(shortName)
  if (!q) return null

  // 1. Exact full-name match
  for (const s of soldiers) {
    if (norm(s.full_name) === q) return s
  }

  // 2. Query equals one of the words in full name  ("נתן" → "נתן לדקוב", "אלמו" → "עידן אלמו")
  for (const s of soldiers) {
    const parts = norm(s.full_name).split(' ')
    if (parts.some(p => p === q)) return s
  }

  // 3. Any word in full name STARTS WITH query ("רפא" → "רפאל אלקיים")
  for (const s of soldiers) {
    const parts = norm(s.full_name).split(' ')
    if (q.length >= 2 && parts.some(p => p.startsWith(q))) return s
  }

  // 4. Multi-word short name: every query word matches a word in full name
  //    ("עידן א" → matches if "עידן" and "א" each prefix a word in full name)
  const qParts = q.split(' ')
  if (qParts.length > 1) {
    for (const s of soldiers) {
      const parts = norm(s.full_name).split(' ')
      if (qParts.every(qp => parts.some(p => p === qp || p.startsWith(qp)))) return s
    }
  }

  // 5. Query starts with any word (short prefix of full part, Hebrew nicknames)
  for (const s of soldiers) {
    const parts = norm(s.full_name).split(' ')
    if (parts.some(p => p.length >= 2 && q.startsWith(p))) return s
  }

  return null
}

// ── Resolve soldier IDs for all blocks ──────────────────────────────────────
export function resolveBlocks(blocks: SheetBlock[], soldiers: Soldier[]): SheetBlock[] {
  return blocks.map(b => {
    const matchedNames = b.soldiers.map(short => {
      const match = matchSoldierName(short, soldiers)
      return { short, full: match?.full_name ?? null }
    })
    const soldierIds = matchedNames
      .map(m => soldiers.find(s => s.full_name === m.full)?.id ?? null)
      .filter((id): id is string => id !== null)

    return { ...b, matchedNames, soldierIds }
  })
}

// ── Diff: compare sheet blocks against current Firestore tasks ───────────────
export type DiffStatus = 'new' | 'same' | 'updated'

export interface DiffEntry {
  block: SheetBlock
  status: DiffStatus
  existingTaskId: string | null
  addAssignments: string[]   // soldierIds to add
  removeAssignments: string[] // soldierIds to remove
}

export function diffBlocks(
  blocks: SheetBlock[],
  tasks: Task[],
  assignments: Assignment[],
  scheduleId: string
): DiffEntry[] {
  return blocks.map(block => {
    const blockStart = new Date(`${block.date}T${String(block.startHour).padStart(2, '0')}:00`)
    const blockEnd = new Date(`${block.date}T${String(block.endHour).padStart(2, '0')}:00`)
    if (block.endHour === 0) blockEnd.setDate(blockEnd.getDate() + 1)

    // Find matching task: same scheduleId, taskType, date, overlapping time
    const match = tasks.find(t => {
      if (t.schedule_id !== scheduleId) return false
      if (t.task_type !== block.taskType) return false
      const tDate = t.start_datetime.toISOString().slice(0, 10)
      if (tDate !== block.date) return false
      // Overlap check (start within ±1h tolerance)
      const startDiff = Math.abs(t.start_datetime.getTime() - blockStart.getTime())
      return startDiff <= 3600 * 1000
    })

    if (!match) {
      return {
        block,
        status: 'new',
        existingTaskId: null,
        addAssignments: block.soldierIds,
        removeAssignments: [],
      }
    }

    const existingIds = assignments
      .filter(a => a.task_id === match.id)
      .map(a => a.soldier_id)

    const toAdd = block.soldierIds.filter(id => !existingIds.includes(id))
    const toRemove = existingIds.filter(id => !block.soldierIds.includes(id))

    const status: DiffStatus =
      toAdd.length === 0 && toRemove.length === 0 ? 'same' : 'updated'

    return {
      block,
      status,
      existingTaskId: match.id,
      addAssignments: toAdd,
      removeAssignments: toRemove,
    }
  })
}
