"use client"

import { backfillThumbs } from "@/components/atlas/plan-split"
import { SheetViewer } from "@/components/atlas/sheet-viewer"
import { UploadPlanDialog } from "@/components/atlas/upload-plan-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  useAtlasDocCategories, useAtlasDocuments, useAtlasJobsite, useAtlasSheets, useAtlasThumbs, useAtlasVersions,
  usePublishAtlasVersion, useRenameAtlasSheets, useUpdateAtlasSheet, useUpdateDocCategory, useUploadAtlasVersion,
} from "@/hooks/use-atlas"
import { NamingTemplateDialog } from "@/components/atlas/naming-template-dialog"
import { readPageNames, type NamingTemplate } from "@/components/atlas/plan-naming"
import { atlasService, type AtlasSheet } from "@/services/atlas.service"
import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, Check, CloudUpload, Download, Highlighter, Images, Layers, Link2, MapPin, ScanText,
} from "lucide-react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

const STATUS: Record<string, { label: string; className: string }> = {
  pending:   { label: "Awaiting upload", className: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  uploaded:  { label: "In review",       className: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  published: { label: "Published",       className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
  failed:    { label: "Failed",          className: "border-destructive/40 text-destructive" },
}

function bytes(n: number) {
  if (!n) return "—"
  const units = ["B", "KB", "MB", "GB"]
  let v = n, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// A folha é um cartão quadrado: a prancha em cima, ocupando tudo, e a
// identificação no rodapé. É como o Fieldwire e o MiTek mostram um set, e por um
// motivo prático: o que distingue uma planta da outra é o desenho, não o número
// dela. Em lista, a imagem cabia em 64x48 e não distinguia nada.
function SheetCard({ sheet, versionId, canManage, thumb, waiting, onOpen }: {
  sheet: AtlasSheet; versionId: string; canManage: boolean; thumb?: string
  /** Ainda na fila do corte: o recorte dela não existe no bucket. */
  waiting?: boolean
  onOpen: () => void
}) {
  const update = useUpdateAtlasSheet(versionId)
  const [draft, setDraft] = useState({ sheetNumber: sheet.sheetNumber, title: sheet.title })
  const dirty = draft.sheetNumber !== sheet.sheetNumber || draft.title !== sheet.title

  return (
    <div className="flex aspect-square flex-col overflow-hidden rounded-lg border border-border/60 bg-card transition-colors hover:border-primary/40">
      {/* Sem respiro em volta da imagem: a moldura do cartão já é a moldura da
          prancha, e qualquer margem aqui só encolhe o desenho. */}
      <button onClick={onOpen} disabled={waiting} className="relative min-h-0 flex-1 bg-white">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          <span className={`absolute inset-0 flex items-center justify-center bg-muted/40 text-sm text-muted-foreground/60 ${
            waiting ? "animate-pulse" : ""
          }`}>
            {sheet.pageIndex + 1}
          </span>
        )}

        {sheet.needsReview && !dirty && (
          <Badge
            variant="outline"
            className="absolute right-1.5 top-1.5 border-amber-500/40 bg-background/90 text-amber-600 dark:text-amber-400"
          >
            review
          </Badge>
        )}
      </button>

      {/* Um campo de identificação, não dois. O número da página o sistema já
          sabe, e sai como prefixo apagado ao lado; o que se digita é o nome da
          folha, que o gabarito preencheu a partir do próprio desenho. */}
      <div className="flex shrink-0 items-center gap-1.5 border-t border-border/60 px-2 pb-1.5 pt-2">
        {/* Largura fixa para o número: a três dígitos ele continua cabendo, e a
            coluna não dança de cartão para cartão. O nome cede esse espaço,
            porque sigla de folha é curta e sobra borda dentro do campo. */}
        <span className="w-7 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
          {sheet.pageIndex + 1}
        </span>
        {canManage ? (
          <>
            <Input
              value={draft.sheetNumber}
              placeholder="Sheet name"
              className="h-7 flex-1 font-medium"
              onChange={e => setDraft({ ...draft, sheetNumber: e.target.value })}
            />
            {dirty && (
              <Button
                size="icon"
                className="h-7 w-7 shrink-0"
                title="Save"
                onClick={() => update.mutate({
                  sheetId: sheet.id,
                  patch: { ...draft, needsReview: false } as Partial<AtlasSheet>,
                })}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        ) : (
          <p className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
            {sheet.sheetNumber || `Page ${sheet.pageIndex + 1}`}
          </p>
        )}
      </div>

      {/* O rodapé conta o que existe sobre a folha, por tipo, com ícone e
          número lado a lado: quem conhece o ícone lê a folha inteira sem abrir.
          Caneta fica de fora de propósito, porque dois traços podem ser uma
          letra e o número de vetores não diz quanto foi escrito ali.

          Vazio quando nada foi marcado: uma fileira de zeros ocuparia a mesma
          linha para dizer que não há nada. */}
      <div className="flex h-6 shrink-0 items-center gap-3 px-2 pb-1.5 text-[11px] text-muted-foreground">
        {sheet.links > 0 && (
          <span className="flex items-center gap-1" title={`${sheet.links} link${sheet.links > 1 ? "s" : ""}`}>
            <Link2 className="h-3.5 w-3.5" />
            {sheet.links}
          </span>
        )}
        {sheet.highlights > 0 && (
          <span className="flex items-center gap-1" title={`${sheet.highlights} highlight${sheet.highlights > 1 ? "s" : ""}`}>
            <Highlighter className="h-3.5 w-3.5" />
            {sheet.highlights}
          </span>
        )}
        {sheet.notes > 0 && (
          <span className="flex items-center gap-1" title={`${sheet.notes} note${sheet.notes > 1 ? "s" : ""}`}>
            <MapPin className="h-3.5 w-3.5" />
            {sheet.notes}
          </span>
        )}
      </div>
    </div>
  )
}

export default function DocumentPage() {
  const { jobsiteId, documentId } = useParams<{ jobsiteId: string; documentId: string }>()
  const { data: jobsite } = useAtlasJobsite(jobsiteId)
  const { data: documents } = useAtlasDocuments(jobsiteId)
  const { data: versions, isLoading } = useAtlasVersions(documentId)
  const publish = usePublishAtlasVersion(documentId)

  const doc = useMemo(() => documents?.find(d => d.id === documentId), [documents, documentId])
  const canManage = jobsite?.level === "manage"
  const canAnnotate = canManage || jobsite?.level === "annotate"

  const [versionId, setVersionId] = useState("")
  const [openSheet, setOpenSheet] = useState<AtlasSheet | null>(null)
  const [uploading, setUploading] = useState(false)

  const upload = useUploadAtlasVersion(documentId)
  // A prévia desenhada no próprio navegador, por página. Ela aparece no cartão
  // no instante em que a folha termina, sem esperar o bucket devolver a imagem
  // assinada. Some sozinha quando a do servidor chega.
  const [previews, setPreviews] = useState<Map<number, string>>(new Map())
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null)
  const [sendError, setSendError] = useState("")

  // Nomear é etapa à parte do envio, e pode acontecer dias depois: o set sobe,
  // as folhas nascem numeradas por página, e o gabarito entra quando alguém
  // sentar para marcar onde o nome está impresso. Enquanto isso não acontece a
  // página diz que está pendente em vez de fingir que terminou.
  const [naming, setNaming] = useState(false)
  const [namingUrl, setNamingUrl] = useState("")
  const [applying, setApplying] = useState("")
  const [namingError, setNamingError] = useState("")

  useEffect(() => {
    if (!versionId && versions?.length) setVersionId(versions[0].id)
  }, [versions, versionId])


  const { data: sheets } = useAtlasSheets(versionId)
  const { data: thumbs, refetch: refetchThumbs } = useAtlasThumbs(versionId)
  // Chegar direto numa folha, que é o outro lado do vínculo desenhado na
  // prancha: sem isto o link entre pastas abriria a lista e devolveria a
  // procura para quem clicou justamente para não procurar.
  const wanted = useSearchParams().get("sheet")
  const [jumped, setJumped] = useState("")
  useEffect(() => {
    if (!wanted || jumped === wanted || !sheets?.length) return
    const target = sheets.find(s => s.id === wanted)
    if (!target) return
    setOpenSheet(target)
    setJumped(wanted)
  }, [wanted, jumped, sheets])
  const { data: categories = [] } = useAtlasDocCategories()
  const qc = useQueryClient()
  // Prévias que faltam: as folhas cortadas antes de a miniatura existir. O
  // botão só aparece enquanto houver alguma, e some sozinho quando acabam.
  const [filling, setFilling] = useState("")
  const [fillError, setFillError] = useState("")
  const missingThumbs = (sheets ?? []).filter(s => !s.thumbKey).length

  async function fillThumbs() {
    if (!sheets?.length) return
    setFilling(`0/${missingThumbs}`)
    setFillError("")
    try {
      await backfillThumbs(versionId, sheets, (done, total) => setFilling(`${done}/${total}`))
      await refetchThumbs()
      await qc.invalidateQueries({ queryKey: ["atlas", "sheets", versionId] })
    } catch (e) {
      setFillError(e instanceof Error ? e.message : "could not make the previews")
    } finally {
      setFilling("")
    }
  }
  const version = versions?.find(v => v.id === versionId)
  const rename = useRenameAtlasSheets(versionId)
  const updateCategory = useUpdateDocCategory()
  const unnamed = (sheets ?? []).filter(s => !s.sheetNumber).length

  async function openNaming() {
    setNamingError("")
    try {
      // O gabarito se marca sobre o original, não sobre o recorte: é ali que
      // estão todas as páginas, e é o mesmo arquivo que a leitura vai varrer.
      const { url } = await atlasService.versionDownloadUrl(versionId)
      setNamingUrl(url)
      setNaming(true)
    } catch (e) {
      setNamingError(e instanceof Error ? e.message : "could not open the plan set")
    }
  }

  async function applyNaming(template: NamingTemplate) {
    setNaming(false)
    setNamingError("")
    setApplying("0")
    try {
      const names = await readPageNames(namingUrl, template,
        (done, total) => setApplying(`${done}/${total}`),
        undefined,
        // O nome com que o arquivo foi guardado no bucket. O título declarado
        // dentro do PDF vem antes dele; isto é a rede de segurança.
        version?.r2Key.split("/").pop() ?? "")
      await rename.mutateAsync(
        names.filter(n => n.name).map(n => ({ pageIndex: n.pageIndex, sheetNumber: n.name })),
      )
      // Guardado na categoria: o próximo envio do mesmo relatório já sobe
      // nomeado, sem ninguém remarcar nada.
      if (doc?.categoryId) {
        updateCategory.mutate({ id: doc.categoryId, naming: template }, { onError: () => {} })
      }
    } catch (e) {
      setNamingError(e instanceof Error ? e.message : "could not read the names")
    } finally {
      setApplying("")
    }
  }

  function startUpload(file: File, names?: Map<number, string>) {
    setPreviews(new Map())
    setSendError("")
    setSending({ done: 0, total: 0 })
    upload.mutate({
      file,
      names,
      revision: String((versions?.length ?? 0) + 1),
      onSheets: (id, pageCount) => {
        setSending({ done: 0, total: pageCount })
        setVersionId(id)
        qc.invalidateQueries({ queryKey: ["atlas", "versions", documentId] })
      },
      onPage: (pageIndex, preview) => {
        setPreviews(m => new Map(m).set(pageIndex, preview))
        setSending(s => s && { ...s, done: s.done + 1 })
      },
    }, {
      onSuccess: () => {
        setSending(null)
        // O recorte e a miniatura do bucket entram no lugar da prévia local.
        qc.invalidateQueries({ queryKey: ["atlas", "sheets"] })
        refetchThumbs()
      },
      onError: e => {
        setSending(null)
        setSendError(e instanceof Error ? e.message : "could not upload")
      },
    })
  }

  async function download() {
    const { url } = await atlasService.versionDownloadUrl(versionId)
    window.open(url, "_blank", "noopener")
  }

  return (
    <>
      {/* Altura da tela, não do conteúdo: quem rola é a lista de folhas, dentro
          da caixa dela. São 97 cartões, e deixar a página inteira rolar tirava
          o cabeçalho e o botão de enviar do campo de visão logo no primeiro
          gesto. */}
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-6">
          <div className="flex items-center gap-3">
            {/* O fio separa sair de estar: sem ele a seta encosta no título e
                parece parte dele. */}
            <Link
              href={`/atlas/${jobsiteId}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Back to the jobsite"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="h-9 w-px shrink-0 bg-border" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold leading-tight">{doc?.name ?? "Document"}</h1>
              <p className="truncate text-sm text-muted-foreground">
                {[jobsite?.name, doc?.discipline].filter(Boolean).join(" · ")}
              </p>
            </div>
            {canManage && (
              <Button className="shrink-0" onClick={() => setUploading(true)}>
                <CloudUpload className="h-4 w-4" />
                {versions?.length ? "Replace" : "Upload plan set"}
              </Button>
            )}
            {version && version.status !== "pending" && (
              <Button variant="outline" className="shrink-0" onClick={download}>
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            )}
          </div>

          {/* A categoria vai junto: é nela que o gabarito de nomenclatura fica
              guardado, e é dela que ele volta no próximo envio. */}
          {canManage && (
            <UploadPlanDialog
              categoryId={doc?.categoryId ?? undefined}
              naming={categories.find(c => c.id === doc?.categoryId)?.naming}
              revisionCount={versions?.length ?? 0}
              open={uploading}
              onStart={startUpload}
              onClose={() => setUploading(false)}
            />
          )}

          {!isLoading && !versions?.length && (
            <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
              <p className="text-sm font-medium">No plan set here yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Upload the PDF and say where each sheet name is printed. The pages become
                sheets with a preview, named by the drawing itself.
              </p>
            </div>
          )}

          {canManage && !!sheets?.length && (unnamed > 0 || namingError) && (
            <div className="flex shrink-0 items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
              <ScanText className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="min-w-0 flex-1 text-sm">
                {namingError ? (
                  <span className="text-destructive">{namingError}</span>
                ) : (
                  <>
                    <span className="font-medium">Naming pending</span>
                    <span className="text-muted-foreground">
                      {" · "}{unnamed} of {sheets.length} sheets still go by page number
                    </span>
                  </>
                )}
              </span>
              <Button
                variant="outline"
                className="shrink-0"
                disabled={!!applying}
                onClick={openNaming}
              >
                {applying ? `Reading ${applying}` : "Set up naming"}
              </Button>
            </div>
          )}

          {canManage && namingUrl && (
            <NamingTemplateDialog
              url={namingUrl}
              open={naming}
              initial={categories.find(c => c.id === doc?.categoryId)?.naming}
              onClose={() => setNaming(false)}
              onSave={applyNaming}
            />
          )}

          {version && (
            <section className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  Sheets
                </h2>
                <div className="flex items-center gap-2">
                  {fillError && (
                    <span className="text-xs text-destructive">{fillError}</span>
                  )}
                  {canManage && missingThumbs > 0 && (
                    <Button variant="outline" onClick={fillThumbs} disabled={!!filling}>
                      <Images className="h-3.5 w-3.5" />
                      {filling ? `Making previews ${filling}` : `Make ${missingThumbs} previews`}
                    </Button>
                  )}
                  {sending && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      Sending {sending.done}/{sending.total || "…"}
                    </span>
                  )}
                  {sendError && <span className="text-xs text-destructive">{sendError}</span>}
                  <span className="text-xs text-muted-foreground">{sheets?.length ?? 0}</span>
                </div>
              </div>

              {!sheets?.length ? (
                <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
                  <p className="text-sm font-medium">No plans yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Plans are created from the PDF when a revision is uploaded — one per page, the
                    way Fieldwire does it. The sheet number is yours to fill in.
                  </p>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {sheets.map(s => (
                      <SheetCard
                        key={s.id}
                        sheet={s}
                        versionId={versionId}
                        canManage={!!canManage}
                        thumb={thumbs?.get(s.id) ?? previews.get(s.pageIndex)}
                        waiting={!s.r2Key && !previews.has(s.pageIndex)}
                        onOpen={() => setOpenSheet(s)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
      </div>

      {openSheet && sheets && (
        <SheetViewer
          sheet={openSheet}
          sheets={sheets}
          jobsiteId={jobsiteId}
          canAnnotate={!!canAnnotate}
          onClose={() => setOpenSheet(null)}
          onNavigate={setOpenSheet}
        />
      )}
    </>
  )
}
