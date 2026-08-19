"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ForecastStatus } from "@bor2/shared"
import { Building2, CircleDot, MapPin, X } from "lucide-react"
import { CATALOG_TABS, DC_DIVISIONS, DC_GROUPS, STATUS_OPTS } from "../types"
import type { DCDivision, DCSection, SidebarTable } from "../types"

interface DataControlSidebarProps {
  active:          DCSection
  onSelect:        (s: DCSection) => void
  clientFilter:    string
  jobSiteFilter:   string
  statusFilter:    ForecastStatus | "all"
  clientOpts:      string[]
  jobSiteOpts:     string[]
  onClientFilter:  (v: string) => void
  onJobSiteFilter: (v: string) => void
  onStatusFilter:  (v: ForecastStatus | "all") => void
  catalogTable:    SidebarTable
  onCatalogTable:  (t: SidebarTable) => void
  division:        DCDivision
  onDivision:      (d: DCDivision) => void
  hvacEnabled:     boolean
}

export function DataControlSidebar({
  active,
  onSelect,
  clientFilter,
  jobSiteFilter,
  statusFilter,
  clientOpts,
  jobSiteOpts,
  onClientFilter,
  onJobSiteFilter,
  onStatusFilter,
  catalogTable,
  onCatalogTable,
  division,
  onDivision,
  hvacEnabled,
}: DataControlSidebarProps) {
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sidebar-foreground/40">
          Forecast Data Controls
        </p>
      </div>

      {/* Division selector — Framing and HVAC hold different data structures */}
      <div className="border-b border-sidebar-border p-2">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-foreground/5 p-1">
          {DC_DIVISIONS.map(d => {
            const disabled = d.key === "hvac" && !hvacEnabled
            return (
              <button
                key={d.key}
                disabled={disabled}
                onClick={() => onDivision(d.key)}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  division === d.key
                    ? "bg-foreground/10 text-foreground shadow-sm"
                    : disabled
                      ? "cursor-not-allowed text-muted-foreground opacity-40"
                      : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.image} alt={d.label} className="h-3.5 w-3.5 shrink-0 object-contain" />
                {d.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-2">
        {division === "framing" && DC_GROUPS.map(g => (
          <div key={g.label} className="mb-1">
            <p className="mb-0.5 px-4 pt-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
              {g.label}
            </p>
            <div className="flex flex-col gap-1 px-2">
              {g.items.map(item => {
                const Icon = item.icon
                const isActive = active === item.key
                return (
                  <button
                    key={item.key}
                    onClick={() => onSelect(item.key)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Edit Filters — only visible in edit-project mode */}
        {division === "framing" && active === "edit-project" && (
          <>
            <div className="my-3 border-t border-sidebar-border" />
            <div className="px-3 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-1">
                Edit Filters
              </p>

              {/* Client filter */}
              <div className="space-y-1">
                <p className="px-1 text-xs font-medium text-sidebar-foreground/70">Client</p>
                <Select
                  value={clientFilter === "all" ? "" : clientFilter}
                  onValueChange={v => onClientFilter(v || "all")}
                >
                  <SelectTrigger size="sm" className="w-full bg-sidebar-accent/30 border-sidebar-border text-xs">
                    <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientOpts.filter(c => c !== "all").map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Job site filter */}
              <div className="space-y-1">
                <p className="px-1 text-xs font-medium text-sidebar-foreground/70">Job Site</p>
                <Select
                  value={jobSiteFilter === "all" ? "" : jobSiteFilter}
                  onValueChange={v => onJobSiteFilter(v || "all")}
                >
                  <SelectTrigger size="sm" className="w-full bg-sidebar-accent/30 border-sidebar-border text-xs">
                    <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobSiteOpts.filter(j => j !== "all").map(j => (
                      <SelectItem key={j} value={j}>{j}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status filter */}
              <div className="space-y-1">
                <p className="px-1 text-xs font-medium text-sidebar-foreground/70">Status</p>
                <Select
                  value={statusFilter === "all" ? "" : (STATUS_OPTS.find(o => o.value === statusFilter)?.label ?? "")}
                  onValueChange={v => {
                    const opt = STATUS_OPTS.find(o => o.label === v)
                    onStatusFilter(opt ? opt.value : "all")
                  }}
                >
                  <SelectTrigger size="sm" className="w-full bg-sidebar-accent/30 border-sidebar-border text-xs">
                    <CircleDot className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTS.map(o => (
                      <SelectItem key={o.value} value={o.label}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(clientFilter !== "all" || jobSiteFilter !== "all" || statusFilter !== "all") && (
                <button
                  className="flex w-full items-center justify-center gap-1.5 text-[11px] text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                  onClick={() => { onClientFilter("all"); onJobSiteFilter("all"); onStatusFilter("all") }}
                >
                  <X className="h-3 w-3" />
                  Clear filters
                </button>
              )}
            </div>
          </>
        )}

        {/* Catalog table selector — only visible in catalog mode */}
        {division === "framing" && active === "catalog" && (
          <>
            {/* Info block */}
            <div className="border-t border-b border-sidebar-border mt-3 px-4 py-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">About</p>
              <p className="text-[11px] leading-relaxed text-sidebar-foreground/55">
                This is where you define the base parameters for the Forecast. Everything here shows up automatically when a new project is created, including contract steps, available teams, Fieldwire documents, machines, clients and job sites. Any change made here applies to all future projects.
              </p>
            </div>

            <div className="px-3 pt-3 space-y-1">
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                Tables
              </p>
              {CATALOG_TABS.map(t => {
                const Icon = t.icon
                return (
                  <button
                    key={t.key}
                    onClick={() => onCatalogTable(t.key)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
                      catalogTable === t.key
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                    }`}
                  >
                    {t.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.image} alt={t.label} className="h-3.5 w-3.5 shrink-0 object-contain" />
                    ) : Icon ? (
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                    ) : null}
                    {t.label}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
