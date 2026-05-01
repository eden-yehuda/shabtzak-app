const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1iSXPZv8IyBBp1B9CAJtI-9cKjgZyrocBkqvlSJIhswI/export?format=csv&gid=269298694'

// Canonical task type names → match header cells that START with these
const TASK_COLUMN_PREFIXES = ['אחורית', 'ש"ג', 'של"ז', 'כ"כ א', 'כ"כ ב', 'עתודה']

export default async function handler(req) {
  try {
    const res = await fetch(SHEET_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const csv = await res.text()
    const records = parseCSV(csv)
    const data = processRecords(records)
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ── CSV parser (handles quoted multi-line fields) ────────────────────────────
function parseCSV(text) {
  const records = []
  let current = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2 }
        else { inQuotes = false; i++ }
      } else { field += ch; i++ }
    } else {
      if (ch === '"') { inQuotes = true; i++ }
      else if (ch === ',') { current.push(field); field = ''; i++ }
      else if (ch === '\r' && text[i + 1] === '\n') {
        current.push(field); records.push(current); current = []; field = ''; i += 2
      } else if (ch === '\n') {
        current.push(field); records.push(current); current = []; field = ''; i++
      } else { field += ch; i++ }
    }
  }
  if (current.length || field) { current.push(field); records.push(current) }
  return records
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseDate(cell) {
  // "יום שלישי\n28.4.26" or "28.4.26"
  for (const line of cell.split('\n')) {
    const m = line.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/)
    if (m) {
      const [, d, mo, y] = m
      const year = y.length === 2 ? `20${y}` : y
      return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    }
  }
  return null
}

function parseHour(cell) {
  // "08:00" → 8, "14" → 14
  const m = cell.match(/^(\d{1,2})/)
  return m ? parseInt(m[1], 10) : null
}

function parseSoldiers(cell) {
  return cell.split('\n').map(s => s.trim()).filter(Boolean)
}

function canonicalTaskType(headerCell) {
  for (const prefix of TASK_COLUMN_PREFIXES) {
    if (headerCell === prefix || headerCell.startsWith(prefix)) return prefix
  }
  return null
}

// ── Main processing ──────────────────────────────────────────────────────────
function processRecords(records) {
  // Find the header row: contains 'שעות' or task type column names
  let headerIdx = -1
  let dayCol = 0
  let hourCol = 1
  const colMap = {} // canonicalTaskType → colIndex

  for (let r = 0; r < Math.min(records.length, 15); r++) {
    const row = records[r]
    let taskColsFound = 0

    for (let c = 0; c < row.length; c++) {
      const cell = row[c].trim()
      if (cell === 'יום') dayCol = c
      if (cell === 'שעות') { hourCol = c; headerIdx = r }
      const canonical = canonicalTaskType(cell)
      if (canonical) { colMap[canonical] = c; taskColsFound++ }
    }
    if (taskColsFound >= 3) { headerIdx = r; break }
  }

  if (headerIdx === -1) return { rows: [], error: 'Header row not found' }

  const rows = []
  let currentDate = null

  for (let r = headerIdx + 1; r < records.length; r++) {
    const row = records[r]
    if (!row || row.length < hourCol + 1) continue

    const dayCell = (row[dayCol] || '').trim()
    const hourCell = (row[hourCol] || '').trim()

    if (dayCell) {
      const d = parseDate(dayCell)
      if (d) currentDate = d
    }

    if (!currentDate) continue
    const hour = parseHour(hourCell)
    if (hour === null) continue

    for (const [taskType, colIdx] of Object.entries(colMap)) {
      const cell = row[colIdx] ? row[colIdx].trim() : ''
      const soldiers = parseSoldiers(cell)
      rows.push({ date: currentDate, taskType, hour, soldiers })
    }
  }

  return { rows }
}
