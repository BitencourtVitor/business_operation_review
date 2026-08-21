"use client"

import type { ForecastDisplayStatus, ForecastProject } from "@bor2/shared"
import { getForecastDisplayStatus } from "@bor2/shared"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Fan,
  FileText,
  Flag,
  History,
  Info,
  MapPin,
  Package,
  PlayCircle,
  Puzzle,
  Snowflake,
  Thermometer,
  Truck,
  Users,
  Wrench,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import { ObsCredit, ObsHistoryPanel } from "./obs-history"
import { DateHistoryPanel } from "./date-history"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLocalDate(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, day)
}

function fmtDate(d?: string | null) {
  if (!d) return "—"
  return parseLocalDate(d).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })
}

function isTruthy(v?: string | boolean | null): boolean {
  if (typeof v === "boolean") return v
  if (!v) return false
  return ["yes", "sim", "true", "1", "y", "scheduled", "dispensed", "completed", "complete"]
    .includes(v.toString().toLowerCase().trim())
}

function getCompletionPct(p: ForecastProject): number {
  let done = 0, total = 0
  if (p.fieldwire?.length)     { total += p.fieldwire.length;     done += p.fieldwire.filter(f => isTruthy(f.status)).length }
  total++; if (p.buildertrend) done++
  total++; if (p.qbTime)       done++
  total++; if (p.storage)      done++
  if (p.machines?.length)      { total += p.machines.length;      done += p.machines.filter(m => isTruthy(m.status)).length }
  if (p.contractSteps?.length) { total += p.contractSteps.length; done += p.contractSteps.filter(c => isTruthy(c.status)).length }
  return total > 0 ? Math.round((done / total) * 100) : 0
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<
  ForecastDisplayStatus,
  { label: string; Icon: React.ElementType; color: string; bg: string; border: string }
> = {
  active:    { label: "Open",        Icon: PlayCircle,    color: "#22c55e", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.3)"   },
  planned:   { label: "Not Started", Icon: Clock,         color: "#3b82f6", bg: "rgba(59,130,246,0.12)",  border: "rgba(59,130,246,0.3)"  },
  overdue:   { label: "Overdue",     Icon: AlertTriangle, color: "#ef4444", bg: "rgba(239,68,68,0.12)",   border: "rgba(239,68,68,0.3)"   },
  completed: { label: "Closed",      Icon: CheckCircle2,  color: "#6b7280", bg: "rgba(107,114,128,0.12)", border: "rgba(107,114,128,0.3)" },
  cancelled: { label: "Cancelled",   Icon: XCircle,       color: "#a1a1aa", bg: "rgba(161,161,170,0.12)", border: "rgba(161,161,170,0.3)" },
}

function getBarColor(ds: ForecastDisplayStatus, pct: number): string {
  if (ds === "overdue")   return "#ef4444"
  if (ds === "completed") return "#6b7280"
  if (ds === "cancelled") return "#a1a1aa"
  if (pct === 100)        return "#3b82f6"
  if (pct > 0)            return "#f59e0b"
  return "#3b82f6"
}

// ─── Contract step canonical order ───────────────────────────────────────────

const CONTRACT_STEP_ORDER = [
  "Confirmação de seguros e apólices",
  "Purchase order",
  "Envio do contrato",
  "Aguardando assinatura",
  "Assinado",
]

// ─── Machine icon resolution ──────────────────────────────────────────────────
// Priority: boomlift image → forklift image → puzzle (attachment) → truck (generic)

const ATTACHMENT_KEYWORDS = [
  "attachment", "auger", "bucket", "forks", "fork", "jib",
  "man basket", "basket", "work platform", "platform",
  "truss", "pipe rack", "rack", "headache ball", "hook",
]

function MachineIcon({ title }: { title?: string | null }) {
  if (!title) return <Truck className="h-6 w-6 shrink-0 text-muted-foreground" />
  const t = title.toLowerCase()
  if (t.includes("boomlift"))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/images/boomlift.png" alt="Boomlift" className="h-7 w-7 shrink-0 object-contain" />
  if (t.includes("forklift"))
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/images/forklift.png" alt="Forklift" className="h-7 w-7 shrink-0 object-contain" />
  if (ATTACHMENT_KEYWORDS.some(k => t.includes(k)))
    return <Puzzle className="h-5 w-5 shrink-0 text-muted-foreground" />
  return <Truck className="h-5 w-5 shrink-0 text-muted-foreground" />
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5">
      {icon}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {children}
      </p>
    </div>
  )
}

