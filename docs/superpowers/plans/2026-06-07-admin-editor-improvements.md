# שיפורי ממשק עורך השבצ"ק — תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ארבעה שיפורים לעורך השבצ"ק — תקופת אי-פעילות לחייל, אישור על פעולות מהותיות, פאנל שיבוץ עם רלוונטיים מובלטים, והצגת בעיות בזמן אמת — שיחולו גם על שבצקים חדשים.

**Architecture:** הרחבת מודל `Soldier` בשדה `inactive_ranges`, פונקציית עזר טהורה `isSoldierInactiveOnDate` (בעלת בדיקות יחידה ב-vitest), ושינויי UI בקומפוננטות המשותפות `SoldiersTable`, `SoldierPanel`, `ScheduleGrid` ובעמודים `[id].tsx` ו-`new.tsx`. מנגנון האישור ממומש דרך state `pendingAction` ב-`[id].tsx` עם `ConfirmModal` הקיים. הצגת הבעיות ממומשת דרך prop חדש `taskErrors` לגריד ו-`ValidationPanel` הקיים שיוצג תמיד.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Firebase Firestore, Vitest (בדיקות יחידה לפונקציות טהורות). פיצ'רים מבוססי-UI נבדקים ידנית ב-staging לפי workflow ה-CLAUDE.md.

**הערה על בדיקות:** לפרויקט יש Vitest (`npm test`, קבצים תחת `tests/`). פונקציה טהורה אחת בלבד מתווספת (`isSoldierInactiveOnDate`) — היא תקבל בדיקות יחידה אמיתיות (Task 1). שאר השינויים הם UI/Firestore ואינם ניתנים לבדיקת-יחידה משמעותית בסביבה זו; הם נבדקים ע"י הרצת `npm run build` (ודאות הידור) + אימות ידני ב-staging, בהתאם ל-workflow הקיים.

---

## File Structure

