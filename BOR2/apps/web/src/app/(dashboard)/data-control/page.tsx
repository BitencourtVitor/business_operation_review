"use client"

import { useForecast } from "@/hooks/use-forecast"
import type { ForecastStatus } from "@bor2/shared"
import { useMemo, useState } from "react"
import type { DCDivision, DCSection, SidebarTable, IntegFilters } from "./types"
import { usePermission } from "@/hooks/use-permission"
import { DEFAULT_INTEG } from "./types"
import { DataControlSidebar }   from "./components/data-control-sidebar"
import { NewProjectSection }     from "./components/new-project-section"
import { EditProjectSection }    from "./components/edit-project-section"
import { ClientsSection }        from "./components/clients-section"
import { FieldwireSection }      from "./components/fieldwire-section"
import { MachinesSection }       from "./components/machines-section"
import { CatalogSection }        from "./components/catalog-section"
import type { CatalogTable }     from "@/services/catalog.service"

export default function DataControlPage() {
  const { isDev } = usePermission()
  const [division, setDivision]       = useState<DCDivision>("framing")
  const [section, setSection]         = useState<DCSection>("edit-project")
  const [catalogTable, setCatalogTable] = useState<SidebarTable>("clients")
  const { data: projects } = useForecast()

  const [clientFilter, setClientFilter]   = useState("all")
  const [jobSiteFilter, setJobSiteFilter] = useState("all")
  const [statusFilter, setStatusFilter]   = useState<ForecastStatus | "all">("all")
  const [integ, setInteg]                 = useState<IntegFilters>(DEFAULT_INTEG)

  function handleInteg(k: keyof IntegFilters, v: IntegFilters[keyof IntegFilters]) {
    setInteg(prev => ({ ...prev, [k]: v }))
  }

  const clientOpts = useMemo(
    () => [
      "all",
      ...Array.from(
        new Set(projects?.map(p => p.cliente).filter(Boolean) as string[]),
      ).sort(),
    ],
    [projects],
  )

  const jobSiteOpts = useMemo(() => {
    const base = projects?.filter(p => clientFilter === "all" || p.cliente === clientFilter) ?? []
    return [
      "all",
      ...Array.from(
        new Set(base.map(p => p.jobSite).filter(Boolean) as string[]),
      ).sort(),
    ]
  }, [projects, clientFilter])

  function handleClientFilter(v: string) {
    setClientFilter(v)
    setJobSiteFilter("all")
  }

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] overflow-hidden">
      <DataControlSidebar
        active={section}
        onSelect={setSection}
        clientFilter={clientFilter}
        jobSiteFilter={jobSiteFilter}
        statusFilter={statusFilter}
        clientOpts={clientOpts}
        jobSiteOpts={jobSiteOpts}
        onClientFilter={handleClientFilter}
        onJobSiteFilter={setJobSiteFilter}
        onStatusFilter={setStatusFilter}
        catalogTable={catalogTable}
        onCatalogTable={setCatalogTable}
        division={division}
        onDivision={setDivision}
        hvacEnabled={isDev}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {division === "hvac" && (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/icon_forecast_hvac.png" alt="HVAC" className="mx-auto h-10 w-10 object-contain opacity-20 dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/icon_forecast_hvac_dark.png" alt="HVAC" className="mx-auto hidden h-10 w-10 object-contain opacity-20 dark:block" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">HVAC data controls under construction</p>
              <p className="mt-1 text-xs text-muted-foreground/50">HVAC projects use a different data structure.</p>
            </div>
          </div>
        )}

        {division === "framing" && section === "new-project" && (
          <div className="flex-1 overflow-y-auto p-6">
            <NewProjectSection onCreated={() => setSection("edit-project")} />
          </div>
        )}

        {division === "framing" && section === "edit-project" && (
          <div className="flex-1 overflow-y-auto p-6">
            <EditProjectSection
              clientFilter={clientFilter}
              jobSiteFilter={jobSiteFilter}
              statusFilter={statusFilter}
              onClientFilter={handleClientFilter}
              onJobSiteFilter={setJobSiteFilter}
              onStatusFilter={setStatusFilter}
              integ={integ}
              onInteg={handleInteg}
            />
          </div>
        )}

        {division === "framing" && section === "catalog" && (
          catalogTable === "clients"   ? <ClientsSection />   :
          catalogTable === "fieldwire" ? <FieldwireSection /> :
          catalogTable === "machines"  ? <MachinesSection />  :
          <CatalogSection activeTable={catalogTable as CatalogTable} />
        )}
      </div>
    </div>
  )
}
