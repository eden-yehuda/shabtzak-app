const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1iSXPZv8IyBBp1B9CAJtI-9cKjgZyrocBkqvlSJIhswI/export?format=csv&gid=484118032'

// Fixed sheet structure (per spec):
//   Row 3 (index 2)  → dates in d/m format
//   Column B (index 1) → soldier name
//   Cell = "1"       → soldier is on leave that day
//   Column Q (index 16) → total leave days per soldier (used for verification)

const DATE_ROW_IDX  = 2   // row 3, 1-indexed
const NAME_COL_IDX  = 1   // column B
const TOTAL_COL_IDX = 16  // column Q

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

// ── Date parsing: "3/5" → "2026-05-03", "3/5/26" → "2026-05-03" ────────────
function parseSheetDate(raw) {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (!m) return null
  const [, d, mo, y] = m
  const year = y
    ? (y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10))
    : new Date().getFullYear()
  return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// ── Main processing ──────────────────────────────────────────────────────────
function processRecords(records) {
  if (records.length <= DATE_ROW_IDX) {
    return { entries: [], dates: [], warnings: [], error: 'Sheet too short' }
  }

  // Collect date columns from row 3
  const dateRow = records[DATE_ROW_IDX] || []
  const dates    = []  // YYYY-MM-DD
  const dateCols = []  // matching column indices

  for (let c = 0; c < dateRow.length; c++) {
    if (c === NAME_COL_IDX || c === TOTAL_COL_IDX) continue
    const d = parseSheetDate(dateRow[c])
    if (d) { dates.push(d); dateCols.push(c) }
  }

  if (dates.length === 0) {
    return {
      entries: [],
      dates: [],
      warnings: [],
      error: `לא נמצאו תאריכים בשורה 3. תוכן: ${JSON.stringify(dateRow.slice(0, 20))}`,
    }
  }

  const entries  = []  // { soldierName, date }
  const warnings = []  // verification mismatches against column Q

  for (let r = DATE_ROW_IDX + 1; r < records.length; r++) {
    const row = records[r]
    if (!row) continue
    const soldierName = (row[NAME_COL_IDX] || '').trim()

    // Skip empty rows, pure-number rows (totals), or rows with no name
    if (!soldierName || /^\d+$/.test(soldierName)) continue

    let count = 0
    for (let i = 0; i < dateCols.length; i++) {
      const cell = (row[dateCols[i]] || '').trim()
      if (cell === '1') {
        entries.push({ soldierName, date: dates[i] })
        count++
      }
    }

    // Verify against column Q (total leave days)
    const qRaw    = (row[TOTAL_COL_IDX] || '').trim()
    const expected = qRaw !== '' ? parseInt(qRaw, 10) : NaN
    if (!isNaN(expected) && expected > 0 && count !== expected) {
      warnings.push(`${soldierName}: Q=${expected} אך נספרו ${count}`)
    }
  }

  return { entries, dates, warnings }
}
