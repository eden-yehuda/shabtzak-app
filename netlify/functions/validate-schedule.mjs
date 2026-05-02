import Anthropic from '@anthropic-ai/sdk'

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY לא מוגדר בסביבת Netlify' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    })
  }

  const body = await req.json()
  const { scheduleName, tasks, assignments, soldiers, finalLeave, dayStartHour, homeLeaveHour } = body

  const client = new Anthropic({ apiKey })

  const prompt = buildPrompt(scheduleName, tasks, assignments, soldiers, finalLeave, dayStartHour, homeLeaveHour)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  return new Response(JSON.stringify({ result: text }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}

function fmtIL(d) {
  const dt = new Date(d)
  // Format in Asia/Jerusalem
  return dt.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function buildPrompt(scheduleName, tasks, assignments, soldiers, finalLeave, dayStartHour, homeLeaveHour) {
  const soldierMap = Object.fromEntries(soldiers.map(s => [s.id, s]))
  const activeSoldiers = soldiers.filter(s => s.is_active)
  const commanderCount = activeSoldiers.filter(s => s.is_commander).length

  // Sort tasks chronologically
  const sortedTasks = [...tasks].sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime())

  const taskLines = sortedTasks.map(t => {
    const assigned = assignments
      .filter(a => a.task_id === t.id)
      .map(a => {
        const s = soldierMap[a.soldier_id]
        return s ? `${s.full_name}${s.is_commander ? ' ★' : ''}` : a.soldier_id
      })
    const cmdNote = t.requires_commander ? ' [דורש מפקד ★]' : ''
    const missing = t.required_people_count - assigned.length
    const status = missing > 0 ? ` ❗חסר ${missing}` : ''
    return `  • ${t.task_type} | ${fmtIL(t.start_datetime)} – ${fmtIL(t.end_datetime)} | נדרש ${t.required_people_count}${cmdNote}${status}\n    משובצים: ${assigned.join(', ') || '— אף אחד —'}`
  }).join('\n')

  const leaveLines = finalLeave
    .filter(r => r.status === 'approved')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => `  • ${soldierMap[r.soldier_id]?.full_name ?? r.soldier_id}: ${r.date}`)
    .join('\n')

  const soldierStats = activeSoldiers.map(s => {
    const count = assignments.filter(a => a.soldier_id === s.id).length
    return `  • ${s.full_name}${s.is_commander ? ' ★' : ''}: ${count} משימות`
  }).join('\n')

  return `אתה בודק שבצ"ק צבאי. תפקידך למצוא בעיות אמיתיות בלבד — אל תמציא בעיות שלא קיימות, ואל תמליץ שיפורים סגנוניים.

הקשר חשוב:
- שעת תחילת יום צבאי: ${dayStartHour ?? 2}:00
- שעת חילופי בית (יציאה/חזרה): ${homeLeaveHour ?? dayStartHour ?? 2}:00
- חיילים פעילים: ${activeSoldiers.length} (מתוכם ${commanderCount} מפקדים מסומנים ★)
- חייל יכול לשרת כמפקד אם is_commander=true (מסומן ★)

שם השבצ"ק: ${scheduleName}

משימות ושיבוצים:
${taskLines || '  (אין משימות)'}

יציאות הביתה מאושרות (חייל לא זמין באותו יום):
${leaveLines || '  (אין יציאות)'}

עומס משימות לחייל:
${soldierStats}

בדוק רק את הבאים — והצג רק בעיות שאכן קיימות בנתונים:
1. **חפיפת משימות**: חייל ספציפי משובץ לשתי משימות שהזמן שלהן חופף
2. **מנוחה קצרה**: פחות מ-8 שעות בין סיום משימה לתחילת משימה הבאה של אותו חייל
3. **חייל בבית**: חייל משובץ למשימה ביום שמסומן לו "יציאה הביתה"
4. **חוסר במפקד**: משימה שמסומנת "דורש מפקד" אבל אף אחד מהמשובצים לא מסומן ★
5. **חוסר באנשים**: משימה עם פחות אנשים ממה שנדרש (כבר מסומן ❗)
6. **עומס לא שוויוני קיצוני**: הפרש של יותר מ-3 משימות בין החייל העמוס ביותר לפחות עמוס

חשוב מאוד:
- ציין את שם החייל המדויק והמשימה הספציפית (זמן + סוג)
- אל תמציא חיילים, משימות, או תאריכים שלא ברשימה למעלה
- אם אין בעיה בקטגוריה — אל תזכיר אותה
- אם הכל תקין — כתוב רק: ✅ השבצ"ק תקין — לא נמצאו בעיות

ענה בעברית, רשימה ממוספרת קצרה.`
}