function CheckRow({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5">
      {children}
      {done
        ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
        : <XCircle      className="h-5 w-5 shrink-0 text-amber-400"   />
      }
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export interface ForecastProjectSheetProps {
  project: ForecastProject
  open: boolean
  onClose: () => void
  dateMode?: "start" | "beams"
}

// As quatro etapas do ciclo de HVAC, cada uma com seu par de datas vindo das
// Orders (RS e RE da task).
const HVAC_STAGES: {
  Icon: React.ElementType
  label: string
  start: (p: ForecastProject) => string | null | undefined
  end:   (p: ForecastProject) => string | null | undefined
}[] = [
  { Icon: Wrench,      label: "Rough HVAC",
    start: p => p.hvacRoughDate,      end: p => p.hvacRoughEndDate      },
  { Icon: Fan,         label: "Air Handler / Gas Furnace Set",
    start: p => p.hvacAirHandlerDate, end: p => p.hvacAirHandlerEndDate },
  { Icon: Thermometer, label: "Install Condenser and Thermostat",
    start: p => p.hvacCondenserDate,  end: p => p.hvacCondenserEndDate  },
  { Icon: Snowflake,   label: "HVAC Finish Set A/C",
    start: p => p.hvacFinishDate,     end: p => p.hvacFinishEndDate     },
]

export function ForecastProjectSheet({ project: p, open, onClose, dateMode }: ForecastProjectSheetProps) {
  // Painel lateral: os dois ocupam a mesma coluna, então só um por vez. Estado
  // único porque a largura do modal depende de ter painel aberto, não de qual —
  // com um booleano por painel, esquecer de somar um deles esmaga o conteúdo.
  const [panel, setPanel] = useState<"obs" | "dates" | null>(null)
  const isHvac = p.company === "hvac"
  useEffect(() => { if (!open) setPanel(null) }, [open])

  const ds       = getForecastDisplayStatus(p, dateMode)
  const cfg      = STATUS_CFG[ds]
  const pct      = getCompletionPct(p)
  const barColor = getBarColor(ds, pct)

  const hasFieldwire = (p.fieldwire?.length ?? 0) > 0
  const hasContract  = (p.contractSteps?.length ?? 0) > 0
  const hasMachines  = (p.machines?.length ?? 0) > 0

  // Team label: prefer contract step teams, fallback to p.team
  const teams = p.contractSteps
    ? [...new Set(p.contractSteps.map(c => c.team).filter(Boolean) as string[])]
    : []
  const teamLabel = teams.length > 0
    ? (teams.length === 1 ? teams[0] : `${teams.length} teams`)
    : (p.team || null)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        className={cn(
          "flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:flex-row",
          panel
            ? "w-[min(92vw,460px)] sm:w-[780px] sm:max-w-[780px] sm:[&>[data-slot=dialog-close]]:right-[328px]"
            : "w-[min(92vw,460px)] sm:max-w-[460px]"
        )}
      >
        {/* ── Main column ───────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

        {/* Accessible title */}
        <DialogTitle className="sr-only">{p.cliente || p.name}</DialogTitle>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b">

          {/* Completion progress bar */}
          <div className="h-1 w-full" style={{ background: "rgba(0,0,0,0.08)" }}>
            <div
              className="h-full transition-[width] duration-500"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>

          {/* Project identity */}
          <div className="px-5 pb-4 pt-4 pr-12">

            {/* Client name + status badge */}
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <p className="text-base font-bold leading-tight">{p.cliente || p.name}</p>
              <div
                className="flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
              >
                <cfg.Icon className="h-2.5 w-2.5" />
                {cfg.label}
              </div>
            </div>

            {/* Jobsite + type / lot */}
            <div className="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>{p.jobSite}</span>
              {(p.type || p.loteBld) && (
                <>
                  <span className="text-border">|</span>
                  <span className="font-semibold text-foreground">
                    {p.type || "Lot"} {p.loteBld || "N/A"}
                  </span>
                </>
              )}
            </div>

            {/* Address */}
            {p.address && (
              <div className="mb-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{p.address}</span>
              </div>
            )}

            {/* Team */}
            <div
              className={cn(
                "flex items-center gap-1.5 text-xs",
                teamLabel
                  ? "text-foreground"
                  : "font-semibold text-amber-500 dark:text-amber-400"
              )}
            >
              <Users className="h-3 w-3 shrink-0" />
              <span>{teamLabel ?? "No team assigned"}</span>
            </div>
          </div>
        </div>

        {/* ── Scrollable body ────────────────────────────────────────────────── */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">

          {/* ── Overview ─────────────────────────────────────────────────────── */}
          <section>
            <SectionLabel icon={<Info className="h-3.5 w-3.5 text-muted-foreground" />}>
              Overview
            </SectionLabel>

            {/* No detalhe cabe o intervalo inteiro de cada etapa — é aqui que
                se vê quanto tempo cada uma leva e a folga entre elas, que o card
                não tem espaço para mostrar. */}
            {isHvac ? (
              <div className="mb-2 flex flex-col gap-1.5">
                {HVAC_STAGES.map(({ Icon, label, start, end }, i) => {
                  const from = start(p)
                  const to   = end(p)
                  return (
                    <div key={label} className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2",
                      from || to ? "border bg-muted/40" : "border border-dashed opacity-50",
                    )}>
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-xs">
                        <span className="font-semibold text-muted-foreground/70">S{i + 1} </span>
                        {label}
                      </span>
                      {from || to ? (
                        // Orçamento da linha: 396px úteis = ícone 14 + gap 10 +
                        // rótulo 216 + bloco de datas 156. O bloco é 68+4+12+4+68,
                        // onde 68 é a data cheia (66px a 11px) mais folga, e cada
                        // lado tem a mesma largura com ou sem data — é o que
                        // mantém setas e dias alinhados entre as quatro etapas.
                        // O rótulo mais longo mede 211px, então cabe inteiro.
                        <span className="flex shrink-0 items-center gap-1">
                          <span className={cn(
                            "w-[68px] text-[11px] font-semibold tabular-nums",
                            from ? "text-right" : "text-center font-normal text-muted-foreground/40",
                          )}>
                            {from ? fmtDate(from) : "—"}
                          </span>
                          <span className="text-xs text-muted-foreground/50">→</span>
                          <span className={cn(
                            "w-[68px] text-[11px] font-semibold tabular-nums",
                            to ? "text-left" : "text-center font-normal text-muted-foreground/40",
                          )}>
                            {to ? fmtDate(to) : "—"}
                          </span>
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] font-normal text-muted-foreground">not in orders</span>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mb-2 grid grid-cols-3 gap-2">
                {([
                  { Icon: Flag,           label: "Beams", value: p.previousBeamsDate },
                  { Icon: CalendarDays,   label: "Start", value: p.startDate         },
                  { Icon: CalendarCheck2, label: "End",   value: p.endDate           },
                ] as const).map(({ Icon, label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-1.5 rounded-lg border bg-muted/40 px-2 py-3 text-center"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={cn("text-xs font-semibold tabular-nums", !value && "font-normal text-muted-foreground/40")}>{fmtDate(value)}</span>
                    <span className="text-[9px] text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => setPanel(v => (v === "dates" ? null : "dates"))}
                className={cn(
                  "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                  panel === "dates"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <CalendarClock className="h-3 w-3" />
                Date history
              </button>
            </div>

            {p.obs?.trim() && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm leading-relaxed">
                {p.obs}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <ObsCredit author={p.obsAuthor} role={p.obsRole} at={p.obsAt} />
                  <button
                    type="button"
                    onClick={() => setPanel(v => (v === "obs" ? null : "obs"))}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
                      panel === "obs"
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <History className="h-3 w-3" />
                    History
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── Fieldwire ────────────────────────────────────────────────────── */}
          {hasFieldwire && (
            <section>
              <SectionLabel icon={
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/images/icon_fieldwire.png" alt="" className="h-3.5 w-3.5 object-contain" />
              }>
                Fieldwire Documents
              </SectionLabel>
              <div className="flex flex-col gap-2">
                {p.fieldwire?.slice()
                  .sort((a, b) => {
                    const rank = (doc?: string) =>
                      doc === "Markup" ? 2 : doc === "Shared with subcontractor" ? 1 : 0
                    return rank(a.document) - rank(b.document)
                  })
                  .map((fw, i) => (
                    <CheckRow key={fw.id ?? i} done={isTruthy(fw.status)}>
                      <span className="flex-1 text-sm">{fw.document || fw.category || "—"}</span>
                    </CheckRow>
                  ))}
              </div>
            </section>
          )}

          {/* ── Integrations ─────────────────────────────────────────────────── */}
          <section>
            <SectionLabel>Integrations</SectionLabel>
            <div className="flex flex-col gap-2">

              {/* A HVAC não usa BuilderTrend nem Storage: listá-los daria uma
                  pendência permanente de integração que ninguém vai fechar. */}
              {!isHvac && (
                <CheckRow done={!!p.buildertrend}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/icon_buildertrend.png"      alt="" className="h-5 w-5 shrink-0 object-contain dark:hidden" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/icon_buildertrend_dark.png" alt="" className="hidden h-5 w-5 shrink-0 object-contain dark:block" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">BuilderTrend</p>
                    <p className="text-xs text-muted-foreground">Project management &amp; scheduling</p>
                  </div>
                </CheckRow>
              )}

              <CheckRow done={!!p.qbTime}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/icon_qbtime.png"      alt="" className="h-5 w-5 shrink-0 object-contain dark:hidden" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/icon_qbtime_dark.png" alt="" className="hidden h-5 w-5 shrink-0 object-contain dark:block" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">QuickBooks Time</p>
                  <p className="text-xs text-muted-foreground">Labor time tracking</p>
                </div>
              </CheckRow>

              {!isHvac && (
                <CheckRow done={!!p.storage}>
                  <Package className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Storage</p>
                    <p className="text-xs text-muted-foreground">Inventory &amp; materials control</p>
                  </div>
                </CheckRow>
              )}

            </div>
          </section>

          {/* ── Contract Steps ───────────────────────────────────────────────── */}
          {hasContract && (
            <section>
              <SectionLabel icon={<FileText className="h-3.5 w-3.5 text-muted-foreground" />}>
                Contract Steps
              </SectionLabel>
              {(() => {
                const grouped: Record<string, NonNullable<ForecastProject["contractSteps"]>> = {}
                for (const cs of p.contractSteps!) {
                  const t = cs.team || "No team"
                  if (!grouped[t]) grouped[t] = []
                  grouped[t].push(cs)
                }
                return Object.entries(grouped).map(([team, steps], gi) => (
                  <div key={team} className={cn("rounded-lg border", gi > 0 && "mt-3")}>
                    <div className="flex items-center justify-center gap-2 border-b px-3 py-2 text-xs font-semibold">
                      <Users className="h-3.5 w-3.5" />
                      {team}
                    </div>
                    <div className="flex flex-col gap-1.5 p-2">
                      {[...steps]
                        .sort((a, b) => {
                          const ai = CONTRACT_STEP_ORDER.indexOf(a.step ?? "")
                          const bi = CONTRACT_STEP_ORDER.indexOf(b.step ?? "")
                          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
                        })
                        .map((cs, si) => (
                          <div
                            key={cs.id ?? si}
                            className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2"
                          >
                            <span className="flex-1 text-sm">{cs.step || "—"}</span>
                            {isTruthy(cs.status)
                              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                              : <XCircle      className="h-4 w-4 shrink-0 text-amber-400"   />
                            }
                          </div>
                        ))
                      }
                    </div>
                  </div>
                ))
              })()}
            </section>
          )}

          {/* ── Machines & Attachments ───────────────────────────────────────── */}
          {hasMachines && (
            <section>
              <SectionLabel icon={<Truck className="h-3.5 w-3.5 text-muted-foreground" />}>
                Machines &amp; Attachments
              </SectionLabel>
              {p.machineProvider && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Provided by {p.machineProvider}
                </p>
              )}
              <div className="flex flex-col gap-2">
                {p.machines?.map((m, i) => {
                  const isDispensed =
                    m.status?.toLowerCase() === "dispensed" ||
                    (!!m.unit && m.unit.length > 12 && !/^[A-Z0-9-]{1,10}$/i.test(m.unit))

                  return (
                    <div
                      key={m.id ?? i}
                      className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2.5"
                    >
                      <MachineIcon title={m.title} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{m.title || "—"}</p>
                        {m.unit && (
                          <p className={cn(
                            "text-xs",
                            isDispensed ? "italic text-amber-500" : "text-muted-foreground"
                          )}>
                            {isDispensed ? `Dispensed — ${m.unit}` : `Unit: ${m.unit}`}
                          </p>
                        )}
                      </div>
                      {isTruthy(m.status)
                        ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                        : <XCircle      className="h-5 w-5 shrink-0 text-amber-400"   />
                      }
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <div className="h-4" />
        </div>
        </div>

        {/* ── Observation history, side-by-side with the body ──────────────── */}
        {panel === "dates" && (
          <DateHistoryPanel projectId={p.id} company={p.company} open onClose={() => setPanel(null)} />
        )}
        {panel === "obs" && (
          <ObsHistoryPanel projectId={p.id} open onClose={() => setPanel(null)} />
        )}
      </DialogContent>
    </Dialog>
  )
}
