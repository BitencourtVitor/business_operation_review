/**
 * Client-side MS Project PDF parser.
 * Extracts the task hierarchy from a PDF exported by Microsoft Project.
 *
 * Expected column layout (MS Project default export):
 *   ID | Task Mode | Task Name | Duration | Predecessors | Start | Finish | Resource Names | Notes
 *
 * Hierarchy is determined by the x-indentation of the Task Name column items.
 */

import * as pdfjsLib from "pdfjs-dist"

// ─── Worker initialisation (client-side only) ─────────────────────────────────

if (typeof window !== "undefined") {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href
  } catch {
    // Fallback to unpkg CDN if import.meta.url resolution fails
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleRow {
  id:           string
  name:         string
  durationText: string
  durationDays: number
  predecessors: string
  start:        string          // raw text from PDF, e.g. "Mon 4/20/26"
  finish:       string
  startDate:    Date | null
  finishDate:   Date | null
  resources:    string[]
  notes:        string
  level:        number          // 1 = phase, 2 = category, 3+ = task
  isPhase:      boolean         // ALL-CAPS name
  isMilestone:  boolean         // 0-day duration
}

export interface ParsedSchedule {
  fileName:      string
  projectName:   string
  rows:          ScheduleRow[]
  allResources:  string[]
  projectStart:  Date | null
  projectFinish: Date | null
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface TextItem {
  str:      string
  x:        number
  y:        number   // screen-space: 0 = top, pageHeight = bottom
  page:     number
  pageH:    number
}

interface ColDef {
  key:  string
  xMin: number
  xMax: number
}

// Column keyword matchers — order matters: more specific first
const COL_MATCHERS: Array<{ key: string; match: RegExp }> = [
  { key: "TaskMode",    match: /task.?mode/i },
  { key: "TaskName",    match: /task.?name|^name$/i },
  { key: "Duration",    match: /^dur(ation)?\.?$/i },
  { key: "Predecessors",match: /^pred(ecessors?)?\.?$/i },
  { key: "Start",       match: /^start(s|.?date)?$/i },
  { key: "Finish",      match: /^(finish(es)?|end)(s|.?date)?$/i },
  { key: "Resources",   match: /resource/i },
  { key: "Notes",       match: /^notes?$/i },
  { key: "ID",          match: /^(id|#|no\.?)$/i },
]

// ─── Date parsing ─────────────────────────────────────────────────────────────

/**
 * Parse "Mon 4/20/26" → Date
 * Also handles "4/20/2026", "Mon 4/20/2026"
 */
export function parseMSPDate(s: string): Date | null {
  if (!s) return null
  // "Mon 4/20/26" or "Fri 11/7/25" or "4/20/26"
  const m = s.match(/\d+\/(\d+)\/(\d+)/)
  if (!m) return null
  // Split on / to get month, day, year
  const parts = s.match(/(\d+)\/(\d+)\/(\d+)/)
  if (!parts) return null
  const month = +parts[1] - 1
  const day   = +parts[2]
  const year  = +parts[3] < 100 ? 2000 + +parts[3] : +parts[3]
  return new Date(year, month, day)
}

/** Format Date → "YYYY-MM-DD" for DB storage */
export function toDateStr(d: Date | null): string | null {
  if (!d) return null
  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, "0")
  const dy = String(d.getDate()).padStart(2, "0")
  return `${y}-${mo}-${dy}`
}

/** Reconstruct Date objects after JSON round-trip (stored as ISO strings) */
export function hydrateSchedule(raw: unknown): ParsedSchedule {
  const s = raw as ParsedSchedule
  return {
    ...s,
    projectStart:  s.projectStart  ? new Date(s.projectStart  as unknown as string) : null,
    projectFinish: s.projectFinish ? new Date(s.projectFinish as unknown as string) : null,
    rows: (s.rows ?? []).map(r => ({
      ...r,
      startDate:  r.startDate  ? new Date(r.startDate  as unknown as string) : null,
      finishDate: r.finishDate ? new Date(r.finishDate as unknown as string) : null,
    })),
  }
}

// ─── Duration parsing ─────────────────────────────────────────────────────────

function parseDuration(s: string): number {
  const m = s.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : 0
}

// ─── Core extraction ──────────────────────────────────────────────────────────

async function extractItems(file: File): Promise<TextItem[]> {
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
  const all: TextItem[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const vp   = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()

    for (const item of content.items) {
      if (!("str" in item)) continue
      const s = (item.str as string).trim()
      if (!s) continue
      all.push({
        str:   s,
        x:     item.transform[4],
        y:     vp.height - item.transform[5], // flip: PDF y goes up, we want screen y (down)
        page:  p,
        pageH: vp.height,
      })
    }
  }
  return all
}

/** Group items with similar y on the same page into rows. */
function groupRows(items: TextItem[], yTol = 4): TextItem[][] {
  // Sort: page asc, then y asc (same page), then x asc (same row)
  const sorted = [...items].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    const dy = Math.abs(a.y - b.y)
    return dy <= yTol ? a.x - b.x : a.y - b.y
  })

  const rows: TextItem[][] = []
  let cur: TextItem[]  = []
  let curY  = -Infinity
  let curP  = -1

  for (const item of sorted) {
    const sameRow = item.page === curP && Math.abs(item.y - curY) <= yTol
    if (sameRow) {
      cur.push(item)
    } else {
      if (cur.length) rows.push(cur)
      cur  = [item]
      curY = item.y
      curP = item.page
    }
  }
  if (cur.length) rows.push(cur)
  return rows
}

/** Try to match a text string (possibly joined from adjacent items) to a column key. */
function matchCol(text: string): string | null {
  const m = COL_MATCHERS.find(c => c.match.test(text.trim()))
  return m ? m.key : null
}

/** Detect header row and build column definitions.
 *  Scores every candidate row by number of recognised columns;
 *  returns the row with the highest score that has TaskName + Start + Finish. */
function detectColumns(rows: TextItem[][]): { idx: number; cols: ColDef[] } | null {
  let best: { idx: number; cols: ColDef[]; score: number } | null = null

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const joined = row.map(it => it.str).join(" ").toLowerCase()

    // Quick pre-filter: must mention at least two schedule-related words
    const keywords = ["task", "name", "start", "finish", "end", "duration", "resource"]
    const hits = keywords.filter(k => joined.includes(k)).length
    if (hits < 2) continue

    const sorted = [...row].sort((a, b) => a.x - b.x)
    const cols: ColDef[]    = []
    const consumed = new Set<number>()

    for (let j = 0; j < sorted.length; j++) {
      if (consumed.has(j)) continue

      // Build candidates: single, pair, triple (by joining adjacent items)
      const candidates: Array<{ text: string; span: number }> = [
        { text: sorted[j].str, span: 1 },
      ]
      if (j + 1 < sorted.length && !consumed.has(j + 1))
        candidates.push({ text: `${sorted[j].str} ${sorted[j + 1].str}`, span: 2 })
      if (j + 2 < sorted.length && !consumed.has(j + 2))
        candidates.push({ text: `${sorted[j].str} ${sorted[j + 1].str} ${sorted[j + 2].str}`, span: 3 })

      for (const { text, span } of candidates) {
        const key = matchCol(text)
        if (!key) continue
        // Mark consumed items so they don't get re-matched
        for (let k = 1; k < span; k++) consumed.add(j + k)
        const nextIdx = j + span
        cols.push({
          key,
          xMin: sorted[j].x - 2,
          xMax: nextIdx < sorted.length ? sorted[nextIdx].x - 2 : 99999,
        })
        break
      }
    }

    const keys = cols.map(c => c.key)
    const valid = keys.includes("TaskName") && keys.includes("Start") && keys.includes("Finish")
    if (valid && (!best || keys.length > best.score)) {
      best = { idx: i, cols, score: keys.length }
    }
  }

  return best ? { idx: best.idx, cols: best.cols } : null
}

