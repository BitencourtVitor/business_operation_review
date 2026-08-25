"use client"

import type { ForecastDisplayStatus, ForecastProject } from "@bor2/shared"
import { getForecastDisplayStatus } from "@bor2/shared"
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Fan,
  FileText,
  Flag,
  MapPin,
  Package,
  PlayCircle,
  ShieldCheck,
  Snowflake,
  Thermometer,
  Truck,
  Users,
  Wrench,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { ForecastProjectSheet } from "./forecast-project-sheet"
import { ObsCredit } from "./obs-history"

// ─── Status config ────────────────────────────────────────────────────────────

interface StatusColors {
  border: string
  bar: string
  text: string
  bg: string
}

const STATUS_CONFIG: Record<
  ForecastDisplayStatus,
  { label: string; Icon: React.ElementType; vivid: StatusColors; muted: StatusColors }
> = {
  active: {
    label: "Open", Icon: PlayCircle,
    vivid: { border: "#22c55e", bar: "#22c55e", text: "#22c55e", bg: "rgba(34,197,94,0.12)" },
    muted: { border: "rgba(34,197,94,0.22)", bar: "rgba(34,197,94,0.22)", text: "rgba(34,197,94,0.6)", bg: "rgba(34,197,94,0.06)" },
  },
  planned: {
    label: "Not Started", Icon: Clock,
    vivid: { border: "#3b82f6", bar: "#3b82f6", text: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
    muted: { border: "rgba(59,130,246,0.22)", bar: "rgba(59,130,246,0.22)", text: "rgba(59,130,246,0.6)", bg: "rgba(59,130,246,0.06)" },
  },
  overdue: {
    label: "Overdue", Icon: AlertTriangle,
    vivid: { border: "#ef4444", bar: "#ef4444", text: "#ef4444", bg: "rgba(239,68,68,0.12)" },
    muted: { border: "rgba(239,68,68,0.22)", bar: "rgba(239,68,68,0.22)", text: "rgba(239,68,68,0.6)", bg: "rgba(239,68,68,0.06)" },
  },
  completed: {
    label: "Closed", Icon: CheckCircle2,
    vivid: { border: "#6b7280", bar: "#6b7280", text: "#6b7280", bg: "rgba(107,114,128,0.12)" },
    muted: { border: "rgba(107,114,128,0.2)", bar: "rgba(107,114,128,0.2)", text: "rgba(107,114,128,0.5)", bg: "rgba(107,114,128,0.05)" },
  },
  cancelled: {
    label: "Cancelled", Icon: CheckCircle2,
    vivid: { border: "#a1a1aa", bar: "#a1a1aa", text: "#a1a1aa", bg: "rgba(161,161,170,0.12)" },
    muted: { border: "rgba(161,161,170,0.18)", bar: "rgba(161,161,170,0.18)", text: "rgba(161,161,170,0.45)", bg: "rgba(161,161,170,0.05)" },
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLocalDate(d: string): Date {
  // Slice to "YYYY-MM-DD" and build as local time to avoid UTC-offset day shift
  const [y, m, day] = d.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, day)
}

function fmt(d?: string | null) {
  if (!d) return "N/A"
  return parseLocalDate(d).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
}

function isTruthy(v?: string | boolean | null): boolean {
  if (typeof v === "boolean") return v
  if (!v) return false
  return ["yes", "sim", "true", "1", "y", "scheduled", "dispensed", "completed", "complete"].includes(v.toString().toLowerCase().trim())
}

function getCompletionMetrics(p: ForecastProject) {
  let done = 0, total = 0

  // A HVAC não usa Fieldwire, Buildertrend, Storage, Machines nem Contract.
  // Contar esses itens daria uma obra eternamente em 0%, medindo integração que
  // não existe — o único preparo que a HVAC tem hoje é o QB Time.
  if (p.company === "hvac") {
    return { pct: p.qbTime ? 100 : 0, done: p.qbTime ? 1 : 0, total: 1 }
  }

  // Fieldwire docs
  if (p.fieldwire?.length) {
    total += p.fieldwire.length
    done  += p.fieldwire.filter((f) => isTruthy(f.status)).length
  }
  // BuilderTrend
  total++; if (p.buildertrend) done++
  // QB Time
  total++; if (p.qbTime) done++
  // Storage
  total++; if (p.storage) done++
  // Machines
  if (p.machines?.length) {
    total += p.machines.length
    done  += p.machines.filter((m) => isTruthy(m.status)).length
  }
  // Contract steps
  if (p.contractSteps?.length) {
    total += p.contractSteps.length
    done  += p.contractSteps.filter((c) => isTruthy(c.status)).length
  }

  return { pct: total > 0 ? Math.round((done / total) * 100) : 0, done, total }
}

function getBarColor(ds: ForecastDisplayStatus, pct: number, hovered: boolean): string {
  const cfg = STATUS_CONFIG[ds]
  if (!hovered) return cfg.muted.bar

  // Vivid — overdue always red, completed grey, planned blue
  // active in-progress → amber, active 100% → blue
  if (ds === "overdue")   return "#ef4444"
  if (ds === "completed") return "#6b7280"
  if (ds === "cancelled") return "#a1a1aa"
  if (pct === 100)        return "#3b82f6"
  return "#f59e0b"
}

// ─── SVG progress border (BOR1 style) ────────────────────────────────────────

const RECT_PERIMETER = 4 * 27 // 28px square, 0.5px inset → 27px side

function ProgressBorder({ pct, complete }: { pct: number; complete: boolean }) {
  if (pct === 0) return null
  const dash = complete ? RECT_PERIMETER : (pct / 100) * RECT_PERIMETER
  const color = complete ? "#4ade80" : "#fbbf24"
  return (
    <svg
      width="28"
      height="28"
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    >
      <rect
        x="0.5" y="0.5" width="27" height="27" rx="5.5"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray={`${dash} ${RECT_PERIMETER}`}
        strokeDashoffset="0"
      />
    </svg>
  )
}

// ─── Icon container ───────────────────────────────────────────────────────────

function IconSlot({
  done,
  pct,
  complete,
  withProgress = false,
  title,
  children,
}: {
  done: boolean
  pct?: number
  complete?: boolean
  withProgress?: boolean
  title: string
  children: React.ReactNode
}) {
  const active = withProgress ? (pct ?? 0) > 0 || complete : done
  return (
    <div
      title={title}
      style={{ position: "relative", width: 28, height: 28 }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: !withProgress && done ? "1.5px solid #4ade80" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: active ? 1 : 0.4,
          filter: active ? "none" : "grayscale(100%)",
          transition: "all 0.2s ease",
          overflow: "hidden",
        }}
        className="bg-muted"
      >
        {children}
      </div>
      {withProgress && (
        <ProgressBorder pct={pct ?? 0} complete={complete ?? false} />
      )}
    </div>
  )
}

// ─── Date cell ────────────────────────────────────────────────────────────────

function DateCell({ icon: Icon, value, label, stage }: {
  icon: React.ElementType
  value?: string | null
  label: string
  /** Número da etapa no ciclo. O fim da obra não é etapa, então vai sem. */
  stage?: number
}) {
  const missing = !value
  return (
    <div className={cn(
      "flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5",
      // Data ausente é lacuna, não valor: fundo vazio e traço no lugar de "N/A",
      // que se lia como se houvesse algo escrito ali.
      missing ? "border border-dashed bg-transparent opacity-50" : "border bg-muted/50",
    )}>
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className={cn(
          "truncate text-[10px] tabular-nums",
          missing ? "font-normal text-muted-foreground" : "font-medium",
        )}>
          {value ? fmt(value) : "—"}
        </span>
        <span className="truncate text-[9px] text-muted-foreground">
          {stage && <span className="font-semibold text-muted-foreground/70">S{stage} </span>}
          {label}
        </span>
      </div>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function ForecastCard({ project: p, dateMode }: { project: ForecastProject; dateMode?: "start" | "beams" }) {
  const [hovered, setHovered] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const displayStatus = getForecastDisplayStatus(p, dateMode)
  const cfg = STATUS_CONFIG[displayStatus]
  const StatusIcon = cfg.Icon
  const { pct } = getCompletionMetrics(p)
  const colors = hovered ? cfg.vivid : cfg.muted
  const barColor = getBarColor(displayStatus, pct, hovered)

  // Empresa parceira: outra empresa do grupo que atua nesta mesma obra física.
  // Vem do vínculo por endereço (forecast_sites), com fallback na marcação
  // manual antiga enquanto houver obra sem vínculo — antes disso o selo era um
  // checkbox que alguém precisava lembrar de marcar.
  const isHvac = p.company === "hvac"
  const linked = p.linkedCompanies ?? []
  const linkedCompany =
    p.company !== "hvac" && (linked.includes("hvac") || p.hvac)
      ? { label: "HVAC", title: "HVAC work included", icon: "/images/icon_forecast_hvac.png" }
      : p.company === "hvac" && linked.includes("framing")
      ? { label: "Framing", title: "Framing work included", icon: "/images/sublogo_framing.png" }
      : null

  // O que decide mostrar o ciclo de quatro etapas é ter etapa, não ter pedido.
  // Obra sem Order passou a receber as datas do Job Schedule do Hyphen, que as
  // tem para todas as obras — esconder o ciclo dela era esconder dado real.
  const hasStageDates = !!(p.hvacRoughDate || p.hvacAirHandlerDate || p.hvacCondenserDate || p.hvacFinishDate)
  // O aviso é sobre falta de cronograma, não sobre a Order em si: com as quatro
  // etapas na tela, ele contradizia o próprio card — dizia que não havia pedido
  // logo acima das datas do serviço, e ainda repetia a mesma frase no lugar do
  // cronograma. Obra que já tem etapa não carrega mais nenhum dos dois.
  const showNoOrders =
    p.cliente?.toLowerCase().startsWith("toll brothers") && !p.hasOrders && !hasStageDates
  const noOrdersColors = hovered
    ? { border: "#eab308", bg: "rgba(234,179,8,0.12)", text: "#eab308" }
    : { border: "rgba(234,179,8,0.22)", bg: "rgba(234,179,8,0.06)", text: "rgba(234,179,8,0.6)" }

  // Fieldwire progress
  const fwTotal    = p.fieldwire?.length ?? 0
  const fwDone     = p.fieldwire?.filter((f) => isTruthy(f.status)).length ?? 0
  const fwPct      = fwTotal > 0 ? Math.round((fwDone / fwTotal) * 100) : 0
  const fwComplete = fwTotal > 0 && fwDone === fwTotal

  // Permit progress — só a HVAC tem etapas de alvará.
  const pmTotal    = p.permit?.length ?? 0
  const pmDone     = p.permit?.filter((s) => isTruthy(s.status)).length ?? 0
  const pmPct      = pmTotal > 0 ? Math.round((pmDone / pmTotal) * 100) : 0
  const pmComplete = pmTotal > 0 && pmDone === pmTotal

  // Machines progress — Private obras never need machines (no catalog entries
  // for that client), so treat them as complete instead of perpetually pending.
  const isPrivate = p.cliente?.toLowerCase().trim() === "private"
  const mTotal    = p.machines?.length ?? 0
  const mDone     = p.machines?.filter((m) => isTruthy(m.status)).length ?? 0
  const mPct      = isPrivate ? 100 : (mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0)
  const mComplete = isPrivate || (mTotal > 0 && mDone === mTotal)

  // Contract progress
  const cTotal    = p.contractSteps?.length ?? 0
  const cDone     = p.contractSteps?.filter((c) => isTruthy(c.status)).length ?? 0
  const cPct      = cTotal > 0 ? Math.round((cDone / cTotal) * 100) : 0
  const cComplete = cTotal > 0 && cDone === cTotal

  // Team: from contractSteps first, fallback to p.team
  const teams = p.contractSteps
    ? [...new Set(p.contractSteps.map((c) => c.team).filter(Boolean) as string[])]
    : []
  const teamLabel = teams.length > 0
    ? (teams.length === 1 ? teams[0] : `${teams.length} teams`)
    : (p.team || null)

  return (
    <>
    <ForecastProjectSheet project={p} open={sheetOpen} onClose={() => setSheetOpen(false)} dateMode={dateMode} />
    <div
      style={{ borderColor: colors.border, transition: "border-color 0.25s ease, box-shadow 0.25s ease" }}
      className="relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card shadow-sm hover:shadow-md"
      onClick={() => setSheetOpen(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Completion bar ── */}
      <div className="h-1 w-full" style={{ background: "rgba(0,0,0,0.08)" }}>
        <div
          style={{ width: `${pct}%`, background: barColor, transition: "background 0.25s ease, width 0.25s ease" }}
          className="h-full"
        />
      </div>

      <div className="flex flex-col gap-3 p-3.5">

        {/* ── Top: info left · icons right ── */}
        <div className="flex gap-3">

          {/* Left column */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">

            {/* Client + Jobsite */}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">{p.cliente || p.name}</p>
              <p className="truncate text-xs text-muted-foreground">{p.jobSite || p.name}</p>
            </div>

            {/* Status badge */}
            <div
              className="flex w-fit items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{
                color: colors.text,
                background: colors.bg,
                borderColor: colors.border,
                transition: "color 0.25s ease, background 0.25s ease, border-color 0.25s ease",
              }}
            >
              <StatusIcon className="h-2.5 w-2.5" />
              {cfg.label}
            </div>

            {/* Has Orders badge — Toll Brothers only */}
            {showNoOrders && (
              <div
                className="flex w-fit items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  color: noOrdersColors.text,
                  background: noOrdersColors.bg,
                  borderColor: noOrdersColors.border,
                  transition: "color 0.25s ease, background 0.25s ease, border-color 0.25s ease",
                }}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                Hasn&apos;t Orders Yet
              </div>
            )}

            {/* Address */}
            {p.address && (
              <div className="flex items-start gap-1 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="leading-snug">{p.address}</span>
              </div>
            )}

            {/* Type + Lot */}
            {(p.type || p.loteBld) && (
              <div className="flex items-center gap-1 text-xs font-semibold">
                <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span>{p.type || "Lot"} {p.loteBld || "N/A"}</span>
              </div>
            )}

            {/* Contract icon + Team */}
            <div className={`flex items-center gap-1 text-xs ${teamLabel ? "text-foreground" : "font-semibold text-amber-500 dark:text-amber-400"}`}>
              {cComplete && (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
              )}
              <Users className="h-3 w-3 shrink-0" />
              <span className="truncate">{teamLabel ?? "No team assigned"}</span>
            </div>

            {/* Machine provider */}
            {p.machineProvider && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Truck className="h-3 w-3 shrink-0" />
                <span className="truncate">{p.machineProvider}</span>
              </div>
            )}
          </div>

          {/* Right column: 2×3 icon grid */}
          <div className="flex flex-col items-center gap-1.5">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 28px)", gap: 6 }}>
              {/* A HVAC não tem BuilderTrend, Storage, Fieldwire nem Machines —
                  esses slots seriam pendência que nunca fecha. O que ela tem, e
                  a Framing não, é o Permit. */}
              {isHvac ? (
                <>
                <IconSlot done={p.qbTime} title="QuickBooks Time">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/icon_qbtime.png"      alt="QBT" style={{ width: 16, height: 16, objectFit: "contain" }} className="dark:hidden" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/icon_qbtime_dark.png" alt="QBT" style={{ width: 16, height: 16, objectFit: "contain" }} className="hidden dark:block" />
                </IconSlot>

                <IconSlot done={pmDone > 0} pct={pmPct} complete={pmComplete} withProgress
                  title={`Permit — ${pmDone}/${pmTotal}`}>
                  <ShieldCheck style={{ width: 16, height: 16 }} />
                </IconSlot>
                </>
              ) : (
                <>

                {/* Fieldwire */}
                <IconSlot done={fwDone > 0} pct={fwPct} complete={fwComplete} withProgress title="Fieldwire">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/icon_fieldwire.png" alt="Fieldwire" style={{ width: 16, height: 16, objectFit: "contain" }} />
                </IconSlot>
  
                {/* BuilderTrend */}
                <IconSlot done={p.buildertrend} title="BuilderTrend">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/icon_buildertrend.png"      alt="BT" style={{ width: 16, height: 16, objectFit: "contain" }} className="dark:hidden" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/icon_buildertrend_dark.png" alt="BT" style={{ width: 16, height: 16, objectFit: "contain" }} className="hidden dark:block" />
                </IconSlot>
  
                {/* QB Time */}
                <IconSlot done={p.qbTime} title="QuickBooks Time">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/icon_qbtime.png"      alt="QBT" style={{ width: 16, height: 16, objectFit: "contain" }} className="dark:hidden" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/icon_qbtime_dark.png" alt="QBT" style={{ width: 16, height: 16, objectFit: "contain" }} className="hidden dark:block" />
                </IconSlot>
  
                {/* Storage */}
                <IconSlot done={p.storage} title="Storage">
                  <Package className="h-3.5 w-3.5 text-foreground" />
                </IconSlot>
  
                {/* Machines */}
                <IconSlot done={isPrivate || mDone > 0} pct={mPct} complete={mComplete} withProgress title={isPrivate ? "Machines & Attachments (not required)" : "Machines & Attachments"}>
                  <Truck className="h-3.5 w-3.5 text-foreground" />
                </IconSlot>
  
                {/* Contract */}
                <IconSlot done={cDone > 0} pct={cPct} complete={cComplete} withProgress title="Contract Steps">
                  <FileText className="h-3.5 w-3.5 text-foreground" />
                </IconSlot>
                </>
              )}
            </div>

            {/* Empresa parceira na mesma obra — derivado do vínculo por
                endereço (forecast_sites), não mais de um checkbox. A Framing
                mostra HVAC; a HVAC mostra Framing. */}
            {linkedCompany && (
              <>
                <div className="w-full border-t" />
                <div
                  style={{
                    width: 28, height: 28, borderRadius: 6, border: "1.5px solid #6b7280",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  className="bg-muted"
                  title={linkedCompany.title}
                >
                  {/* Mesmo selo colorido nos dois temas — é marca de empresa,
                      não ícone de interface. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={linkedCompany.icon} alt={linkedCompany.label} style={{ width: 16, height: 16, objectFit: "contain" }} />
                </div>
              </>
            )}
          </div>

        </div>

        {/* ── Date row ──
            A HVAC acompanha quatro etapas em vez dos três marcos da Framing:
            o início da obra é o Rough e o fim é o Finish, então start/end não
            precisam de célula própria — estariam repetindo a primeira e a
            última. */}
        {isHvac ? (
          // Cinco datas: o início de cada uma das quatro etapas e o fim da obra,
          // que é o fim da etapa 4. Em duas linhas de três e duas — as quatro
          // numa linha só espremiam a data até cortar.
          !hasStageDates ? (
            // Sem etapa nenhuma a obra tem uma data só, a do calendário do
            // cliente. Mostrar quatro campos vazios sugeriria dado faltando,
            // quando não há o que faltar ainda.
            <div className="flex flex-col gap-1.5 border-t pt-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                <DateCell icon={CalendarDays} value={p.jobOpenedDate} label="Job schedule" />
                <div className="flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-[9px] font-semibold uppercase leading-tight tracking-wide text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  No order issued
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 border-t pt-2.5">
              <div className="grid grid-cols-3 gap-1.5">
                <DateCell icon={Wrench}      value={p.hvacRoughDate}      label="Rough"     stage={1} />
                <DateCell icon={Fan}         value={p.hvacAirHandlerDate} label="Air Hdlr"  stage={2} />
                <DateCell icon={Thermometer} value={p.hvacCondenserDate}  label="Condenser" stage={3} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <DateCell icon={Snowflake}      value={p.hvacFinishDate}    label="Finish"     stage={4} />
                {/* Fim da obra. O que o separa das etapas é a posição — sozinho
                    na segunda linha, ao lado do Finish — não cor. */}
                <DateCell icon={CalendarCheck2} value={p.hvacFinishEndDate} label="End of job" />
              </div>
            </div>
          )
        ) : (
          <div className="grid grid-cols-3 gap-1.5 border-t pt-2.5">
            <DateCell icon={Flag}           value={p.previousBeamsDate} label="Beams" />
            <DateCell icon={CalendarDays}   value={p.startDate}         label="Start" />
            <DateCell icon={CalendarCheck2} value={p.endDate}           label="End"   />
          </div>
        )}

        {/* ── Observations (latest entry) ── */}
        {p.obs && (
          <div className="rounded-lg border bg-muted/60 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
            {p.obs}
            {(p.obsAuthor || p.obsAt) && (
              <div className="mt-1.5 flex justify-end">
                <ObsCredit author={p.obsAuthor} role={p.obsRole} at={p.obsAt} />
              </div>
            )}
          </div>
        )}

      </div>
    </div>
    </>
  )
}
