"use client"

import { useForecast } from "@/hooks/use-forecast"
import type { ForecastStatus } from "@bor2/shared"
import { useMemo, useState } from "react"
import type { DCSection, SidebarTable, IntegFilters } from "./types"
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
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {section === "new-project" && (
          <div className="flex-1 overflow-y-auto p-6">
            <NewProjectSection onCreated={() => setSection("edit-project")} />
          </div>
        )}

        {section === "edit-project" && (
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

        {section === "catalog" && (
          catalogTable === "clients"   ? <ClientsSection />   :
          catalogTable === "fieldwire" ? <FieldwireSection /> :
          catalogTable === "machines"  ? <MachinesSection />  :
          <CatalogSection activeTable={catalogTable as CatalogTable} />
        )}
      </div>
    </div>
  )
}