/** Get concatenated text for a column from a row. */
function cellText(row: TextItem[], col: ColDef): string {
  return row
    .filter(it => it.x >= col.xMin && it.x < col.xMax)
    .sort((a, b) => a.x - b.x)
    .map(it => it.str)
    .join(" ")
    .trim()
}

/** Determine indent level from Task Name column x position. */
function indentLevel(row: TextItem[], tnCol: ColDef, baseX: number): number {
  const items = row.filter(it => it.x >= tnCol.xMin && it.x < tnCol.xMax)
  if (!items.length) return 1
  const firstX = Math.min(...items.map(it => it.x))
  const indent = firstX - baseX
  // MS Project uses ~13-19 px per indent level
  return 1 + Math.max(0, Math.floor(indent / 14))
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function parseSchedulePDF(file: File): Promise<ParsedSchedule> {
  const items = await extractItems(file)

  // Try progressively looser row-grouping tolerances until we get a valid parse
  for (const yTol of [4, 6, 9]) {
    const result = tryParse(file.name, items, yTol)
    if (result) return result
  }

  throw new Error(
    "Could not detect schedule columns. " +
    "Make sure this PDF was exported from Microsoft Project with the standard column layout."
  )
}

function tryParse(fileName: string, items: TextItem[], yTol: number): ParsedSchedule | null {
  const rows = groupRows(items, yTol)

  // 1. Find header and column definitions
  const header = detectColumns(rows)
  if (!header) return null

  const { idx: headerIdx, cols } = header
  const tnCol  = cols.find(c => c.key === "TaskName")
  const baseX  = tnCol ? tnCol.xMin : 0

  // 2. Extract project name from the rows above the header
  let projectName = fileName.replace(/\.pdf$/i, "")
  for (let i = 0; i < Math.min(headerIdx, 6); i++) {
    const text = rows[i].map(it => it.str).join(" ").trim()
    if (
      text.length > 4 &&
      !/page\s+\d+/i.test(text) &&
      !/^\d+$/.test(text) &&
      !text.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/)
    ) {
      projectName = text
      break
    }
  }

  // 3. Parse data rows
  const scheduleRows: ScheduleRow[] = []
  const idCol = cols.find(c => c.key === "ID")
  let autoId  = 0

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]

    // Resolve row ID: prefer explicit ID column, fallback to sequential counter
    let idText: string
    if (idCol) {
      const raw = cellText(row, idCol)
      if (!raw || !/^\d+$/.test(raw)) continue
      idText = raw
    } else {
      // No ID column — require a non-empty task name to count the row
      if (!tnCol) continue
      const name = cellText(row, tnCol)
      if (!name) continue
      autoId++
      idText = String(autoId)
    }

    // Task name is required
    if (!tnCol) continue
    const name = cellText(row, tnCol)
    if (!name) continue

    // Extract all other fields
    const get = (key: string) => {
      const c = cols.find(col => col.key === key)
      return c ? cellText(row, c) : ""
    }

    const durationText = get("Duration")
    const durationDays = parseDuration(durationText)
    const startStr     = get("Start")
    const finishStr    = get("Finish")
    const resourceStr  = get("Resources")
    const predStr      = get("Predecessors")
    const notesStr     = get("Notes")

    // Milestone = 0 days or explicit "0 days"
    const isMilestone = durationDays === 0 || /^0\s*days?/i.test(durationText)

    // Phase = ALL CAPS (after stripping numbers and punctuation)
    const stripped = name.replace(/[\d\s\-_.]/g, "")
    const isPhase  = stripped.length > 1 && stripped === stripped.toUpperCase()

    const level = isPhase ? 1 : indentLevel(row, tnCol, baseX)

    scheduleRows.push({
      id:           idText,
      name,
      durationText: durationText || "—",
      durationDays,
      predecessors: predStr,
      start:        startStr,
      finish:       finishStr,
      startDate:    parseMSPDate(startStr),
      finishDate:   parseMSPDate(finishStr),
      resources:    resourceStr ? resourceStr.split(",").map(r => r.trim()).filter(Boolean) : [],
      notes:        notesStr,
      level,
      isPhase,
      isMilestone,
    })
  }

  // Bail out if we got nothing useful
  if (scheduleRows.length === 0) return null

  // 4. Collect metadata
  const allResources = [...new Set(scheduleRows.flatMap(r => r.resources))].sort()

  const dates = scheduleRows
    .flatMap(r => [r.startDate, r.finishDate])
    .filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))

  const projectStart  = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
  const projectFinish = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null

  return {
    fileName:     fileName,
    projectName,
    rows:         scheduleRows,
    allResources,
    projectStart,
    projectFinish,
  }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function fmtDateShort(d: Date | null): string {
  if (!d) return "—"
  const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]
  return `${mo} ${d.getDate()}`
}

