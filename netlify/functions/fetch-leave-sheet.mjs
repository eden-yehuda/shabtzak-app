const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1iSXPZv8IyBBp1B9CAJtI-9cKjgZyrocBkqvlSJIhswI/export?format=csv&gid=484118032'

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

function parseSheetDate(raw) {
  // "3/5" → "2026-05-03"
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  const year = new Date().getFullYear()
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function processRecords(records) {
  // Find the date header row: the row where col 2+ has "d/m" format
  let dateRowIdx = -1
  let dateColStart = -1
  const dates = [] // YYYY-MM-DD strings

  for (let r = 0; r < Math.min(records.length, 10); r++) {
    const row = records[r]
    let found = 0
    for (let c = 0; c < row.length; c++) {
      if (parseSheetDate(row[c])) {
        if (dateRowIdx === -1) { dateRowIdx = r; dateColStart = c }
        dates.push(parseSheetDate(row[c]))
        found++
      }
    }
    if (found >= 3) break
  }

  if (dateRowIdx === -1) return { entries: [], error: 'Date row not found' }

  const entries = [] // { soldierName, date }

  for (let r = dateRowIdx + 2; r < records.length; r++) {
    const row = records[r]
    if (!row || row.length < 3) continue
    const soldierName = (row[1] || '').trim()
    if (!soldierName || /^\d+$/.test(soldierName)) continue // skip totals rows

    for (let c = 0; c < dates.length; c++) {
      const cell = (row[dateColStart + c] || '').trim()
      if (cell === '1') {
        entries.push({ soldierName, date: dates[c] })
      }
    }
  }

  return { entries, dates }
}
