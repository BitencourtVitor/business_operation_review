"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { useSidebar } from "@/components/ui/sidebar"
import { clearLastJobsite } from "@/components/atlas/last-jobsite"
import { useAtlasJobsites } from "@/hooks/use-atlas"
import type { AtlasJobsite } from "@/services/atlas.service"
import { Building, Check, Home, LandPlot, Loader2, MapPinned, Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

// A obra não é um item de menu: é o contexto de tudo que a sidebar mostra
// abaixo dela. Por isso ocupa um bloco próprio no topo, com cara de campo e não
// de botão, e abre um painel para o lado — a lista de obras não cabe, nem
// deveria caber, dentro da largura da barra.

const KIND_META: Record<string, { label: string; icon: React.ElementType }> = {
  building: { label: "Building", icon: Building },
  lot:      { label: "Lot",      icon: LandPlot },
  house:    { label: "House",    icon: Home },
  other:    { label: "Other",    icon: MapPinned },
}

/** Rótulo do que distingue uma obra dentro da comunidade. */
function unitLabel(kind: string) {
  return kind === "building" ? "Building no." : kind === "lot" ? "Lot" : "Unit"
}

type Filters = { client: string; community: string; kind: string; unit: string }
const EMPTY: Filters = { client: "", community: "", kind: "", unit: "" }

export function AtlasJobsitePicker({ currentId }: { currentId: string }) {
  const { data: jobsites = [], isLoading } = useAtlasJobsites()
  const { open: sidebarOpen, isMobile } = useSidebar()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [filters, setFilters] = useState<Filters>(EMPTY)

  const current = jobsites.find(j => j.id === currentId)

  // Cada seletor só oferece o que ainda sobrou depois dos outros. Filtro que
  // oferece opção sem resultado obriga a pessoa a descobrir por tentativa que
  // aquela combinação não existe.
  const options = useMemo(() => {
    const matches = (j: AtlasJobsite, except: keyof Filters) =>
      (except === "client"    || !filters.client    || j.client === filters.client) &&
      (except === "community" || !filters.community || j.community === filters.community) &&
      (except === "kind"      || !filters.kind      || j.kind === filters.kind) &&
      (except === "unit"      || !filters.unit      || j.unit === filters.unit)

    const uniq = (key: keyof Filters, get: (j: AtlasJobsite) => string) =>
      [...new Set(jobsites.filter(j => matches(j, key)).map(get).filter(Boolean))].sort()

    return {
      client:    uniq("client",    j => j.client),
      community: uniq("community", j => j.community),
      kind:      uniq("kind",      j => j.kind),
      unit:      uniq("unit",      j => j.unit),
    }
  }, [jobsites, filters])

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    return jobsites
      .filter(j => !filters.client    || j.client === filters.client)
      .filter(j => !filters.community || j.community === filters.community)
      .filter(j => !filters.kind      || j.kind === filters.kind)
      .filter(j => !filters.unit      || j.unit === filters.unit)
      .filter(j => !q
        || j.name.toLowerCase().includes(q)
        || j.address.toLowerCase().includes(q)
        || j.client.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [jobsites, filters, search])

  const activeFilters = Object.values(filters).filter(Boolean).length

  function choose(id: string) {
    setOpen(false)
    router.push(`/atlas/${id}`)
  }

  const CurrentIcon = current ? (KIND_META[current.kind]?.icon ?? MapPinned) : MapPinned

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Cartão de identificação à esquerda, ações à direita: em cima larga a
          obra, embaixo abre a busca. São gestos diferentes e por isso alvos
          diferentes — e botão dentro de botão seria HTML inválido de todo
          jeito. */}
      {/* Sem moldura própria: a moldura é do bloco da obra inteiro, montado
          na sidebar, onde esta identificação e os botões da obra convivem. */}
      <div className="flex items-stretch bg-sidebar-accent/40">
        {(sidebarOpen || isMobile) ? (
          <>
            <div className="min-w-0 flex-1 px-2.5 py-2 leading-tight">
              {current ? (
                // Do geral ao particular: cliente, lugar, e por fim a obra. A
                // identificação vem por último porque é onde a leitura chega —
                // e é ela que ganha o destaque, sendo como a obra é chamada no
                // dia a dia.
                <>
                  <span className="block truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                    {current.client || "No client"}
                  </span>
                  {/* Em tablet a barra é estreita e o nome inteiro da
                      comunidade comeria quatro linhas: fica só o trecho até a
                      primeira vírgula, que é o nome dela — o resto é cidade e
                      estado, e isso o cabeçalho da obra já diz. */}
                  <span className="block text-xs leading-snug text-muted-foreground">
                    <span className="md:max-lg:hidden">{current.community || current.name}</span>
                    <span className="hidden md:max-lg:inline">
                      {(current.community || current.name).split(",")[0]}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
                    <CurrentIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {[KIND_META[current.kind]?.label ?? current.kind, current.unit]
                      .filter(Boolean).join(" ")}
                  </span>
                </>
              ) : (
                <>
                  <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                    Jobsite
                  </span>
                  <span className="block truncate text-sm font-medium">Select a jobsite</span>
                </>
              )}
            </div>

            <div className="flex shrink-0 flex-col border-l border-sidebar-border">
              {current && (
                <button
                  type="button"
                  title="Clear selected jobsite"
                  onClick={() => { clearLastJobsite(); router.push("/atlas") }}
                  className="flex flex-1 items-center justify-center border-b border-sidebar-border px-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    title="Find a jobsite"
                    className="flex flex-1 items-center justify-center px-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                  />
                }
              >
                <Search className="h-3.5 w-3.5" />
              </PopoverTrigger>
            </div>
          </>
        ) : (
          <PopoverTrigger
            render={
              <button
                type="button"
                title="Find a jobsite"
                className="flex flex-1 items-center justify-center p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              />
            }
          >
            <CurrentIcon className="h-4 w-4 shrink-0" />
          </PopoverTrigger>
        )}
      </div>

      <PopoverContent
        side="right"
        align="start"
        sideOffset={20}
        // Em tablet o painel divide a tela com a barra lateral e o conteúdo;
        // 60% da largura de sempre deixa o que está atrás ainda legível.
        className="flex w-[26rem] max-w-[calc(100vw-2rem)] flex-col gap-3 p-3 md:max-lg:w-[15.6rem]"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, address or client…"
            className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <FilterSelect
            label="Client" value={filters.client} options={options.client}
            onChange={v => setFilters(f => ({ ...f, client: v }))}
          />
          <FilterSelect
            label="Community" value={filters.community} options={options.community}
            onChange={v => setFilters(f => ({ ...f, community: v }))}
          />
          <FilterSelect
            label="Build type" value={filters.kind} options={options.kind}
            format={v => KIND_META[v]?.label ?? v}
            onChange={v => setFilters(f => ({ ...f, kind: v }))}
          />
          <FilterSelect
            label={unitLabel(filters.kind)} value={filters.unit} options={options.unit}
            onChange={v => setFilters(f => ({ ...f, unit: v }))}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isLoading ? "Loading…" : `${results.length} of ${jobsites.length} jobsites`}
          </span>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => { setFilters(EMPTY); setSearch("") }}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
            </button>
          )}
        </div>

        <ScrollArea className="max-h-[22rem] min-h-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No jobsite matches this combination.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 pr-2">
              {results.map(j => {
                const meta = KIND_META[j.kind] ?? KIND_META.other
                const isCurrent = j.id === currentId
                return (
                  <li key={j.id}>
                    <button
                      type="button"
                      onClick={() => choose(j.id)}
                      className={`flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        isCurrent
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/60 hover:bg-muted/50"
                      }`}
                    >
                      <meta.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-sm font-medium">{j.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {j.address || j.client}
                        </span>
                      </span>
                      {isCurrent && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

function FilterSelect({ label, value, options, onChange, format }: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  format?: (value: string) => string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={v => onChange(v ?? "")}>
        <SelectTrigger className="w-full">
          <span className="flex-1 truncate text-left text-sm">
            {value ? (format ? format(value) : value) : "Any"}
          </span>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectItem value="">Any</SelectItem>
          {options.map(o => (
            <SelectItem key={o} value={o}>{format ? format(o) : o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
