"use client"

import {
  Activity, AlertTriangle, Ban, CheckCircle2, Clock, Layers, MapPin, Settings, ShieldCheck, Workflow, XCircle,
} from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { formatDate, type ProjectStages, type Stage } from "../_lib/stages"
import { Tip } from "./tip"

// Os detalhes da obra da HVAC, só para ler. O desenho segue o do modal do
// Forecast: faixa de progresso, identidade da obra no cabeçalho e blocos com
// rótulo no corpo. Para alterar, o caminho é a engrenagem.

type Situation = "done" | "running" | "delayed" | "upcoming"

const SITUATION: Record<Situation, { label: string; Icon: React.ElementType; className: string }> = {
  done: { label: "Completed", Icon: CheckCircle2, className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  running: { label: "In progress", Icon: Activity, className: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  delayed: { label: "Delayed", Icon: AlertTriangle, className: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" },
  upcoming: { label: "Upcoming", Icon: Clock, className: "border-border bg-muted text-muted-foreground" },
}

function situationOf(lot: ProjectStages): Situation {
  if (lot.percent === 100) return "done"
  if (lot.stages.some(s => s.state === "delayed")) return "delayed"
  if (lot.stages.some(s => s.actualStart)) return "running"
  return "upcoming"
}

const STAGE_ICON: Record<Stage["state"], { Icon: React.ElementType; className: string; label: string }> = {
  done: { Icon: CheckCircle2, className: "text-emerald-500", label: "Completed" },
  running: { Icon: Activity, className: "text-blue-500", label: "In progress" },
  delayed: { Icon: AlertTriangle, className: "text-red-500", label: "Delayed" },
  upcoming: { Icon: Clock, className: "text-muted-foreground", label: "Upcoming" },
  undated: { Icon: Clock, className: "text-muted-foreground/40", label: "No date" },
}

export function ProjectDetailsDialog({
  lot, lotLabel, open, onOpenChange, onSettings,
}: {
  lot: ProjectStages
  lotLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSettings: () => void
}) {
  const p = lot.project
  const sit = SITUATION[situationOf(lot)]
  const permit = p.permit ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[500px]">
        <DialogTitle className="sr-only">Project details: {lotLabel}</DialogTitle>

        {/* Cabeçalho: faixa de progresso e a identidade da obra. */}
        <div className="shrink-0 border-b">
          <div className="h-1 w-full bg-muted">
            <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${lot.percent}%` }} />
          </div>
          {/* A engrenagem das configurações, ao lado do botão de fechar. */}
          <Tip text="Project settings">
            <button
              onClick={onSettings}
              aria-label="Project settings"
              className="absolute top-3 right-10 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </button>
          </Tip>
          <div className="px-5 pt-4 pr-20 pb-4">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <p className="text-base leading-tight font-bold">{p.cliente || p.name}</p>
              <span className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${sit.className}`}>
                <sit.Icon className="h-2.5 w-2.5" />
                {sit.label}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{lot.percent}%</span>
            </div>
            <div className="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>{p.jobSite?.trim() || "No jobsite"}</span>
              <span className="text-border">|</span>
              <span className="font-semibold text-foreground">{lotLabel}</span>
            </div>
            {p.address && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{p.address}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <section>
            <SectionLabel icon={<Layers className="h-3.5 w-3.5 text-muted-foreground" />}>Stages</SectionLabel>
            <div className="flex flex-col gap-2">
              {lot.stages.map((s, i) => {
                const st = STAGE_ICON[s.state]
                return (
                  <div key={s.key} className="rounded-lg border bg-muted/40">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <s.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-xs">
                        <span className="font-semibold text-muted-foreground/70">S{i + 1} </span>
                        {s.full}
                      </span>
                      <span className={`flex items-center gap-1 text-[11px] ${st.className}`}>
                        <st.Icon className="h-3.5 w-3.5" />
                        {st.label}
                      </span>
                    </div>
                    {/* Compra, início e fim; planejado em cima, realizado embaixo. */}
                    <div className="grid grid-cols-3 divide-x divide-border border-t text-center text-[11px]">
                      <DateColumn term="Buy by" planned={s.purchaseBy} actual={s.purchasedOn} />
                      <DateColumn term="Start" planned={s.start} actual={s.actualStart} />
                      <DateColumn term="End" planned={s.end} actual={s.actualEnd} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section>
            <SectionLabel icon={<Workflow className="h-3.5 w-3.5 text-muted-foreground" />}>Integrations</SectionLabel>
            <CheckRow state={p.qbTime ? "done" : "pending"}>QuickBooks Time</CheckRow>
          </section>

          <section>
            <SectionLabel icon={<ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />}>Permit</SectionLabel>
            {permit.length === 0 ? (
              <p className="text-xs text-muted-foreground">No permit steps for this project.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {permit.map((step, i) => {
                  const v = String(step.status ?? "").toLowerCase()
                  return (
                    <CheckRow key={step.id ?? i} state={v === "dispensed" ? "dispensed" : v ? "done" : "pending"}>
                      {step.step}
                    </CheckRow>
                  )
                })}
              </div>
            )}
          </section>
        </div>

      </DialogContent>
    </Dialog>
  )
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5">
      {icon}
      <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{children}</p>
    </div>
  )
}

function DateColumn({ term, planned, actual }: { term: string; planned: Date | null; actual: Date | null }) {
  return (
    <div className="min-w-0">
      <p className="py-1 text-[10px] tracking-wide text-muted-foreground uppercase">{term}</p>
      <Tip text="Planned">
        <p className="border-t border-border py-1 font-semibold tabular-nums">{formatDate(planned)}</p>
      </Tip>
      <Tip text={actual ? "Actual" : "Not recorded yet"}>
        <p className={`border-t border-border py-1 tabular-nums ${actual ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50"}`}>
          {actual ? formatDate(actual) : "—"}
        </p>
      </Tip>
    </div>
  )
}

function CheckRow({ state, children }: { state: "done" | "pending" | "dispensed"; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2">
      <span className="flex-1 text-[13px] leading-snug">{children}</span>
      {state === "done" ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        : state === "dispensed" ? <Ban className="h-4 w-4 shrink-0 text-muted-foreground" />
        : <XCircle className="h-4 w-4 shrink-0 text-amber-400" />}
    </div>
  )
}
