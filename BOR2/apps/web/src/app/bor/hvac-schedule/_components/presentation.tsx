"use client"

import { useEffect, useMemo, useState } from "react"
import { useTheme } from "next-themes"
import {
  Activity, AlertTriangle, CalendarCheck, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid,
  Clock, Moon, Presentation as PresentationIcon, Sun, Users, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  alertOf, situationOf, startOfToday, type DateAlert, type ProjectStages, type Situation, type Stage,
} from "../_lib/stages"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

// O modo de apresentação do Schedule and Material.
//
// Primeiro a janela de preparo (jobsites, período e quais datas contam), depois
// a apresentação, que toma a janela inteira do navegador: uma página de
// abertura com o resumo e uma página por jobsite.
//
// O layout das páginas vai mudar conforme o pessoal pedir. Por isso cada página
// é um componente só seu (`Opening`, `JobsitePage`), e a ordem delas sai de uma
// lista montada em `Presentation`: trocar o desenho de uma não mexe na outra.

export interface PresentationSite {
  site: string
  responsibles: string[]
  lots: ProjectStages[]
}

/** "actual": só o que de fato aconteceu. "both": o planejado junto. */
type DateMode = "actual" | "both"

export interface PresentationConfig {
  sites: PresentationSite[]
  from: Date
  to: Date
  mode: DateMode
}

/** As datas de uma etapa que contam para pôr a obra no período. As reais contam
 *  sempre; as planejadas, só no modo que mostra as duas. */
function datesOf(s: Stage, mode: DateMode): (Date | null)[] {
  const actual = [s.purchasedOn, s.actualStart, s.actualEnd]
  return mode === "actual" ? actual : [...actual, s.purchaseBy, s.start, s.end]
}

/** A obra entra no período quando estava em andamento nele: o intervalo que
 *  vai da primeira à última data dela encosta no período, as pontas inclusas.
 *  Assim entra a que começa, a que termina e a que só atravessa o mês, inclusive
 *  parada entre duas etapas.
 *
 *  No modo só de executadas, a obra que começou e ainda não fechou as quatro
 *  etapas segue em andamento até hoje. */
