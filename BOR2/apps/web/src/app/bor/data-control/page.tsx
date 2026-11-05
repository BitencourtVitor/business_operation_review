"use client"

import { useForecast } from "@/hooks/use-forecast"
import type { ForecastStatus } from "@bor2/shared"
import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { DCSection, SidebarTable, IntegFilters } from "./types"
import { DC_GROUPS, DEFAULT_INTEG } from "./types"
import { PanelLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataControlSidebar }   from "./components/data-control-sidebar"
import { NewProjectSection }     from "./components/new-project-section"
import { EditProjectSection }    from "./components/edit-project-section"
import { ClientsSection }        from "./components/clients-section"
import { FieldwireSection }      from "./components/fieldwire-section"
import { MachinesSection }       from "./components/machines-section"
import { CatalogSection }        from "./components/catalog-section"
import type { CatalogTable }     from "@/services/catalog.service"

export default function DataControlPage() {
  return (
    <Suspense>
      <DataControlContent />
    </Suspense>
  )
}

function DataControlContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // A HVAC saiu daqui (HS-21): link antigo com ?division=hvac vai para a página dela.
  const isHvacLink = searchParams.get("division") === "hvac"
  useEffect(() => { if (isHvacLink) router.replace("/bor/hvac-schedule") }, [isHvacLink, router])
  const [section, setSection]         = useState<DCSection>("edit-project")
  const [catalogTable, setCatalogTable] = useState<SidebarTable>("clients")
  const { data: projects } = useForecast({ company: "framing" })

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

  // No celular a barra lateral da página vira gaveta: escolher uma seção fecha.
  const [menuOpen, setMenuOpen] = useState(false)
  const sectionLabel = DC_GROUPS.flatMap(g => g.items).find(i => i.key === section)?.label

  return (
    <div className="-m-6 flex h-[calc(100%+3rem)] overflow-hidden">
      {menuOpen && <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-black/50 lg:hidden" />}
      <div className={`flex max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:transition-transform max-lg:duration-500 ${menuOpen ? "" : "max-lg:-translate-x-full"}`}>
      <DataControlSidebar
        active={section}
        onSelect={s => { setSection(s); setMenuOpen(false) }}
        clientFilter={clientFilter}
        jobSiteFilter={jobSiteFilter}
        statusFilter={statusFilter}
        clientOpts={clientOpts}
        jobSiteOpts={jobSiteOpts}
        onClientFilter={handleClientFilter}
        onJobSiteFilter={setJobSiteFilter}
        onStatusFilter={setStatusFilter}
        catalogTable={catalogTable}
        onCatalogTable={t => { setCatalogTable(t); setMenuOpen(false) }}
      />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 lg:hidden">
          <Button variant="outline" size="sm" onClick={() => setMenuOpen(true)}><PanelLeft className="h-3.5 w-3.5" />Menu</Button>
          <span className="truncate text-sm font-medium">{sectionLabel}</span>
        </div>
        {section === "new-project" && (
          <div className="flex-1 overflow-y-auto p-6 max-md:p-4">
            <NewProjectSection onCreated={() => setSection("edit-project")} />
          </div>
        )}

        {section === "edit-project" && (
          <div className="flex-1 overflow-y-auto p-6 max-md:p-4">
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
