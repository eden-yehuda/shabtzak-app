const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1iSXPZv8IyBBp1B9CAJtI-9cKjgZyrocBkqvlSJIhswI/export?format=csv&gid=269298694'

const TASK_COLUMNS = ['אחורית', 'ש"ג', 'של"ז', 'כ"כ א', 'כ"כ ב', 'עתודה']

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
      } else {
        field += ch; i++
      }
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
  const m = cell.match(/(\d{1,2})/)
  return m ? parseInt(m[1], 10) : null
}

function parseSoldiers(cell) {
  return cell.split('\n').map(s => s.trim()).filter(Boolean)
}

// ── Main processing ──────────────────────────────────────────────────────────
function processRecords(records) {
  // Detect header row + column indices
  let headerIdx = -1
  const colMap = {} // taskType -> colIndex

  for (let r = 0; r < Math.min(records.length, 20); r++) {
    const row = records[r]
    for (let c = 0; c < row.length; c++) {
      const cell = row[c].trim()
      if (TASK_COLUMNS.includes(cell)) {
        colMap[cell] = c
        headerIdx = r
      }
    }
    if (Object.keys(colMap).length >= 3) break
  }

  if (headerIdx === -1) return { rows: [], error: 'Header row not found' }

  // Detect day & hour column positions from header row context
  // day column is the first column that contains day info (usually col 1)
  // hour column is usually col 2
  let dayCol = 1
  let hourCol = 2

  // Refine by looking at first data row
  const firstData = records[headerIdx + 1] || []
  for (let c = 0; c < Math.min(firstData.length, 5); c++) {
    if (parseDate(firstData[c])) { dayCol = c; break }
  }

  const rows = []
  let currentDate = null

  for (let r = headerIdx + 1; r < records.length; r++) {
    const row = records[r]
    if (!row || row.length < 3) continue

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
