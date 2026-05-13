"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, Loader2, RefreshCw, Settings2, UserX, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
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
  { value: "framing", label: "Framing" },
  { value: "hvac",    label: "HVAC"    },
]

const COMPANY_LABEL: Record<string, string> = { framing: "Framing", hvac: "HVAC" }

// ─── Hour formatting ──────────────────────────────────────────────────────────

function fmtElapsed(hours: number, mode: "decimal" | "time"): string {
  if (mode === "decimal") return `${hours.toFixed(1)}h`
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h}:${String(m).padStart(2, "0")}`
}

// ─── Canvas renderer ──────────────────────────────────────────────────────────

const CANVAS_W       = 860
const PAD            = 28
const ROW_H          = 42
const TEAM_H         = 38
const HEADER_H       = 76
const TEAM_GAP       = 14
const FOOTER_H       = 32

function calcCanvasHeight(data: WhosWorkingResponse): number {
  let h = HEADER_H + PAD
  for (const g of data.groups) {
    h += TEAM_H + g.entries.length * ROW_H + TEAM_GAP
  }
  h += FOOTER_H + PAD
  return Math.max(h, 200)
}

function drawReport(
  canvas: HTMLCanvasElement,
  data: WhosWorkingResponse,
  mode: "decimal" | "time",
) {
  const H  = calcCanvasHeight(data)
  canvas.width  = CANVAS_W
  canvas.height = H

  const ctx = canvas.getContext("2d")!
  const dpr = window.devicePixelRatio || 1
  canvas.width  = CANVAS_W * dpr
  canvas.height = H       * dpr
  canvas.style.width  = `${CANVAS_W}px`
  canvas.style.height = `${H}px`
  ctx.scale(dpr, dpr)

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = "#0d1117"
  ctx.fillRect(0, 0, CANVAS_W, H)

  // ── Header band ─────────────────────────────────────────────────────────────
  ctx.fillStyle = "#161b22"
  ctx.fillRect(0, 0, CANVAS_W, HEADER_H)

  // Accent line
  ctx.fillStyle = "#2563eb"
  ctx.fillRect(0, 0, 4, HEADER_H)

  // Company name
  ctx.font      = "bold 15px 'Inter', system-ui, sans-serif"
  ctx.fillStyle = "#60a5fa"
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(COMPANY_LABEL[data.company] ?? data.company, PAD + 8, HEADER_H / 2 - 10)

  // Title
  ctx.font      = "bold 22px 'Inter', system-ui, sans-serif"
  ctx.fillStyle = "#f0f6fc"
  ctx.fillText("WHO'S WORKING", PAD + 8, HEADER_H / 2 + 12)

  // Generated at — right side
  ctx.font      = "13px 'Inter', system-ui, sans-serif"
  ctx.fillStyle = "#8b949e"
  ctx.textAlign = "right"
  ctx.fillText(`Generated ${data.generatedAt}`, CANVAS_W - PAD, HEADER_H / 2 - 10)

  // Total on clock
  ctx.font      = "bold 13px 'Inter', system-ui, sans-serif"
  ctx.fillStyle = "#3fb950"
  ctx.fillText(`${data.totalOnClock} on clock`, CANVAS_W - PAD, HEADER_H / 2 + 12)

  // ── Team groups ─────────────────────────────────────────────────────────────
  let y = HEADER_H + PAD

  for (const group of data.groups) {
    // Team header row
    ctx.fillStyle = "#1c2128"
    roundRect(ctx, PAD, y, CANVAS_W - PAD * 2, TEAM_H, 6)
    ctx.fill()

    ctx.fillStyle = "#e6edf3"
    ctx.font      = "bold 12px 'Inter', system-ui, sans-serif"
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(group.team.toUpperCase(), PAD + 12, y + TEAM_H / 2)

    ctx.fillStyle = "#3fb950"
    ctx.font      = "bold 11px 'Inter', system-ui, sans-serif"
    ctx.textAlign = "right"
    ctx.fillText(`${group.entries.length}`, CANVAS_W - PAD - 12, y + TEAM_H / 2)

    y += TEAM_H

    // Employee rows
    for (let i = 0; i < group.entries.length; i++) {
      const entry = group.entries[i]
      const rowY  = y + i * ROW_H

      // Alternate row shading
      if (i % 2 === 0) {
        ctx.fillStyle = "#0d1117"
      } else {
        ctx.fillStyle = "#13191f"
      }
      ctx.fillRect(PAD, rowY, CANVAS_W - PAD * 2, ROW_H)

      // Separator line
      ctx.strokeStyle = "#21262d"
      ctx.lineWidth   = 1
      ctx.beginPath()
      ctx.moveTo(PAD, rowY + ROW_H)
      ctx.lineTo(CANVAS_W - PAD, rowY + ROW_H)
      ctx.stroke()

      const mid = rowY + ROW_H / 2

      // Name
      ctx.font      = "14px 'Inter', system-ui, sans-serif"
      ctx.fillStyle = "#e6edf3"
      ctx.textAlign = "left"
      ctx.textBaseline = "middle"
      ctx.fillText(entry.name, PAD + 12, mid)

      // Clock-in label + time — center column
      const centerX = CANVAS_W * 0.5
      ctx.font      = "11px 'Inter', system-ui, sans-serif"
      ctx.fillStyle = "#8b949e"
      ctx.textAlign = "right"
      ctx.fillText("In:", centerX - 4, mid)

      ctx.font      = "13px 'Inter', system-ui, sans-serif"
      ctx.fillStyle = "#60a5fa"
      ctx.textAlign = "left"
      ctx.fillText(entry.clockIn, centerX + 4, mid)

      // Elapsed label + value — right column
      const rightX = CANVAS_W - PAD - 12
      ctx.font      = "11px 'Inter', system-ui, sans-serif"
      ctx.fillStyle = "#8b949e"
      ctx.textAlign = "right"
      ctx.fillText("Elapsed:", rightX - 52, mid)

      ctx.font      = "bold 13px 'Inter', system-ui, sans-serif"
      ctx.fillStyle = "#3fb950"
      ctx.textAlign = "right"
      ctx.fillText(fmtElapsed(entry.elapsed, mode), rightX, mid)
    }

    y += group.entries.length * ROW_H + TEAM_GAP
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#8b949e"
  ctx.font      = "11px 'Inter', system-ui, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("BOR2 · Premium Group", CANVAS_W / 2, H - FOOTER_H / 2)
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
  const [company,     setCompany]     = useState("framing")
  const [metricMode,  setMetricMode]  = useState<"decimal" | "time">("time")
  const [fetchEnabled, setFetchEnabled] = useState(false)
  const [showExceptions, setShowExceptions] = useState(false)
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

  function exportPNG() {
    if (!canvasRef.current) return
    const link = document.createElement("a")
    link.download = `whos-working-${company}-${new Date().toISOString().slice(0, 16).replace("T", "_")}.png`
    link.href = canvasRef.current.toDataURL("image/png")
    link.click()
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-semibold">Who's Working</h1>
        <p className="text-sm text-muted-foreground">
          Real-time clock-in status from QuickBooks Time
        </p>
      </div>

      {/* ── Controls ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={company} onValueChange={handleCompanyChange}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPANIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={generate} disabled={isFetching} className="gap-2">
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {isFetching ? "Fetching…" : "Generate Report"}
        </Button>

        {/* Metric mode toggle */}
        <div className="flex items-center rounded-lg border border-input overflow-hidden">
          {(["time", "decimal"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMetricMode(m)}
              className={[
                "px-3 py-1 text-xs font-medium transition-colors",
                metricMode === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {m === "time" ? "3:30" : "3.5h"}
            </button>
          ))}
        </div>

        {data && (
          <>
            <Button variant="outline" size="sm" onClick={exportPNG} className="gap-2">
              <Download className="h-4 w-4" />
              PNG
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExceptions(v => !v)}
              className="gap-2 ml-auto"
            >
              <Settings2 className="h-4 w-4" />
              Exceptions
            </Button>
          </>
        )}
      </div>

      {/* ── Exceptions panel ────────────────────────────────────────────────── */}
      {showExceptions && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold">Exception List</p>
              <p className="text-xs text-muted-foreground">
                Employees marked as exceptions are excluded from the report image.
              </p>
            </div>
            <button
              onClick={() => setShowExceptions(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ExceptionsPanel company={company} />
        </div>
      )}

      {/* ── Canvas / placeholder ─────────────────────────────────────────────── */}
      {!data && !isFetching && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 h-64 gap-3 text-muted-foreground">
          <RefreshCw className="h-8 w-8 opacity-40" />
          <p className="text-sm">Select a company and click Generate Report</p>
        </div>
      )}

      {isFetching && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 h-64 gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin opacity-60" />
          <p className="text-sm">Fetching from QuickBooks Time…</p>
        </div>
      )}

      {data && !isFetching && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <canvas ref={canvasRef} className="block" />
        </div>
      )}
    </div>
  )
}
