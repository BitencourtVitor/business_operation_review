"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { atlasService } from "@/services/atlas.service"
import { takeoffService, type TakeoffDictionary, type TakeoffTerm } from "@/services/atlas-takeoff.service"
import { BookOpen, ChevronDown, ChevronRight, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { tagOutline, readVectors } from "./vector-read"

/**
 * O dicionário do set no Takeoff (ATL-103): o que a legenda, as tabelas e a base
 * dizem de cada símbolo e código. É o que as duas leituras consultam.
 *
 * A forma de cada símbolo da legenda não está no texto da folha: a extração
 * guarda onde fica o exemplo, e este painel mede a forma em volta dele pelo
 * vetor assim que o dicionário chega.
 */
export function DictionaryPanel({ documentId, versionId, data, onChanged }: {
  documentId: string
  versionId: string
  data: TakeoffDictionary | undefined
  onChanged: () => void
}) {
  const [open, setOpen] = useState<"legend" | "tags" | "abbreviations" | null>("legend")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const terms = useMemo(() => data?.terms ?? [], [data])
  const extraction = data?.extraction

  const by = (level: string, kind?: string) => terms.filter(t => t.level === level && (!kind || t.kind === kind))
  const legend = terms.filter(t => t.kind === "symbol" && t.level !== "base")
  const tags = terms.filter(t => t.kind === "tag")
  const abbreviations = terms.filter(t => t.kind === "abbreviation" && t.level !== "base")

  useMeasureLegend(legend, onChanged)

  async function extract() {
    setBusy(true)
    setError("")
    try {
      await takeoffService.extract(documentId, versionId)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the set.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(term: TakeoffTerm) {
    await takeoffService.deleteTerm(term.id)
    onChanged()
  }

  const running = extraction?.state === "running"

  return (
    <section className="flex shrink-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Dictionary</Label>
        <Button size="sm" variant="outline" className="ml-auto h-7" disabled={busy || running || !versionId} onClick={extract}>
          {busy || running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {running ? "Reading set…" : "Read set"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <Badge variant="outline">Project {by("project").length}</Badge>
        <Badge variant="outline">Set {by("set").length}</Badge>
        <Badge variant="outline">Base {by("base").length}</Badge>
      </div>

      {extraction?.state === "failed" && (
        <p className="text-xs text-destructive">Reading the set failed: {extraction.error}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!running && !by("project").length && !by("set").length && (
        <p className="text-xs text-muted-foreground">
          Nothing read from this set yet. Read set pulls the symbol legend, abbreviations and the window and door schedules.
        </p>
      )}

      <Group title={`Symbol legend (${legend.length})`} open={open === "legend"} onToggle={() => setOpen(o => o === "legend" ? null : "legend")}>
        {legend.map(t => (
          <Row key={t.id} term={t} onDelete={remove}>
            <span className="truncate">{t.meaning}</span>
            {typeof t.attrs.sample === "string" && (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{t.attrs.sample}</span>
            )}
            <Badge variant={t.attrs.shape ? "secondary" : "outline"} className="ml-auto shrink-0 text-[10px]">
              {typeof t.attrs.shape === "string" ? t.attrs.shape : "no shape"}
            </Badge>
          </Row>
        ))}
      </Group>

      <Group title={`Tags (${tags.length})`} open={open === "tags"} onToggle={() => setOpen(o => o === "tags" ? null : "tags")}>
        {tags.map(t => (
          <Row key={t.id} term={t} onDelete={remove}>
            <span className="w-10 shrink-0 font-mono text-xs font-semibold">{t.code}</span>
            <span className="truncate text-muted-foreground">{t.meaning}</span>
          </Row>
        ))}
        <AddTerm documentId={documentId} onAdded={onChanged} />
      </Group>

      <Group
        title={`Set abbreviations (${abbreviations.length})`}
        open={open === "abbreviations"}
        onToggle={() => setOpen(o => o === "abbreviations" ? null : "abbreviations")}
      >
        {abbreviations.map(t => (
          <Row key={t.id} term={t} onDelete={remove}>
            <span className="w-14 shrink-0 font-mono text-xs font-semibold">{t.code}</span>
            <span className="truncate text-muted-foreground">{t.meaning}</span>
          </Row>
        ))}
      </Group>
    </section>
  )
}

function Group({ title, open, onToggle, children }: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
        {title}
      </button>
      {open && <div className="max-h-64 divide-y overflow-y-auto border-t">{children}</div>}
    </div>
  )
}

function Row({ term, onDelete, children }: {
  term: TakeoffTerm
  onDelete: (term: TakeoffTerm) => void
  children: React.ReactNode
}) {
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 text-xs">
      {children}
      <Badge variant="outline" className="shrink-0 text-[10px] capitalize">{term.level}</Badge>
      {term.level !== "base" && (
        <button
          type="button"
          aria-label={`Remove ${term.code}`}
          onClick={() => onDelete(term)}
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function AddTerm({ documentId, onAdded }: { documentId: string; onAdded: () => void }) {
  const [code, setCode] = useState("")
  const [meaning, setMeaning] = useState("")
  const [saving, setSaving] = useState(false)
  return (
    <form
      className="flex items-center gap-1.5 px-2 py-2"
      onSubmit={async e => {
        e.preventDefault()
        if (!code.trim()) return
        setSaving(true)
        try {
          await takeoffService.createTerm(documentId, { level: "project", kind: "tag", code: code.trim(), meaning: meaning.trim() })
          setCode("")
          setMeaning("")
          onAdded()
        } finally {
          setSaving(false)
        }
      }}
    >
      <Input className="h-7 w-16 font-mono text-xs" placeholder="Tag" value={code} onChange={e => setCode(e.target.value)} />
      <Input className="h-7 flex-1 text-xs" placeholder="What it is" value={meaning} onChange={e => setMeaning(e.target.value)} />
      <Button type="submit" size="icon" variant="ghost" className="h-7 w-7" disabled={saving || !code.trim()} aria-label="Add tag">
        {saving ? <Loader2 className="animate-spin" /> : <Plus />}
      </Button>
    </form>
  )
}

/**
 * Mede a forma de cada símbolo da legenda que ainda não tem: abre a folha da
 * legenda, lê o vetor em volta do texto de exemplo e grava a forma. Uma vez por
 * termo por visita, e sem contar como correção humana.
 */
function useMeasureLegend(legend: TakeoffTerm[], onChanged: () => void) {
  const tried = useRef(new Set<string>())
  useEffect(() => {
    const pending = legend.filter(t =>
      !t.attrs.shape && t.sheetId && Array.isArray(t.attrs.sampleBox) && !tried.current.has(t.id))
    if (!pending.length) return
    for (const t of pending) tried.current.add(t.id)
    let alive = true
    ;(async () => {
      let changed = false
      const bySheet = new Map<string, TakeoffTerm[]>()
      for (const t of pending) bySheet.set(t.sheetId!, [...(bySheet.get(t.sheetId!) ?? []), t])
      for (const [sheetId, list] of bySheet) {
        try {
          const source = await atlasService.sheetUrl(sheetId)
          const boxes = list.map(t => t.attrs.sampleBox as number[])
          const x0 = Math.min(...boxes.map(b => b[0])) - 80
          const y0 = Math.min(...boxes.map(b => b[1])) - 80
          const x1 = Math.max(...boxes.map(b => b[2])) + 80
          const y1 = Math.max(...boxes.map(b => b[3])) + 80
          const read = await readVectors(source.url, source.whole ? source.pageIndex : 0, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
          for (const t of list) {
            const [bx0, by0, bx1, by1] = t.attrs.sampleBox as number[]
            const outline = tagOutline(read, { x0: bx0, y0: by0, x1: bx1, y1: by1 })
            if (!outline) continue
            await takeoffService.updateTerm(t.id, { attrs: { shape: outline.shape }, measured: true })
            changed = true
          }
        } catch {
          // Folha que não abriu fica sem forma; a legenda ainda serve pelo rótulo.
        }
      }
      if (alive && changed) onChanged()
    })()
    return () => { alive = false }
  }, [legend, onChanged])
}
