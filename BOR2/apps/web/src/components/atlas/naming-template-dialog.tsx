"use client"

import { PdfPage, loadPdf } from "@/components/atlas/pdf-page"
import {
  readPageNames, type NamingRegion, type NamingTemplate, type PageName,
} from "@/components/atlas/plan-naming"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { ChevronLeft, ChevronRight, RotateCw, Trash2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

const EMPTY_REGION: NamingRegion = { x0: 0, y0: 0, x1: 0, y1: 0, rotation: 0, after: "" }

const ROTATIONS = [
  { value: "0", label: "Deitado" },
  { value: "90", label: "Em pé, de baixo para cima" },
  { value: "270", label: "Em pé, de cima para baixo" },
]

const has = (r: NamingRegion) => r.x1 > r.x0 && r.y1 > r.y0

/**
 * Onde o nome de cada folha está impresso.
 *
 * Um plan set não vem com os nomes num campo à parte: eles estão desenhados na
 * própria prancha, sempre no mesmo canto, porque quem emitiu usou um gabarito.
 * Aqui se marca esse canto uma vez e as noventa e sete páginas se nomeiam
 * sozinhas.
 *
 * Dois níveis porque um só não dá conta. No relatório de produção da Simpson, a
 * folha de um painel traz a sigla dele no rodapé; a folha de um lote inteiro não
 * traz sigla nenhuma, e o que a identifica é o bundle no cabeçalho. O primeiro
 * nível que devolver texto ganha.
 */
export function NamingTemplateDialog({ url, open, initial, onClose, onSave }: {
  url: string
  open: boolean
  initial?: NamingTemplate
  onClose: () => void
  onSave: (template: NamingTemplate) => void
}) {
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const [levels, setLevels] = useState<NamingRegion[]>([{ ...EMPTY_REGION }])
  const [drawing, setDrawing] = useState<number | null>(null)
  const [preview, setPreview] = useState<PageName[] | null>(null)
  const [reading, setReading] = useState("")

  const sheetRef = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  // Quantas folhas o arquivo tem: sem isso não há como virar página até achar
  // uma de cada tipo, que é o gesto que este diálogo pede.
  useEffect(() => {
    if (!open || !url) return
    let alive = true
    loadPdf(url).then(pdf => { if (alive) setPages(pdf.numPages) }).catch(() => {})
    return () => { alive = false }
  }, [open, url])

  useEffect(() => {
    if (!open) return
    setPreview(null)
    setLevels(initial?.levels?.length ? initial.levels.map(l => ({ ...l })) : [{ ...EMPTY_REGION }])
    setPage(0)
  }, [open, initial])

  const point = useCallback((e: React.PointerEvent) => {
    const box = sheetRef.current?.getBoundingClientRect()
    if (!box) return { x: 0, y: 0 }
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    }
  }, [])

  function down(e: React.PointerEvent) {
    if (drawing === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = point(e)
    setPreview(null)
  }

  function move(e: React.PointerEvent) {
    if (drawing === null || !start.current) return
    const now = point(e)
    const a = start.current
    setLevels(list => list.map((l, i) => i === drawing ? {
      ...l,
      x0: Math.min(a.x, now.x), y0: Math.min(a.y, now.y),
      x1: Math.max(a.x, now.x), y1: Math.max(a.y, now.y),
    } : l))
  }

  function up() {
    if (drawing === null) return
    start.current = null
    setDrawing(null)
  }

  async function runPreview() {
    const usable = levels.filter(has)
    if (!usable.length) return
    setReading("0")
    try {
      const names = await readPageNames(url, { levels: usable },
        (done, total) => setReading(`${done}/${total}`))
      setPreview(names)
    } finally {
      setReading("")
    }
  }

  const usable = levels.filter(has)
  const named = preview?.filter(p => p.name).length ?? 0
  const pending = preview ? preview.length - named : 0

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[90vh] w-[min(96vw,68rem)] max-w-none flex-col gap-4 sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Where the sheet name is printed</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-4">
          {/* A folha, com as marcações por cima. */}
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button
                size="icon" variant="outline" className="h-8 w-8"
                disabled={page === 0}
                onClick={() => { setPage(p => Math.max(0, p - 1)); setPreview(null) }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                Page {page + 1} of {pages}
              </span>
              <Button
                size="icon" variant="outline" className="h-8 w-8"
                disabled={page + 1 >= pages}
                onClick={() => { setPage(p => p + 1); setPreview(null) }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <p className="ml-2 text-xs text-muted-foreground">
                {/* A amostra precisa ser trocável: a página que tem a sigla do
                    primeiro nível não é a mesma que só tem a do segundo. */}
                Vire a página até achar uma folha de cada tipo.
              </p>
            </div>

            <div
              ref={sheetRef}
              className={`relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-white ${
                drawing !== null ? "cursor-crosshair" : ""
              }`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              <PdfPage url={url} pageIndex={page} scale={1.4} />

              {levels.map((region, i) => has(region) && (
                <div
                  key={i}
                  className={`pointer-events-none absolute border-2 ${
                    i === 0 ? "border-sky-500 bg-sky-500/15" : "border-violet-500 bg-violet-500/15"
                  }`}
                  style={{
                    left: `${region.x0 * 100}%`,
                    top: `${region.y0 * 100}%`,
                    width: `${(region.x1 - region.x0) * 100}%`,
                    height: `${(region.y1 - region.y0) * 100}%`,
                  }}
                >
                  <span className={`absolute -top-5 left-0 rounded px-1 text-[10px] font-medium text-white ${
                    i === 0 ? "bg-sky-500" : "bg-violet-500"
                  }`}>
                    {i === 0 ? "1st" : "2nd"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Os níveis e a prévia. */}
          <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto pr-1">
            {levels.map((region, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={`h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-sky-500" : "bg-violet-500"}`} />
                    {i === 0 ? "First level" : "Second level"}
                  </span>
                  {i > 0 && (
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => setLevels(l => l.slice(0, i))}
                      title="Remove this level"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <Button
                  variant={drawing === i ? "default" : "outline"}
                  onClick={() => setDrawing(drawing === i ? null : i)}
                >
                  {drawing === i ? "Draw on the sheet…"
                    : has(region) ? "Redraw the area" : "Draw the area"}
                </Button>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Text direction</Label>
                  <Select
                    value={String(region.rotation)}
                    onValueChange={v => v && setLevels(l => l.map((r, k) =>
                      k === i ? { ...r, rotation: Number(v) } : r))}
                  >
                    <SelectTrigger className="w-full">
                      <span className="flex-1 truncate text-left text-sm">
                        {ROTATIONS.find(r => r.value === String(region.rotation))?.label}
                      </span>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      {ROTATIONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`after-${i}`} className="text-xs text-muted-foreground">
                    Keep what comes after
                  </Label>
                  <Input
                    id={`after-${i}`}
                    value={region.after}
                    placeholder=":"
                    onChange={e => setLevels(l => l.map((r, k) =>
                      k === i ? { ...r, after: e.target.value } : r))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Com <code>:</code>, &ldquo;Bundle: 1-06-L&rdquo; vira &ldquo;1-06-L&rdquo;.
                  </p>
                </div>
              </div>
            ))}

            {levels.length < 2 && (
              <Button variant="outline" onClick={() => setLevels(l => [...l, { ...EMPTY_REGION }])}>
                <RotateCw className="h-3.5 w-3.5" />
                Add a second level
              </Button>
            )}

            {preview && (
              <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <p className="text-sm font-medium">
                  {named} of {preview.length} named
                  {pending > 0 && <span className="text-destructive"> · {pending} pending</span>}
                </p>
                <div className="max-h-56 overflow-y-auto">
                  {preview.map(p => (
                    <div
                      key={p.pageIndex}
                      className="flex items-baseline gap-2 py-0.5 text-xs"
                    >
                      <span className="w-8 shrink-0 tabular-nums text-muted-foreground">
                        {p.pageIndex + 1}
                      </span>
                      <span className={`min-w-0 flex-1 truncate ${p.name ? "" : "text-destructive"}`}>
                        {p.name || "sem nome"}
                      </span>
                      {p.level > 0 && (
                        <span className={`shrink-0 rounded px-1 text-[10px] ${
                          p.level === 1 ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                            : "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                        }`}>
                          {p.level === 1 ? "1st" : "2nd"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {/* A prévia é a única forma honesta de aprovar isto: são noventa e
                sete nomes, e olhar a folha marcada não diz o que as outras vão
                receber. */}
            Confira a prévia antes de gravar: ela roda em todas as páginas.
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              variant="outline"
              disabled={!usable.length || !!reading}
              onClick={runPreview}
            >
              {reading ? `Reading ${reading}` : "Preview names"}
            </Button>
            <Button
              disabled={!usable.length}
              onClick={() => onSave({ levels: usable })}
            >
              Save template
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
