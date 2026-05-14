"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy, Loader2, RefreshCw, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useQBTimeTeams } from "@/hooks/use-qbtime-teams"
import {
  useWhosWorking,
  useWhosWorkingExceptions,
  useUpsertException,
  useDeleteException,
} from "@/hooks/use-qbtime-whos-working"
import type { WhosWorkingResponse } from "@/services/qbtime-whos-working.service"

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPANIES = [
  { value: "framing", label: "Framing", logo: "/images/sublogo_framing.png" },
  { value: "hvac",    label: "HVAC",    logo: "/images/sublogo_hvac.png"    },
]

const COMPANY_META: Record<string, { label: string; logo: string }> = Object.fromEntries(
  COMPANIES.map(c => [c.value, { label: c.label, logo: c.logo }])
)

// ─── Hour formatting ──────────────────────────────────────────────────────────

function fmtElapsed(hours: number, mode: "decimal" | "time"): string {
  if (mode === "decimal") return `${hours.toFixed(1)}h`
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${String(m).padStart(2, "0")}`
}

// ─── Canvas renderer ──────────────────────────────────────────────────────────

const CANVAS_W  = 720
const PAD       = 28
const ROW_H     = 48
const COL_HDR_H = 30
const TEAM_H    = 40
const HEADER_H  = 88
const TEAM_GAP  = 14
const FOOTER_H  = 36
const SF        = "'Inter', system-ui, sans-serif"

// Fixed column X anchors
const COL_NAME    = PAD + 12              // ~40
const COL_IN_X    = 430                   // right-edge of "clock-in" value
const COL_ELA_X   = CANVAS_W - PAD - 12  // ~680

function calcCanvasHeight(data: WhosWorkingResponse): number {
  let h = HEADER_H + PAD
  for (const g of data.groups) {
    h += TEAM_H + COL_HDR_H + g.entries.length * ROW_H + TEAM_GAP
  }
  h += FOOTER_H
  return Math.max(h, 220)
}

function drawReport(
  canvas: HTMLCanvasElement,
  data: WhosWorkingResponse,
  mode: "decimal" | "time",
) {
  const H   = calcCanvasHeight(data)
  const dpr = window.devicePixelRatio || 1
  canvas.width        = CANVAS_W * dpr
  canvas.height       = H * dpr
  canvas.style.width  = `${CANVAS_W}px`
  canvas.style.height = `${H}px`

  const ctx = canvas.getContext("2d")!
  ctx.scale(dpr, dpr)

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "#0d1117"
  ctx.fillRect(0, 0, CANVAS_W, H)

  // ── Header ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#161b22"
  ctx.fillRect(0, 0, CANVAS_W, HEADER_H)

  // Left accent bar
  ctx.fillStyle = "#2563eb"
  ctx.fillRect(0, 0, 4, HEADER_H)

  // Company label
  ctx.font         = `600 12px ${SF}`
  ctx.fillStyle    = "#60a5fa"
  ctx.textAlign    = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(
    (COMPANY_META[data.company]?.label ?? data.company).toUpperCase(),
    PAD + 12, HEADER_H / 2 - 15,
  )

  // Main title
  ctx.font      = `bold 26px ${SF}`
  ctx.fillStyle = "#f0f6fc"
  ctx.fillText("WHO'S WORKING", PAD + 12, HEADER_H / 2 + 12)

  // Right — generated timestamp
  ctx.font      = `400 13px ${SF}`
  ctx.fillStyle = "#6e7681"
  ctx.textAlign = "right"
  ctx.fillText(`Generated  ${data.generatedAt}`, CANVAS_W - PAD - 12, HEADER_H / 2 - 15)

  // Right — on clock badge
  ctx.font      = `600 15px ${SF}`
  ctx.fillStyle = "#3fb950"
  ctx.fillText(`${data.totalOnClock} on clock`, CANVAS_W - PAD - 12, HEADER_H / 2 + 12)

  // ── Groups ───────────────────────────────────────────────────────────────────
  let y = HEADER_H + PAD

  for (const group of data.groups) {
    const bodyW = CANVAS_W - PAD * 2

    // Team header pill
    ctx.fillStyle = "#1c2128"
    roundRect(ctx, PAD, y, bodyW, TEAM_H, 7)
    ctx.fill()

    // Team name
    ctx.font         = `700 13px ${SF}`
    ctx.fillStyle    = "#c9d1d9"
    ctx.textAlign    = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(group.team.toUpperCase(), COL_NAME, y + TEAM_H / 2)

    // Count badge background
    const countStr  = String(group.entries.length)
    ctx.font        = `700 12px ${SF}`
    const countW    = ctx.measureText(countStr).width + 14
    const badgeX    = CANVAS_W - PAD - 12 - countW
    const badgeY    = y + TEAM_H / 2 - 9
    ctx.fillStyle   = "#238636"
    roundRect(ctx, badgeX, badgeY, countW, 18, 9)
    ctx.fill()
    ctx.fillStyle   = "#f0f6fc"
    ctx.textAlign   = "right"
    ctx.fillText(countStr, CANVAS_W - PAD - 19, y + TEAM_H / 2)

    y += TEAM_H

    // Column labels row
    ctx.fillStyle    = "#0f1318"
    ctx.fillRect(PAD, y, bodyW, COL_HDR_H)

    ctx.font         = `500 11px ${SF}`
    ctx.fillStyle    = "#484f58"
    ctx.textAlign    = "left"
    ctx.textBaseline = "middle"
    ctx.fillText("EMPLOYEE", COL_NAME, y + COL_HDR_H / 2)

    ctx.textAlign = "right"
    ctx.fillText("CLOCK IN", COL_IN_X, y + COL_HDR_H / 2)
    ctx.fillText("ELAPSED",  COL_ELA_X, y + COL_HDR_H / 2)

    y += COL_HDR_H

    // Employee rows
    for (let i = 0; i < group.entries.length; i++) {
      const entry = group.entries[i]
      const rowY  = y + i * ROW_H
      const mid   = rowY + ROW_H / 2

      // Row background
      ctx.fillStyle = i % 2 === 0 ? "#0d1117" : "#0f1318"
      ctx.fillRect(PAD, rowY, bodyW, ROW_H)

      // Bottom separator
      ctx.strokeStyle = "#21262d"
      ctx.lineWidth   = 1
      ctx.beginPath()
      ctx.moveTo(PAD + 16, rowY + ROW_H)
      ctx.lineTo(CANVAS_W - PAD - 16, rowY + ROW_H)
      ctx.stroke()

      // Name
      ctx.font         = `500 16px ${SF}`
      ctx.fillStyle    = "#e6edf3"
      ctx.textAlign    = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(entry.name, COL_NAME, mid)

      // Clock-in time
      ctx.font      = `500 15px ${SF}`
      ctx.fillStyle = "#58a6ff"
      ctx.textAlign = "right"
      ctx.fillText(entry.clockIn, COL_IN_X, mid)

      // Elapsed value
      ctx.font      = `700 16px ${SF}`
      ctx.fillStyle = "#3fb950"
      ctx.fillText(fmtElapsed(entry.elapsed, mode), COL_ELA_X, mid)
    }

    y += group.entries.length * ROW_H + TEAM_GAP
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  ctx.fillStyle    = "#30363d"
  ctx.fillRect(0, H - FOOTER_H, CANVAS_W, 1)

  ctx.font         = `400 11px ${SF}`
  ctx.fillStyle    = "#484f58"
  ctx.textAlign    = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("BOR2  ·  Premium Group", CANVAS_W / 2, H - FOOTER_H / 2)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ─── Exceptions panel ─────────────────────────────────────────────────────────

function ExceptionsPanel({ company }: { company: string }) {
  const { data: teams = [] }      = useQBTimeTeams(company)
  const { data: exceptions = [] } = useWhosWorkingExceptions(company)
  const upsert                    = useUpsertException(company)
  const remove                    = useDeleteException(company)

  const exceptionSet = new Set(exceptions.map(e => e.employeeName.toLowerCase()))

  function toggle(name: string) {
    const existing = exceptions.find(
      e => e.employeeName.toLowerCase() === name.toLowerCase()
    )
    if (existing) {
      remove.mutate(existing.id)
    } else {
      upsert.mutate(name)
    }
  }

  if (teams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No teams configured for this company.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {teams.map(team => (
        <div key={team.id}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {team.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {(team.members ?? []).map(member => {
              const excluded = exceptionSet.has(member.toLowerCase())
              return (
                <button
                  key={member}
                  onClick={() => toggle(member)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    excluded
                      ? "border-destructive/40 bg-destructive/10 text-destructive line-through"
                      : "border-border bg-secondary text-foreground hover:bg-accent",
                  ].join(" ")}
                >
                  {excluded && <UserX className="h-3 w-3" />}
                  {member}
                </button>
              )
            })}
            {(team.members ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No members.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WhosWorkingPage() {
  const [company,      setCompany]      = useState("framing")
  const [metricMode,   setMetricMode]   = useState<"decimal" | "time">("time")
  const [fetchEnabled, setFetchEnabled] = useState(false)
  const [copied,       setCopied]       = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { data, isFetching, refetch } = useWhosWorking(company, fetchEnabled)

  // Redraw whenever data or metric mode changes
  useEffect(() => {
    if (!data || !canvasRef.current) return
    drawReport(canvasRef.current, data, metricMode)
  }, [data, metricMode])

  // Reset fetch state when company changes so the button triggers a fresh call
  const handleCompanyChange = useCallback((val: string | null) => {
    if (!val) return
    setCompany(val)
    setFetchEnabled(false)
  }, [])

  function generate() {
    if (fetchEnabled) {
      refetch()
    } else {
      setFetchEnabled(true)
    }
  }

  function copyPNG() {
    if (!canvasRef.current) return
    // Fire visual feedback immediately — don't wait on async clipboard
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    canvasRef.current.toBlob(blob => {
      if (!blob) return
      navigator.clipboard
        .write([new ClipboardItem({ "image/png": blob })])
        .catch(() => {})
    })
  }

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">

        <div className="border-b border-sidebar-border px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40">
            Who's Working
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">

          {/* Company */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              Company
            </p>
            <div className="flex flex-col gap-1">
              {COMPANIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => handleCompanyChange(c.value)}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg border px-3 text-left transition-colors",
                    company === c.value
                      ? "border-border bg-accent text-accent-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={c.label} className="h-4 w-auto object-contain" src={c.logo} />
                  <span className="text-xs font-medium">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="-mx-4 h-px bg-sidebar-border" />

          {/* Metric Mode */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              Metric Mode
            </p>
            <div className="flex h-8 w-full items-center rounded-lg border border-border bg-muted/40 p-0.5">
              {(["decimal", "time"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMetricMode(m)}
                  className={cn(
                    "flex h-7 flex-1 items-center justify-center rounded-md text-xs font-medium transition-colors",
                    metricMode === m
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "time" ? "Hour" : "Number"}
                </button>
              ))}
            </div>
          </div>

          <div className="-mx-4 h-px bg-sidebar-border" />

          {/* Exceptions */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              Exceptions
            </p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Employees excluded from the report image.
            </p>
            <ExceptionsPanel company={company} />
          </div>

        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 border-t border-sidebar-border p-2">
          <Button onClick={generate} disabled={isFetching} className="w-full gap-2">
            {isFetching
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            {isFetching ? "Fetching…" : "Generate Report"}
          </Button>
          {data && (
            <Button
              variant="outline"
              size="sm"
              onClick={copyPNG}
              disabled={copied}
              className={cn(
                "relative w-full overflow-hidden transition-colors duration-200",
                copied && "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/15 disabled:opacity-100",
              )}
            >
              <span className={cn(
                "flex items-center gap-2 transition-all duration-200",
                copied ? "-translate-y-4 opacity-0" : "translate-y-0 opacity-100",
              )}>
                <Copy className="h-4 w-4" />
                Copy Image
              </span>
              <span className={cn(
                "absolute inset-0 flex items-center justify-center gap-2 transition-all duration-200",
                copied ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
              )}>
                <Check className="h-4 w-4" />
                Copied!
              </span>
            </Button>
          )}
        </div>

      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">

          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight">Who's Working Report</h1>
            <p className="text-sm text-muted-foreground">
              Real-time clock-in status from QuickBooks Time
            </p>
          </div>

          {!data && !isFetching && (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
              <RefreshCw className="h-8 w-8 opacity-40" />
              <p className="text-sm">Select a company and click Generate Report</p>
            </div>
          )}

          {isFetching && (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin opacity-60" />
              <p className="text-sm">Fetching from QuickBooks Time…</p>
            </div>
          )}

          {data && !isFetching && (
            <div className="overflow-x-auto">
              <div className="w-fit border border-border">
                <canvas ref={canvasRef} className="block" />
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  )
}
