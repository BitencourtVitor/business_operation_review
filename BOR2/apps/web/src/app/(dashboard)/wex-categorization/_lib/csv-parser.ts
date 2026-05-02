export type ParsedCsv = { headers: string[]; rows: string[][] }

export function guessDelimiter(text: string): "," | ";" | "\t" {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 5)
  const sample = lines.join("\n")
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }
  let inQ = false
  for (let i = 0; i < sample.length; i++) {
    const ch = sample[i]
    if (ch === '"') { if (inQ && sample[i + 1] === '"') { i++; continue } inQ = !inQ; continue }
    if (!inQ && (ch === "," || ch === ";" || ch === "\t")) counts[ch]++
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return (best?.[0] as "," | ";" | "\t") || ","
}

export function parseCsvCore(text: string, delim: "," | ";" | "\t"): ParsedCsv {
  const rows: string[][] = []
  let row: string[] = [], field = "", inQ = false
  const pushF = () => { row.push(field); field = "" }
  const pushR = () => { rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else { inQ = false } }
      else { field += ch }
      continue
    }
    if (ch === '"') { inQ = true; continue }
    if (ch === delim) { pushF(); continue }
    if (ch === "\n") { pushF(); pushR(); continue }
    if (ch === "\r") { if (text[i + 1] === "\n") continue; pushF(); pushR(); continue }
    field += ch
  }
  pushF()
  if (row.length > 1 || row[0]?.trim()) pushR()
  const headers = (rows[0] || []).map(h => h.trim())
  return { headers, rows: rows.slice(1).filter(r => r.some(c => c.trim())) }
}

export function parseCsv(text: string): ParsedCsv {
  return parseCsvCore(text, guessDelimiter(text))
}

export function ci(headers: string[], name: string): number {
  const nl = name.toLowerCase()
  return headers.findIndex(h => h.trim().toLowerCase() === nl)
}