| קובץ | אחריות / שינוי |
|------|------|
| `src/types/index.ts` | הוספת שדה `inactive_ranges` ל-`Soldier` |
| `src/utils/dateUtils.ts` | פונקציית עזר טהורה `isSoldierInactiveOnDate(soldier, dateStr)` |
| `tests/dateUtils.test.ts` | בדיקות יחידה ל-`isSoldierInactiveOnDate` (קובץ קיים — מוסיפים describe) |
| `src/components/admin/SoldiersTable.tsx` | UI לטווחי אי-פעילות בשורה המורחבת + ברירת מחדל לחייל חדש |
| `src/components/admin/SoldierPanel.tsx` | סינון לא-פעילים לפי יום המשימה + פיצול "מומלצים"/"שאר החיילים" |
| `src/components/schedule/ScheduleGrid.tsx` | prop `taskErrors` (מסגרת אדומה + ⚠️) + סינון לא-פעילים לפי יום |
| `src/pages/admin/schedule/[id].tsx` | בניית `taskErrors`; `ValidationPanel` קבוע; `ConfirmModal` להזזה/מחיקה דרך `pendingAction` |
| `src/pages/admin/schedule/new.tsx` | `taskErrors` לגריד + `ValidationPanel` קבוע (פיצ'ר 5) |

**סדר ביצוע:** Task 1 (מודל+helper) → Task 2 (UI כוח אדם) → Task 3 (SoldierPanel) → Task 4 (ScheduleGrid) → Task 5 ([id].tsx) → Task 6 (new.tsx) → Task 7 (אימות סופי + staging).

---

## Task 1: מודל נתונים + פונקציית `isSoldierInactiveOnDate`

**Files:**
- Modify: `src/types/index.ts` (interface `Soldier`, אחרי שורה 10)
- Modify: `src/utils/dateUtils.ts` (הוספת פונקציה בסוף הקובץ)
- Test: `tests/dateUtils.test.ts` (הוספת `describe` בסוף הקובץ)

- [ ] **Step 1: הוספת השדה ל-`Soldier`**

ב-`src/types/index.ts`, ערוך את interface `Soldier` כך שתתווסף שורה אחרי `presence_windows` (שורה 10). התוצאה:

```ts
export interface Soldier {
  id: string
  full_name: string
  team: string
  is_active: boolean
  is_commander: boolean
  notes: string
  fixed_home_ranges: Array<{ from: string; to: string }> // YYYY-MM-DD
  // Optional: specific date+hour windows when the soldier IS present (partial week)
  presence_windows?: Array<{ from_date: string; from_hour: number; to_date: string; to_hour: number }>
  // Optional: date ranges (YYYY-MM-DD) where the soldier is temporarily inactive (hidden per-day)
  inactive_ranges?: Array<{ from: string; to: string }>
}
```

- [ ] **Step 2: כתיבת בדיקת היחידה (failing)**

הוסף בסוף `tests/dateUtils.test.ts`. שים לב ש-import ההצהרה בראש הקובץ צריך לכלול גם את הפונקציה החדשה ואת הטיפוס:

ערוך את שורת ה-import הקיימת (שורה 2):
```ts
import { doTasksOverlap, formatHebrewDate, hoursGap, isSoldierInactiveOnDate } from '@/utils/dateUtils'
import type { Soldier } from '@/types'
```

הוסף בסוף הקובץ:
```ts
describe('isSoldierInactiveOnDate', () => {
  const base: Soldier = {
    id: 's1', full_name: 'חייל', team: '', is_active: true,
    is_commander: false, notes: '', fixed_home_ranges: [],
  }

  it('returns false when soldier has no inactive_ranges', () => {
    expect(isSoldierInactiveOnDate(base, '2026-06-07')).toBe(false)
  })

  it('returns true when date is inside a range (inclusive start)', () => {
    const s = { ...base, inactive_ranges: [{ from: '2026-06-07', to: '2026-06-10' }] }
    expect(isSoldierInactiveOnDate(s, '2026-06-07')).toBe(true)
  })

  it('returns true when date is inside a range (inclusive end)', () => {
    const s = { ...base, inactive_ranges: [{ from: '2026-06-07', to: '2026-06-10' }] }
    expect(isSoldierInactiveOnDate(s, '2026-06-10')).toBe(true)
  })

  it('returns false when date is outside the range', () => {
    const s = { ...base, inactive_ranges: [{ from: '2026-06-07', to: '2026-06-10' }] }
    expect(isSoldierInactiveOnDate(s, '2026-06-11')).toBe(false)
  })

  it('ignores ranges with empty from/to', () => {
    const s = { ...base, inactive_ranges: [{ from: '', to: '' }] }
    expect(isSoldierInactiveOnDate(s, '2026-06-07')).toBe(false)
  })

  it('returns true if any of multiple ranges matches', () => {
    const s = { ...base, inactive_ranges: [
      { from: '2026-06-01', to: '2026-06-02' },
      { from: '2026-06-09', to: '2026-06-12' },
    ] }
    expect(isSoldierInactiveOnDate(s, '2026-06-10')).toBe(true)
  })
})
```

- [ ] **Step 3: הרצת הבדיקה לוודא כישלון**

Run: `npm test`
Expected: FAIL — `isSoldierInactiveOnDate is not a function` (או שגיאת import).

- [ ] **Step 4: מימוש הפונקציה**

הוסף בסוף `src/utils/dateUtils.ts` (אחרי `dateToKey`). הוסף גם import לטיפוס בראש הקובץ:

```ts
import type { Soldier } from '@/types'
```

```ts
/**
 * Returns true if the given date (YYYY-MM-DD) falls within any of the soldier's
 * inactive_ranges (inclusive of both endpoints). Ranges with an empty from/to are ignored.
 */
export function isSoldierInactiveOnDate(soldier: Soldier, dateStr: string): boolean {
  const ranges = soldier.inactive_ranges
  if (!ranges || ranges.length === 0) return false
  return ranges.some(r => r.from && r.to && r.from <= dateStr && dateStr <= r.to)
}
```

- [ ] **Step 5: הרצת הבדיקות לוודא הצלחה**

Run: `npm test`
Expected: PASS — כל בדיקות `isSoldierInactiveOnDate` עוברות, ושאר הבדיקות הקיימות נשארות ירוקות.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/utils/dateUtils.ts tests/dateUtils.test.ts
git commit -m "feat: add inactive_ranges to Soldier + isSoldierInactiveOnDate helper"
```

---

## Task 2: UI לטווחי אי-פעילות ב-SoldiersTable

**Files:**
- Modify: `src/components/admin/SoldiersTable.tsx`

- [ ] **Step 1: ברירת מחדל לחייל חדש**

ב-`addSoldier` (שורות 22-30), הוסף `inactive_ranges: []` לאובייקט שנשמר ב-`addDoc`. התוצאה:

```ts
    await addDoc(collection(db, 'soldiers'), {
      full_name: newSoldier.full_name.trim(),
      team: newSoldier.team.trim(),
      is_commander: newSoldier.is_commander,
      notes: newSoldier.notes.trim(),
      is_active: true,
      fixed_home_ranges: [],
      presence_windows: [],
      inactive_ranges: [],
    })
```

- [ ] **Step 2: הוספת helpers לעריכת `inactive_ranges`**

אחרי `removeWindow` (שורה 77), הוסף שלוש פונקציות עזר. הפונקציה `addInactive` מוסיפה טווח שמתחיל בברירת מחדל מהיום הנוכחי (לפי דרישת המשתמש):

```ts
  // inactive_ranges helpers — defaults to today (per user request)
  function todayIso() {
    const d = new Date()
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
  }
  function addInactive(soldier: Soldier) {
    const current = editing[soldier.id]?.inactive_ranges ?? soldier.inactive_ranges ?? []
    const t = todayIso()
    patch(soldier.id, 'inactive_ranges', [...current, { from: t, to: t }])
  }
  function updateInactive(soldier: Soldier, idx: number, key: 'from' | 'to', val: string) {
    const current = [...(editing[soldier.id]?.inactive_ranges ?? soldier.inactive_ranges ?? [])]
    current[idx] = { ...current[idx], [key]: val }
    patch(soldier.id, 'inactive_ranges', current)
  }
  function removeInactive(soldier: Soldier, idx: number) {
    const current = [...(editing[soldier.id]?.inactive_ranges ?? soldier.inactive_ranges ?? [])]
    current.splice(idx, 1)
    patch(soldier.id, 'inactive_ranges', current)
  }
```

- [ ] **Step 3: חישוב הערך הנוכחי בשורה המורחבת**

בתוך `sorted.map(s => {...})`, ליד `const windows = ...` (שורה 165), הוסף:

```ts
              const inactives = e.inactive_ranges ?? s.inactive_ranges ?? []
```

- [ ] **Step 4: הוספת אזור ה-UI בשורה המורחבת**

בשורה המורחבת, אחרי בלוק "Presence windows" (אחרי ה-`</div>` שסוגר אותו בשורה 268, ולפני ה-`</div>` של `flex gap-8`), הוסף בלוק חדש:

```tsx
                          {/* Inactive ranges (temporary) */}
                          <div className="min-w-[260px]">
                            <div className="text-xs font-bold text-slate-600 mb-2">🚫 לא פעיל בתקופה (הסתרה זמנית)</div>
                            <div className="space-y-1.5">
                              {inactives.length === 0 && (
                                <p className="text-xs text-slate-400 italic">אין תקופת אי-פעילות</p>
                              )}
                              {inactives.map((r, i) => (
                                <div key={i} className="flex gap-1.5 items-center">
                                  <input type="date" value={r.from}
                                    onChange={ev => updateInactive(s, i, 'from', ev.target.value)}
                                    className="border border-slate-200 rounded px-1.5 py-1 text-xs" />
                                  <span className="text-xs text-slate-400">—</span>
                                  <input type="date" value={r.to}
                                    onChange={ev => updateInactive(s, i, 'to', ev.target.value)}
                                    className="border border-slate-200 rounded px-1.5 py-1 text-xs" />
                                  <button onClick={() => removeInactive(s, i)}
                                    className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                                </div>
                              ))}
                              <button onClick={() => addInactive(s)}
                                className="text-xs text-blue-600 hover:underline mt-1">+ הוסף תקופה</button>
                            </div>
                          </div>
```

- [ ] **Step 5: ודאות הידור**

Run: `npm run build`
Expected: הידור מצליח ללא שגיאות TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/SoldiersTable.tsx
git commit -m "feat: add inactive period UI to soldiers table"
```

---

## Task 3: SoldierPanel — סינון לא-פעילים + פיצול מומלצים/שאר

**Files:**
- Modify: `src/components/admin/SoldierPanel.tsx`

- [ ] **Step 1: import של הפונקציה הטהורה**

ערוך את שורה 4:
```ts
import { hoursGap, isSoldierInactiveOnDate } from '@/utils/dateUtils'
```

- [ ] **Step 2: סינון חיילים לא-פעילים ביום המשימה**

ב-`enriched` (שורה 90), שנה את שורת ה-filter כך שתסנן גם חיילים לא-פעילים ביום המשימה הנבחרת. `taskDate` כבר מחושב למעלה (שורה 88). התוצאה:

```ts
  const enriched = useMemo(() => soldiers.filter(s => {
    if (!s.is_active) return false
    // Hide soldiers who are inactive on the selected task's day (per-day hiding)
    if (taskDate && isSoldierInactiveOnDate(s, taskDate)) return false
    return true
  }).map(s => {
```

(שאר הגוף של `.map` נשאר ללא שינוי. ודא ש-`taskDate` נמצא במערך התלויות של ה-`useMemo` — הוא כבר שם בשורה 125.)

- [ ] **Step 3: בניית קבוצות "מומלצים" ו"שאר החיילים"**

החלף את הגדרת `unifiedList` (שורה 151) בקוד הבא. ההגדרה של "מומלץ": `status.key === 'present'` וגם (`restHours === null || restHours >= 8`) וגם `!isConcurrent`. כשאין משימה נבחרת — רשימה אחת בלבד.

```ts
  type Item = typeof enriched[number]

  // Recommended = present + adequate rest (≥8h or never worked) + not concurrent.
  function isRecommended(item: Item): boolean {
    if (item.status.key !== 'present') return false
    if (item.isConcurrent) return false
    if (item.restHours !== null && item.restHours < 8) return false
    return true
  }

  // When no task selected: single flat list (ranking is meaningless without a task).
  const unifiedList = useMemo(() => sortByAvailability(enriched, true), [enriched])

  // When a task IS selected: split into recommended (top, always open) and the rest (collapsed).
  const recommended = useMemo(
    () => selectedTaskId ? sortByAvailability(enriched.filter(isRecommended), true) : [],
    [enriched, selectedTaskId]
  )
  const others = useMemo(
    () => selectedTaskId ? sortByAvailability(enriched.filter(x => !isRecommended(x)), true) : [],
    [enriched, selectedTaskId]
  )
```

> הערה: `sortByAvailability` כבר מבטיח ש-`isAssignedToSelected` תמיד בראש (שורה 135), ולכן חיילים המשובצים למשימה הנבחרת יישארו בראש קבוצת המומלצים. אם חייל משובץ אך אינו "מומלץ" (למשל חופף) — הוא יופיע בראש קבוצת "שאר החיילים".

- [ ] **Step 4: state לקיפול קבוצת "שאר החיילים"**

ליד שאר ה-state בראש הקומפוננטה (אחרי שורה 85), הוסף:
```ts
  const [othersOpen, setOthersOpen] = useState(false)
```

- [ ] **Step 5: עדכון הרינדור של רשימת החיילים**

החלף את בלוק הרינדור של רשימת החיילים (שורות 298-303, ה-`{/* Soldiers list ... */}` עד סגירת ה-`div`) בקוד הבא:

```tsx
      {/* Soldiers list */}
      <div className="flex flex-col gap-2 overflow-y-auto flex-1">
        {selectedTaskId ? (
          <>
            {/* Recommended */}
            <div className="text-[11px] font-bold text-emerald-700 px-1">⭐ מומלצים ({recommended.length})</div>
            {recommended.length > 0 ? (
              <div className="grid grid-cols-2 gap-1">
                {recommended.map(item => renderSoldierButton(item))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic px-1">אין חיילים מומלצים זמינים</p>
            )}

            {/* Others (collapsible) */}
            <button onClick={() => setOthersOpen(o => !o)}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-700 px-1 border-t border-slate-200 pt-2 mt-1 text-right">
              {othersOpen ? '▼' : '▶'} שאר החיילים ({others.length})
            </button>
            {othersOpen && (
              <div className="grid grid-cols-2 gap-1">
                {others.map(item => renderSoldierButton(item))}
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {unifiedList.map(item => renderSoldierButton(item))}
          </div>
        )}
      </div>
```

- [ ] **Step 6: ודאות הידור**

Run: `npm run build`
Expected: הידור מצליח ללא שגיאות TypeScript.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/SoldierPanel.tsx
git commit -m "feat: split soldier panel into recommended/others + hide inactive soldiers per day"
```

---

## Task 4: ScheduleGrid — סימון בעיות (`taskErrors`) + סינון לא-פעילים

**Files:**
- Modify: `src/components/schedule/ScheduleGrid.tsx`

- [ ] **Step 1: הוספת prop `taskErrors`**

ב-interface `Props` (אחרי `minDate?` בשורה 32), הוסף:
```ts
  taskErrors?: Record<string, string[]>   // task_id → error messages (builderMode red marking)
```

ב-destructuring (שורה 102), הוסף `taskErrors` לרשימה:
```ts
  onPairSoldiers, onUnpairSoldier, onDeleteColumn, onEditColumn, columnOrder, onReorderColumns, minDate, taskErrors,
```

- [ ] **Step 2: import של הפונקציה הטהורה**

ערוך את שורה 2 (או הוסף import נפרד). הקובץ כבר מייבא מ-`@/types`; הוסף import מ-dateUtils:
```ts
import { isSoldierInactiveOnDate } from '@/utils/dateUtils'
```

- [ ] **Step 3: סינון חיילים לא-פעילים מתצוגת היום**

ב-`assignedFor` (שורה 354) החייל מתווסף לפי `soldierMap`. כדי להסתיר חייל לא-פעיל **ביום המשימה** מבלי להעלים נתונים שגויים, נסנן רק בתצוגה. ב-`assignedFor`, אחרי `const s = soldierMap[a.soldier_id]` (שורה 357), המרה: השאר את הלוגיקה כפי שהיא — **לא** מסננים כאן (לפי האפיון: אם משובץ בטעות עדיין מציגים כדי לא להעלים נתונים).

במקום זאת, הסינון "לפי יום" ב-ScheduleGrid חל על מי **שזמין לבחירה**, אך בגריד עצמו אין רשימת בחירה — רק כרטיסי משימה. לכן בפועל פיצ'ר ההסתרה בגריד מסתכם ב: **לא לשבץ אוטומטית** ולא נדרש שינוי רינדור. דלג על סינון רינדור כאן והשאר את `assignedFor` ללא שינוי.

> הבהרה: לפי האפיון (שורה 39 ב-spec) — "אם משובץ בטעות — עדיין מוצג כדי לא להעלים נתונים". לכן Task 4 אינו מסנן שיבוצים קיימים בגריד. הסינון הפעיל היחיד הוא ב-SoldierPanel (Task 3). שלב זה קיים רק כדי לתעד את ההחלטה — אין שינוי קוד בו. סמן כבוצע.

- [ ] **Step 4: חישוב שגיאות לכרטיס**

ב-render של הכרטיס, אחרי `const commanderMissing = ...` (שורה 754), הוסף:
```ts
                          const errorsForTask = (builderMode && taskErrors) ? (taskErrors[task.id] ?? []) : []
                          const hasTaskErrors = errorsForTask.length > 0
```

- [ ] **Step 5: הוספת מסגרת אדומה לכרטיס**

ב-`<div>` של הכרטיס (שורה 812-814), הוסף את מחלקת המסגרת ל-className. החלף את שורת ה-className:
```tsx
                                className={`rounded-md border shadow-sm px-1.5 py-1 text-center h-full min-h-[28px] flex flex-col justify-center transition relative ${cardExtraClass} ${hasTaskErrors ? 'ring-2 ring-red-500 ring-offset-1' : ''} ${canMoveDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
```

- [ ] **Step 6: הוספת אייקון ⚠️ עם tooltip**

בתוך הכרטיס, מיד אחרי פתיחת ה-`<div className="space-y-0.5">` (שורה 845), הוסף את אייקון האזהרה:
```tsx
                                  {hasTaskErrors && (
                                    <div className="absolute top-0 right-0 z-20 text-red-600 text-[11px] leading-none px-0.5"
                                      title={errorsForTask.join('\n')}>⚠️</div>
                                  )}
```

- [ ] **Step 7: ודאות הידור**

Run: `npm run build`
Expected: הידור מצליח ללא שגיאות TypeScript.

- [ ] **Step 8: Commit**

```bash
git add src/components/schedule/ScheduleGrid.tsx
git commit -m "feat: add taskErrors red marking to schedule grid"
```

---

## Task 5: [id].tsx — taskErrors, פאנל שגיאות קבוע, ConfirmModal להזזה/מחיקה

**Files:**
- Modify: `src/pages/admin/schedule/[id].tsx`

- [ ] **Step 1: בניית `taskErrors` מתוך `visibleErrors`**

אחרי הגדרת `visibleErrors` (שורה 159), הוסף:
```ts
  const taskErrors = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const e of visibleErrors) {
      if (e.type !== 'error' || !e.task_id) continue
      if (!map[e.task_id]) map[e.task_id] = []
      map[e.task_id].push(e.message)
    }
    return map
  }, [visibleErrors])
```

- [ ] **Step 2: state ל-`pendingAction`**

ליד שאר ה-state (אחרי שורה 49), הוסף:
```ts
  const [pendingAction, setPendingAction] = useState<{ message: string; execute: () => Promise<void> } | null>(null)
```

- [ ] **Step 3: שינוי שם הלוגיקה הקיימת של מחיקה/הזזה ל-`do*`**

שנה את שמות שלוש הפונקציות הקיימות מ-`handleDeleteTask`/`handleMoveTask`/`handleMoveTaskToSlot` ל-`doDeleteTask`/`doMoveTask`/`doMoveTaskToSlot` (הגוף נשאר זהה לחלוטין). שורות מושפעות: 466 (`async function handleDeleteTask`), 403 (`async function handleMoveTask`), 631 (`async function handleMoveTaskToSlot`).

```ts
  async function doDeleteTask(taskId: string) {   // היה handleDeleteTask
```
```ts
  async function doMoveTask(taskId: string, hourDelta: number) {   // היה handleMoveTask
```
```ts
  async function doMoveTaskToSlot(taskId: string, date: string, hour: number) {   // היה handleMoveTaskToSlot
```

- [ ] **Step 4: עטיפות עם החלטת אישור**

הוסף שלוש עטיפות חדשות (למשל מיד אחרי `doMoveTaskToSlot`). הלוגיקה: מחיקה → תמיד אישור; הזזה → אישור רק כש-(יש ≥1 שיבוץ) **או** (היום הקלנדרי משתנה). הזזה ריקה באותו יום → מיידי.

```ts
  function isoDay(d: Date) {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
  }

  function handleDeleteTask(taskId: string) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const n = assignments.filter(a => a.task_id === taskId).length
    setPendingAction({
      message: `למחוק את "${task.task_type}"? (${n} חיילים משובצים)`,
      execute: () => doDeleteTask(taskId),
    })
  }

  function handleMoveTask(taskId: string, hourDelta: number) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) { return }
    const n = assignments.filter(a => a.task_id === taskId).length
    const newStart = new Date(task.start_datetime.getTime() + hourDelta * 3_600_000)
    const crossesDay = isoDay(task.start_datetime) !== isoDay(newStart)
    if (n === 0 && !crossesDay) { doMoveTask(taskId, hourDelta); return }
    setPendingAction({
      message: crossesDay
        ? `להעביר את "${task.task_type}" ליום אחר?`
        : `להזיז את "${task.task_type}"? (${n} חיילים משובצים)`,
      execute: () => doMoveTask(taskId, hourDelta),
    })
  }

  function handleMoveTaskToSlot(taskId: string, date: string, hour: number) {
    const task = tasks.find(t => t.id === taskId)
    if (!task) { return }
    const n = assignments.filter(a => a.task_id === taskId).length
    const crossesDay = isoDay(task.start_datetime) !== date
    if (n === 0 && !crossesDay) { doMoveTaskToSlot(taskId, date, hour); return }
    setPendingAction({
      message: crossesDay
        ? `להעביר את "${task.task_type}" ליום אחר?`
        : `להזיז את "${task.task_type}"? (${n} חיילים משובצים)`,
      execute: () => doMoveTaskToSlot(taskId, date, hour),
    })
  }
```

> הערה: ה-props של `ScheduleGrid` כבר מקבלים `onDeleteTask={handleDeleteTask}`, `onMoveTask={handleMoveTask}`, `onMoveTaskToSlot={handleMoveTaskToSlot}` (שורות 1054-1058). מכיוון ששמרנו על אותם שמות בעטיפות — אין צורך לשנות את ה-JSX של הגריד. `handleResizeTask`/`handleResizeTaskStart` נשארים ללא אישור (לפי האפיון).

- [ ] **Step 5: העברת `taskErrors` לגריד**

ב-JSX של `<ScheduleGrid ...>` (שורה 985), הוסף את ה-prop ליד `columnOrder`/`minDate`:
```tsx
                taskErrors={taskErrors}
```

- [ ] **Step 6: פאנל שגיאות קבוע מעל הגריד**

הפאנל הצדדי הקיים (`showErrorPanel`, שורות 882-913) נשאר ככיווץ/הרחבה אופציונלי. נוסיף פאנל קבוע **תמיד גלוי** מעל אזור הגריד. מיד לפני `<div className="flex gap-4 items-start" dir="rtl">` (שורה 979), הוסף:

```tsx
      {/* Always-visible validation panel */}
      <div className="mb-3">
        <ValidationPanel errors={validationErrors} tasks={tasks} dismissedKeys={dismissedKeys}
          onDismiss={dismissError} onRestore={restoreError} />
      </div>
```

> `ValidationPanel` כבר מציג "✓ אין שגיאות" כשאין שגיאות (שורות 40-46 שם), אז אין צורך בטיפול נוסף.

- [ ] **Step 7: רינדור ה-`ConfirmModal` של pendingAction**

לפני סגירת ה-`</AdminLayout>` (לפני שורה 1168, ליד שאר ה-modals), הוסף:
```tsx
      {pendingAction && (
        <ConfirmModal
          message={pendingAction.message}
          onConfirm={async () => { const a = pendingAction; setPendingAction(null); await a.execute() }}
          onCancel={() => setPendingAction(null)}
        />
      )}
```

- [ ] **Step 8: ודאות הידור**

Run: `npm run build`
Expected: הידור מצליח ללא שגיאות TypeScript.

- [ ] **Step 9: Commit**

```bash
git add src/pages/admin/schedule/[id].tsx
git commit -m "feat: confirm dialog for move/delete, always-on validation panel, grid taskErrors"
```

---

## Task 6: new.tsx — taskErrors + פאנל שגיאות קבוע (פיצ'ר 5)

**Files:**
- Modify: `src/pages/admin/schedule/new.tsx`

- [ ] **Step 1: import של `useMemo`**

ודא ש-`useMemo` מיובא מ-`react` בראש הקובץ. אם לא — הוסף אותו לשורת ה-import של react.

- [ ] **Step 2: בניית `taskErrors`**

אחרי ה-`useEffect` של הוולידציה (אחרי שורה 68), הוסף:
```ts
  const taskErrors = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const e of validationErrors) {
      if (e.type !== 'error' || !e.task_id) continue
      if (!map[e.task_id]) map[e.task_id] = []
      map[e.task_id].push(e.message)
    }
    return map
  }, [validationErrors])
```

- [ ] **Step 3: פאנל שגיאות קבוע**

החלף את הבלוק התלוי ב-`showValidation` (שורות 284-286):
```tsx
      {showValidation && validationErrors.length > 0 && (
        <div className="mb-4"><ValidationPanel errors={validationErrors} /></div>
      )}
```
ב:
```tsx
      {/* Always-visible validation panel */}
      <div className="mb-4"><ValidationPanel errors={validationErrors} tasks={tasks} /></div>
```

- [ ] **Step 4: העברת `taskErrors` לגריד**

ב-`<ScheduleGrid ...>` (שורה 294), הוסף אחרי `onRemoveSoldier`:
```tsx
                taskErrors={taskErrors}
```

- [ ] **Step 5: ודאות הידור**

Run: `npm run build`
Expected: הידור מצליח ללא שגיאות TypeScript. אם `showValidation` הפך לבלתי-בשימוש וגורם לאזהרת lint — הסר את ה-state ואת הכפתור שמפעיל אותו, או השאר אם אין אזהרה. בדוק עם `npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/schedule/new.tsx
git commit -m "feat: apply taskErrors + always-on validation panel to new schedule page"
```

---

## Task 7: תיקון באג גרסה ישנה בממשק לוחמים (stale cache)

**Files:**
- Create: `public/_headers`

**אבחון:** האפליקציה היא static export (`output: 'export'` ב-`next.config.mjs`) המוגשת מ-Netlify CDN. אין service worker, אין Firestore offline persistence, ואין שום קובץ `_headers`/`_redirects`. שכבת הנתונים (`usePublishedSchedule`) כבר משתמשת ב-`onSnapshot` חי — ולכן הנתונים עצמם טריים ברגע שה-JS רץ. הבעיה: הדפדפן מגיש `index.html` מהמטמון שטוען חבילת JS ישנה, ולכן הלוחם רואה "גרסה ישנה" עד שמרענן ידנית (רענון מאלץ revalidation). הפתרון: לאלץ revalidation של ה-HTML תוך שמירה על caching אגרסיבי של נכסים חתומי-hash.

- [ ] **Step 1: יצירת `public/_headers`**

צור קובץ חדש `public/_headers` (Next מעתיק את תוכן `public/` לשורש ה-export ב-`out/`, ו-Netlify קורא `out/_headers`). תוכן:

```
/*
  Cache-Control: public, max-age=0, must-revalidate

/_next/static/*
  Cache-Control: public, max-age=31536000, immutable
```

הסבר: הכלל `/*` מאלץ את הדפדפן לאמת מחדש כל מסמך (כולל כל קבצי ה-HTML של ה-export עם `trailingSlash`) בכל כניסה. הכלל הספציפי יותר `/_next/static/*` גובר עבור נכסים חתומי-hash ומאפשר caching ל-שנה (בטוח — שם הקובץ משתנה עם התוכן).

- [ ] **Step 2: ודאות שה-export כולל את הקובץ**

Run: `npm run build`
Expected: ההידור מצליח, ונוצר `out/_headers` (Next מעתיק `public/_headers`). אמת קיום: `ls out/_headers` אמור להציג את הקובץ.

- [ ] **Step 3: Commit**

```bash
git add public/_headers
git commit -m "fix: force HTML revalidation to prevent stale soldier-view versions"
```

> **אימות ב-staging (ב-Task 8):** פתח את ממשק הלוחמים ב-staging, פרסם עדכון מהאדמין, ובדוק בכלי הפיתוח (Network → response headers של המסמך) ש-`Cache-Control: public, max-age=0, must-revalidate` מוחזר. ודא שכניסה חוזרת מציגה את הגרסה החדשה ללא רענון ידני.

---

## Task 8: אימות סופי + פריסה ל-staging

**Files:** אין שינויי קוד — אימות בלבד.

- [ ] **Step 1: הרצת כל הבדיקות**

Run: `npm test`
Expected: כל הבדיקות עוברות (כולל בדיקות `isSoldierInactiveOnDate` החדשות).

- [ ] **Step 2: build + lint נקיים**

Run: `npm run build` ואז `npm run lint`
Expected: הידור מצליח; אין שגיאות lint חדשות.

- [ ] **Step 3: פריסה ל-staging (לפי CLAUDE.md)**

```bash
git checkout staging
git merge master --no-edit
git push origin staging
git checkout master
git push origin master
```
Expected: staging מתעדכן אוטומטית ב-https://staging--shivzuk.netlify.app . **אל תיגע ב-`main`** עד אישור המשתמש.

- [ ] **Step 4: אימות ידני ב-staging (קריטריוני הצלחה)**

- חייל עם תקופת אי-פעילות נעלם מפאנל השיבוץ בימים שבטווח בלבד, וחוזר בשאר הימים.
- גרירת משימה משובצת או ליום אחר → קופץ `ConfirmModal`; גרירת משימה ריקה באותו יום → מיידי; מחיקת משימה → תמיד אישור.
- פאנל השיבוץ מציג "⭐ מומלצים (N)" פתוח למעלה, ו"שאר החיילים (M)" מקופל.
- משימה חסרת מפקד/תת-מאוישת מסומנת במסגרת אדומה + ⚠️ בגריד; פאנל השגיאות גלוי תמיד מעל הגריד.
- כל הנ"ל עובד גם ב-`new.tsx` (שבצק חדש), פרט לאישור הזזה/מחיקה שאינו רלוונטי שם.
- ממשק הלוחמים מציג את הגרסה המעודכנת בכניסה חוזרת ללא רענון ידני; מסמך ה-HTML מוחזר עם `Cache-Control: public, max-age=0, must-revalidate` (בדיקה ב-Network של כלי הפיתוח).

- [ ] **Step 5: דיווח למשתמש**

דווח למשתמש שהשינויים ב-staging ובקש אישור לקידום ל-prod ("תקדם לפרוד").

---

## עקרונות
RTL, עברית בלבד. DRY — שימוש חוזר ב-`ConfirmModal` ו-`ValidationPanel` הקיימים, ובפונקציה הטהורה `isSoldierInactiveOnDate`. כל שינוי → commit ל-master → merge ל-staging → אימות → קידום ל-prod רק לאחר אישור מפורש.