export function inPeriod(lot: ProjectStages, from: Date, to: Date, mode: DateMode, today = new Date()): boolean {
  const dates = lot.stages.flatMap(s => datesOf(s, mode)).filter((d): d is Date => !!d).map(d => d.getTime())
  if (dates.length === 0) return false
  const first = Math.min(...dates)
  const open = mode === "actual" && lot.percent < 100
  const last = open ? Math.max(...dates, today.getTime()) : Math.max(...dates)
  return first <= to.getTime() && last >= from.getTime()
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

// ── Janela de preparo ───────────────────────────────────────────────────────

export function PresentationSetup({
  sites, open, onOpenChange, onStart,
}: {
  /** Todos os jobsites da HVAC, sem os filtros da página: quem filtra é esta janela. */
  sites: PresentationSite[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onStart: (config: PresentationConfig) => void
}) {
  // O período é um mês inteiro, e abre no corrente.
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [year, setYear] = useState(() => new Date().getFullYear())
  const from = new Date(year, month, 1)
  const to = new Date(year, month + 1, 0)
  // Os anos que têm alguma data de etapa, mais o corrente.
  const years = useMemo(() => {
    const set = new Set([new Date().getFullYear()])
    for (const s of sites) for (const l of s.lots) for (const st of l.stages) {
      for (const d of datesOf(st, "both")) if (d) set.add(d.getFullYear())
    }
    return [...set].sort()
  }, [sites])
  const [mode, setMode] = useState<DateMode>("both")
  const [picked, setPicked] = useState<Set<string>>(() => new Set(sites.map(s => s.site)))

  const rows = useMemo(
    () => {
      const a = new Date(year, month, 1), b = new Date(year, month + 1, 0)
      // As duas contagens sempre: quantas obras têm data no mês, e quantas
      // dessas já têm data executada. `lots` é o que o modo escolhido apresenta.
      return sites.map(s => {
        const planned = s.lots.filter(l => inPeriod(l, a, b, "both"))
        const executed = planned.filter(l => inPeriod(l, a, b, "actual"))
        return { ...s, planned: planned.length, executed: executed.length, lots: mode === "actual" ? executed : planned }
      })
    },
    [sites, year, month, mode],
  )
  // Só se escolhe jobsite que tem obra para apresentar; os outros ficam
  // desabilitados. Os totais do mês saem de todos, para o resumo poder dizer
  // "há 28 planejadas, nenhuma executada" mesmo sem nada selecionável.
  const available = rows.filter(r => r.lots.length > 0)
  const chosen = available.filter(r => picked.has(r.site))
  const planned = rows.reduce((n, r) => n + r.planned, 0)
  const executed = rows.reduce((n, r) => n + r.executed, 0)
  const withWork = rows.filter(r => r.planned > 0).length
  const shown = chosen.reduce((n, r) => n + r.lots.length, 0)
  const allPicked = available.length > 0 && chosen.length === available.length
  const toggleAll = () => setPicked(prev => {
    const next = new Set(prev)
    for (const r of available) { if (allPicked) next.delete(r.site); else next.add(r.site) }
    return next
  })

  const toggle = (site: string) => setPicked(prev => {
    const next = new Set(prev)
    if (!next.delete(site)) next.add(site)
    return next
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Presentation</DialogTitle>
          <DialogDescription>Choose the month and the jobsites you are going to talk about.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {/* Mês e tipo de data na mesma linha: são os dois recortes do período. */}
          <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Month</Label>
            {/* Um campo só, com o ícone de data na frente e duas partes: mês e ano. */}
            <div className="flex h-8 w-fit items-center overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring dark:bg-input/30">
              <CalendarDays className="ml-2.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Select value={String(month)} onValueChange={v => v && setMonth(Number(v))}>
                <SelectTrigger aria-label="Month" className="h-full rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-input/50 w-[124px] shrink-0">
                  <span className="text-sm">{MONTHS[month]}</span>
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="h-4 w-px shrink-0 bg-border" />
              <Select value={String(year)} onValueChange={v => v && setYear(Number(v))}>
                <SelectTrigger aria-label="Year" className="h-full rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-input/50 w-[80px] shrink-0">
                  <span className="text-sm tabular-nums">{year}</span>
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label>Dates</Label>
            {/* O mesmo seletor segmentado do Forecast. */}
            <div className="flex h-8 items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30">
              {([
                { value: "both", label: "Planned and executed", Icon: CalendarDays },
                { value: "actual", label: "Executed only", Icon: CalendarCheck },
              ] as const).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors ${mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center">
              <Label>Jobsites</Label>
              <button
                onClick={toggleAll}
                disabled={available.length === 0}
                className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                {allPicked ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-lg border p-1.5">
              {rows.map(r => (
                <label
                  key={r.site}
                  className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${r.lots.length === 0 ? "cursor-not-allowed text-muted-foreground/60" : "cursor-pointer font-medium hover:bg-muted/60"}`}
                >
                  <Checkbox
                    checked={r.lots.length > 0 && picked.has(r.site)}
                    disabled={r.lots.length === 0}
                    onCheckedChange={() => toggle(r.site)}
                  />
                  <span className="min-w-0 flex-1 truncate">{r.site}</span>
                  {/* Quantas obras do jobsite entram na apresentação. Com obra, a
                      contagem vira etiqueta colorida; sem, fica apagada. */}
                  {r.lots.length === 0 ? (
                    <span className="shrink-0 text-xs font-normal text-muted-foreground/60">
                      {mode === "actual" && r.planned > 0 ? `None executed of ${r.planned}` : "No lots"}
                    </span>
                  ) : (
                    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums ${mode === "actual" ? TONE.emerald : TONE.blue}`}>
                      {mode === "actual"
                        ? `${r.executed} of ${r.planned} executed`
                        : `${r.planned} ${r.planned === 1 ? "lot" : "lots"}`}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* O resumo fica no rodapé, ao lado dos botões: é a última coisa lida
            antes de clicar em Start. */}
        <DialogFooter className="items-center">
          <Summary
            month={MONTHS[month]} mode={mode}
            jobsites={chosen.length} shown={shown} withWork={withWork} planned={planned} executed={executed}
          />
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={chosen.length === 0} onClick={() => onStart({ sites: chosen, from, to, mode })}>
            <PresentationIcon className="h-4 w-4" />
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const TONE = {
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// O que a seleção rende, em frase e com cor: azul quando há obra para mostrar,
// verde quando há obra executada, âmbar quando não há nada. É o aviso de que a
// apresentação sairia vazia, antes de alguém clicar em Start.
function Summary({
  month, mode, jobsites, shown, withWork, planned, executed,
}: {
  month: string
  mode: DateMode
  /** Jobsites escolhidos e quantas obras deles entram na apresentação. */
  jobsites: number
  shown: number
  withWork: number
  planned: number
  executed: number
}) {
  const nothing = planned === 0 || (mode === "actual" && executed === 0)
  const empty = nothing || jobsites === 0
  const tone = empty ? TONE.amber : mode === "actual" ? TONE.emerald : TONE.blue
  const Icon = AlertTriangle
  const count = shown
  const inSites = plural(jobsites, "jobsite", "jobsites")

  const [title, detail] =
    planned === 0 ? [`Nothing in ${month}`, "No jobsite has a planned or executed date in this month."]
    : nothing ? [`No executed date in ${month} yet`, `${plural(planned, "lot is", "lots are")} planned in ${plural(withWork, "jobsite", "jobsites")}, but none has an executed date.`]
    : jobsites === 0 ? ["No jobsite selected", "Select at least one jobsite above."]
    : mode === "actual" ? [`${plural(shown, "lot", "lots")} active in ${month} by executed dates`, `In ${inSites}, out of ${plural(planned, "lot", "lots")} active in the month by planned dates.`]
    : [`${plural(shown, "lot", "lots")} active in ${month}`, `In ${inSites}. ${executed === 0 ? "None has an executed date yet." : `${plural(executed, "of them is", "of them are")} active by executed dates.`}`]

  return (
    <div className={`mr-auto flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left ${tone}`}>
      {empty
        ? <Icon className="h-5 w-5 shrink-0" />
        : <span className="shrink-0 text-2xl leading-none font-bold tabular-nums">{count}</span>}
      <div className="min-w-0">
        <p className="text-sm font-semibold">{empty ? title : title.replace(/^\d+ /, "")}</p>
        <p className="text-xs leading-snug text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

// ── Apresentação ────────────────────────────────────────────────────────────

const SITUATION: Record<Situation, { label: string; Icon: React.ElementType; text: string; bar: string }> = {
  delayed: { label: "Delayed", Icon: AlertTriangle, text: "text-red-600 dark:text-red-400", bar: "bg-red-500" },
  running: { label: "In progress", Icon: Activity, text: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500" },
  upcoming: { label: "Upcoming", Icon: Clock, text: "text-slate-600 dark:text-slate-300", bar: "bg-slate-400 dark:bg-slate-500" },
  done: { label: "Completed", Icon: CheckCircle2, text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
}
// A ordem em que as situações aparecem: primeiro o que pede atenção.
const SITUATIONS: Situation[] = ["delayed", "running", "upcoming", "done"]

function countBy(lots: ProjectStages[]): Record<Situation, number> {
  const out = { done: 0, running: 0, upcoming: 0, delayed: 0 }
  for (const l of lots) out[situationOf(l)]++
  return out
}

export function Presentation({ config, onClose }: { config: PresentationConfig; onClose: () => void }) {
  const { resolvedTheme, setTheme } = useTheme()
  // A página e de que lado ela entra: avançando vem da direita, voltando da esquerda.
  const [{ page, forward }, setNav] = useState({ page: 0, forward: true })
  const go = (to: number | ((p: number) => number)) => setNav(prev => {
    const next = Math.max(0, Math.min(typeof to === "function" ? to(prev.page) : to, pageCount - 1))
    return next === prev.page ? prev : { page: next, forward: next > prev.page }
  })
  // Fechar espera a animação de saída terminar antes de desmontar.
  const [closing, setClosing] = useState(false)
  const close = () => { setClosing(true); setTimeout(onClose, 180) }
  const pageCount = config.sites.length + 1
  const month = `${MONTHS[config.from.getMonth()]} ${config.from.getFullYear()}`

  // A lista de páginas, na ordem em que aparecem. Página nova entra aqui.
  const pages = [
    { key: "opening", node: <Opening config={config} month={month} onOpen={i => go(i + 1)} /> },
    ...config.sites.map(s => ({ key: s.site, node: <JobsitePage site={s} mode={config.mode} /> })),
  ]
  const last = pages.length - 1

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setClosing(true); setTimeout(onClose, 180) }
      if (e.key === "ArrowRight" || e.key === "PageDown") setNav(n => n.page < last ? { page: n.page + 1, forward: true } : n)
      if (e.key === "ArrowLeft" || e.key === "PageUp") setNav(n => n.page > 0 ? { page: n.page - 1, forward: false } : n)
      if (e.key === "Home") setNav(n => n.page > 0 ? { page: 0, forward: false } : n)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [last, onClose])

  return (
    // Por cima de tudo, do tamanho da janela do navegador (não é tela cheia do
    // sistema): cobre a barra lateral e o cabeçalho do BOR.
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-background text-foreground duration-200 ${closing ? "animate-out fade-out-0 zoom-out-95 fill-mode-forwards" : "animate-in fade-in-0 zoom-in-95"}`}>
      {/* O fio no topo diz em que ponto da apresentação se está. */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-muted">
        <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${((page + 1) / pages.length) * 100}%` }} />
      </div>

      {/* O palco usa 88% da largura da janela, e a altura acompanha na
          proporção de um slide (16:9), sem passar do que a janela tem. A página não rola: quem rola é a
          lista de dentro dela. */}
      <div className="flex w-[88vw] flex-col">
        {/* A logo da empresa fica em toda página: mora na moldura, não na página. */}
        <header className="flex shrink-0 items-center gap-4 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo_black.png" alt="Premium Group" className="h-7 object-contain dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo_white.png" alt="Premium Group" className="hidden h-7 object-contain dark:block" />
          <span className="h-5 w-px bg-border" />
          <p className="text-[11px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
            HVAC Schedule &amp; Material <span className="mx-1.5 text-border">/</span> {month}
          </p>
          <div className="ml-auto flex items-center gap-0.5 text-muted-foreground">
            <Button
              variant="ghost" size="icon" aria-label="Switch theme"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" aria-label="Close presentation" onClick={close}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main
          className="aspect-video max-h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-border/60 bg-card/40 p-8"
        >
          {/* A chave troca a cada página, e a página nova entra deslizando do
              lado para onde se andou. */}
          <div
            key={pages[page].key}
            className={`h-full animate-in fade-in-0 duration-300 ${forward ? "slide-in-from-right-8" : "slide-in-from-left-8"}`}
          >
            {pages[page].node}
          </div>
        </main>

        <footer className="flex shrink-0 items-center pt-4">
          {/* Um ponto por página; o da vez é mais largo. Clicar leva até ela. */}
          <div className="flex items-center gap-1.5">
            {pages.map((p, i) => (
              <button
                key={p.key}
                onClick={() => go(i)}
                aria-label={`Go to page ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === page ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"}`}
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1 text-muted-foreground">
            {/* Da abertura se pula direto para um jobsite; este é o caminho de volta. */}
            <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => go(0)}>
              <LayoutGrid className="h-4 w-4" />
              Overview
            </Button>
            <span className="mx-2 text-xs tabular-nums">{page + 1} / {pages.length}</span>
            <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page === 0} onClick={() => go(p => p - 1)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Next page" disabled={page === last} onClick={() => go(p => p + 1)}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}

/** A proporção das situações numa barra só: quanto do todo está em cada uma. */
function SituationBar({ counts, className }: { counts: Record<Situation, number>; className?: string }) {
  const total = SITUATIONS.reduce((n, k) => n + counts[k], 0)
  return (
    <div className={`flex gap-0.5 overflow-hidden rounded-full ${className ?? "h-2"}`}>
      {total === 0 && <div className="flex-1 bg-muted" />}
      {SITUATIONS.filter(k => counts[k] > 0).map(k => (
        <div key={k} className={SITUATION[k].bar} style={{ flex: counts[k] }} />
      ))}
    </div>
  )
}

// Página de abertura: o mês em grande, as quatro grandezas e cada jobsite com a
// sua proporção. Clicar num jobsite vai para a página dele.
function Opening({ config, month, onOpen }: { config: PresentationConfig; month: string; onOpen: (index: number) => void }) {
  const lots = config.sites.flatMap(s => s.lots)
  const totals = countBy(lots)

  return (
    <div className="flex h-full flex-col gap-7">
      <div>
        <h1 className="text-5xl font-semibold tracking-tight">{month}</h1>
        <p className="mt-2 text-base text-muted-foreground">
          {lots.length} {lots.length === 1 ? "lot" : "lots"} active in {config.sites.length} {config.sites.length === 1 ? "jobsite" : "jobsites"}
          <span className="mx-2 text-border">/</span>
          {config.mode === "actual" ? "Executed dates only" : "Planned and executed dates"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {SITUATIONS.map(k => {
          const s = SITUATION[k]
          return (
            <div key={k} className="rounded-2xl bg-muted/40 p-6">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <s.Icon className={`h-4 w-4 ${s.text}`} />
                {s.label}
              </p>
              <p className={`mt-3 text-6xl leading-none font-semibold tabular-nums ${s.text}`}>{totals[k]}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                {lots.length ? Math.round((totals[k] / lots.length) * 100) : 0}% of the lots
              </p>
            </div>
          )
        })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <SituationBar counts={totals} className="h-2.5 shrink-0" />
        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto pr-2">
          {config.sites.map((s, i) => {
            const c = countBy(s.lots)
            return (
              <button
                key={s.site}
                onClick={() => onOpen(i)}
                className="group grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-6 border-b border-border/60 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/30"
              >
                <span className="min-w-0 pl-1">
                  <span className="block truncate text-lg font-medium">{s.site}</span>
                  <ResponsibleLine names={s.responsibles} />
                </span>
                <span className="flex min-w-0 flex-col gap-2">
                  <SituationBar counts={c} />
                  <span className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                    {SITUATIONS.filter(k => c[k] > 0).map(k => (
                      <span key={k}>
                        <span className={`font-semibold tabular-nums ${SITUATION[k].text}`}>{c[k]}</span> {SITUATION[k].label.toLowerCase()}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="flex items-center gap-2 pr-1">
                  <span className="text-right">
                    <span className="block text-2xl leading-none font-semibold tabular-nums">{s.lots.length}</span>
                    <span className="text-xs text-muted-foreground">{s.lots.length === 1 ? "lot" : "lots"}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Uma página por jobsite: quem apresenta vê todas as obras dele, agrupadas por
// situação, e comenta antes de passar para o próximo.
function JobsitePage({ site, mode }: { site: PresentationSite; mode: DateMode }) {
  const c = countBy(site.lots)
  // Uma obra aberta por vez, na página inteira: abrir outra fecha a anterior.
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex shrink-0 flex-wrap items-end gap-x-10 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold tracking-tight">{site.site}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{site.lots.length} {site.lots.length === 1 ? "lot" : "lots"} active in the month</span>
            <ResponsibleLine names={site.responsibles} />
          </div>
        </div>
        <div className="ml-auto flex items-end gap-8">
          {SITUATIONS.map(k => (
            <div key={k} className={c[k] === 0 ? "opacity-40" : ""}>
              <p className={`text-4xl leading-none font-semibold tabular-nums ${SITUATION[k].text}`}>{c[k]}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">{SITUATION[k].label}</p>
            </div>
          ))}
        </div>
      </div>

      <SituationBar counts={c} className="h-2 shrink-0" />

      {/* Três colunas: o que atrasou, o que está em andamento e o que vai
          começar. Um bloco por obra, um em cima do outro. Cada coluna
          rola por conta própria; o resto da página fica parado. */}
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-5">
        {COLUMNS.map(k => {
          const s = SITUATION[k]
          const lots = site.lots.filter(l => situationOf(l) === k)
          return (
            <section key={k} className="flex min-h-0 min-w-0 flex-col">
              <h2 className="mb-3 flex shrink-0 items-center gap-2 border-b border-border/60 pb-2 text-sm font-semibold">
                <s.Icon className={`h-4 w-4 ${s.text}`} />
                {s.label}
                <span className="ml-auto font-normal text-muted-foreground tabular-nums">{lots.length}</span>
              </h2>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1.5">
                {lots.length === 0 && <p className="py-3 text-xs text-muted-foreground/60">None</p>}
                {lots.map(lot => (
                  <LotCard
                    key={lot.project.id} lot={lot} mode={mode}
                    open={openId === lot.project.id}
                    onToggle={() => setOpenId(id => id === lot.project.id ? null : lot.project.id)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

// As colunas da página do jobsite. Concluída não tem coluna: aparece só na
// contagem do topo.
const COLUMNS: Situation[] = ["delayed", "running", "upcoming"]

// O bloco da obra abre fechado, só com o que a identifica. As datas das etapas
// aparecem ao clicar.
function LotCard({
  lot, mode, open, onToggle,
}: {
  lot: ProjectStages
  mode: DateMode
  open: boolean
  onToggle: () => void
}) {
  const p = lot.project
  const raw = p.loteBld?.trim() || p.name?.trim() || ""
  const label = /^\d/.test(raw) ? `Lot ${raw}` : raw

  return (
    <div className="shrink-0 rounded-xl border border-border/70 bg-card">
      {/* Preso no topo da coluna: rolando as etapas, o número do lote continua
          à vista. O cartão não corta o conteúdo, senão o cabeçalho não gruda. */}
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={`sticky top-0 z-10 flex w-full items-center gap-3 bg-card px-3.5 py-2.5 text-left transition-colors hover:bg-muted ${open ? "rounded-t-xl" : "rounded-xl"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{label}</span>
          <span className="block truncate text-xs text-muted-foreground">{p.address}</span>
        </span>
        {/* Um ponto por etapa, na cor do estado: o resumo da obra sem abrir. */}
        <span className="flex shrink-0 items-center gap-1">
          {lot.stages.map(s => <span key={s.key} className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[s.state]}`} />)}
        </span>
        <span className="w-8 shrink-0 text-right text-xs font-medium text-muted-foreground tabular-nums">{lot.percent}%</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {/* Sempre montado: a altura anima de zero ao tamanho do conteúdo pela
          linha da grade, que CSS sabe transicionar (altura automática, não). */}
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2 border-t border-border/60 p-2.5">
            {lot.stages.map(s => <StageBlock key={s.key} stage={s} mode={mode} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

const STAGE_DOT: Record<Stage["state"], string> = {
  done: "bg-emerald-500",
  running: "bg-blue-500",
  delayed: "bg-red-500",
  upcoming: "bg-muted-foreground/40",
  undated: "bg-muted-foreground/20",
}
const STAGE_LABEL: Record<Stage["state"], string> = {
  done: "Completed", running: "In progress", delayed: "Delayed", upcoming: "Not started", undated: "No date",
}

// Uma etapa: as três datas em colunas (compra, início, fim) e duas linhas, a
// planejada e a executada. O que deu problema fica vermelho na própria célula:
// a data atrasada em vermelho, e um alerta no lugar da que falta e já venceu.
function StageBlock({ stage: s, mode }: { stage: Stage; mode: DateMode }) {
  const today = startOfToday()
  // Etapa já começada não cobra mais a compra: o material chegou.
  const buy = s.purchasedOn || !s.actualStart ? alertOf(s.purchaseBy, s.purchasedOn, today, "Purchase") : undefined
  const start = alertOf(s.start, s.actualStart, today, "Start")
  const end = alertOf(s.end, s.actualEnd, today, "End")
  // A linha horizontal só existe quando há as duas linhas de data.
  const divide = mode === "both" ? "border-t border-border" : ""

  return (
    <div className="min-w-0 rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <s.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{s.full}</span>
        <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[s.state]}`} aria-label={STAGE_LABEL[s.state]} />
      </div>

      {/* Uma grade com linhas: a horizontal separa o planejado do executado, e
          as verticais separam compra, início e fim. */}
      <div className="mt-2 grid grid-cols-[auto_1fr_1fr_1fr] text-sm tabular-nums">
        <span />
        {["Buy", "Start", "End"].map((h, i) => (
          <span key={h} className={`pb-1 text-center text-[11px] tracking-wide text-muted-foreground uppercase ${i ? V : ""}`}>{h}</span>
        ))}

        {mode === "both" && (
          <>
            <span className="py-1 pr-3 text-xs text-muted-foreground">Planned</span>
            <DateValue date={s.purchaseBy} />
            <DateValue date={s.start} className={V} />
            <DateValue date={s.end} className={V} />
          </>
        )}

        <span className={`py-1 pr-3 text-xs text-muted-foreground ${divide}`}>Executed</span>
        <DateValue date={s.purchasedOn} executed alert={buy} className={divide} />
        <DateValue date={s.actualStart} executed alert={start} className={`${V} ${divide}`} />
        <DateValue date={s.actualEnd} executed alert={end} className={`${V} ${divide}`} />
      </div>
    </div>
  )
}

/** A linha vertical entre duas colunas de data. */
const V = "border-l border-border"

/** Uma data da grade, centralizada na coluna. A executada sai verde quando está
 *  em dia e vermelha quando atrasou; faltando e já vencida, vira um alerta. */
function DateValue({
  date, executed, alert, className,
}: {
  date: Date | null
  executed?: boolean
  alert?: DateAlert
  className?: string
}) {
  const tone = alert
    ? "font-semibold text-red-600 dark:text-red-400"
    : !date ? "text-muted-foreground/40"
    : executed ? "font-semibold text-emerald-600 dark:text-emerald-400"
    : ""
  return (
    <span className={`flex items-center justify-center py-1 ${tone} ${className ?? ""}`} title={alert?.text}>
      {date ? short(date) : alert ? <AlertTriangle className="h-4 w-4" aria-label={alert.text} /> : "-"}
    </span>
  )
}

/** Ano com dois dígitos: a coluna da obra é estreita. */
function short(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })
}

function ResponsibleLine({ names }: { names: string[] }) {
  if (names.length === 0) return null
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Users className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{names.join(", ")}</span>
    </span>
  )
}
