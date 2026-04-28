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
  const { scheduleName, tasks, assignments, soldiers, finalLeave } = body

  const client = new Anthropic({ apiKey })

  const prompt = buildPrompt(scheduleName, tasks, assignments, soldiers, finalLeave)

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  return new Response(JSON.stringify({ result: text }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}

function buildPrompt(scheduleName, tasks, assignments, soldiers, finalLeave) {
  const soldierMap = Object.fromEntries(soldiers.map(s => [s.id, s]))

  const taskLines = tasks.map(t => {
    const assigned = assignments
      .filter(a => a.task_id === t.id)
      .map(a => soldierMap[a.soldier_id]?.full_name ?? a.soldier_id)
    return `  - ${t.task_name} (${t.task_type}): ${new Date(t.start_datetime).toLocaleString('he-IL')} – ${new Date(t.end_datetime).toLocaleString('he-IL')}, נדרש ${t.required_people_count}, משובצים: ${assigned.join(', ') || 'אף אחד'}`
  }).join('\n')

  const leaveLines = finalLeave
    .filter(r => r.status === 'approved')
    .map(r => `  - ${soldierMap[r.soldier_id]?.full_name ?? r.soldier_id}: ${r.date}`)
    .join('\n')

  return `אתה מומחה לתכנון שבצ"קים צבאיים. בדוק את השבצ"ק הבא ומצא בעיות.

שם: ${scheduleName}

משימות ושיבוצים:
${taskLines || '  (אין משימות)'}

יציאות מאושרות:
${leaveLines || '  (אין יציאות)'}

בדוק:
1. כפילויות (חייל משובץ לשתי משימות חופפות)
2. מנוחה קצרה מדי (פחות מ-8 שעות בין משימות)
3. חייל משובץ בזמן שהוא בבית/חופש
4. משימות עם אנשים חסרים
5. עומס לא שוויוני בין החיילים
6. כל בעיה נוספת שאתה רואה

ענה בעברית, רשימה ממוספרת של ממצאים בלבד. אם הכל תקין, כתוב "✅ השבצ"ק תקין — לא נמצאו בעיות".`
}