export function fmtDateFull(d: Date | null): string {
  if (!d) return "—"
  const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]
  return `${mo} ${d.getDate()}, ${d.getFullYear()}`
}

/** Compute visible rows after applying expand state and resource filter. */
export function getVisibleRows(
  rows:           ScheduleRow[],
  expandedIds:    Set<string>,
  resourceFilter: Set<string>,
): ScheduleRow[] {
  const result: ScheduleRow[] = []
  const parentAtLevel = new Map<number, string>() // level → last-seen parent id

  for (const row of rows) {
    // Clean stale parent entries for this level and deeper
    for (const [l] of parentAtLevel) {
      if (l >= row.level) parentAtLevel.delete(l)
    }

    // Check if every ancestor (level 1 … row.level-1) is in expandedIds
    let visible = true
    for (let l = 1; l < row.level; l++) {
      const parentId = parentAtLevel.get(l)
      if (!parentId || !expandedIds.has(parentId)) { visible = false; break }
    }

    // Resource filter: only apply to non-phase rows
    if (visible && resourceFilter.size > 0 && !row.isPhase && row.level > 1) {
      visible = row.resources.some(r => resourceFilter.has(r))
    }

    if (visible) result.push(row)
    parentAtLevel.set(row.level, row.id)
  }

  return result
}

/** Returns true if the row at [index] has any children in the flat list. */
export function hasChildren(rows: ScheduleRow[], index: number): boolean {
  const level = rows[index].level
  for (let i = index + 1; i < rows.length; i++) {
    if (rows[i].level <= level) return false
    if (rows[i].level > level) return true
  }
  return false
}
