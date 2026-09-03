"use client"

import { backfillThumbs } from "@/components/atlas/plan-split"
import { SheetViewer } from "@/components/atlas/sheet-viewer"
import { UploadPlanDialog } from "@/components/atlas/upload-plan-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  useAtlasDocCategories, useAtlasDocuments, useAtlasJobsite, useAtlasSheets, useAtlasThumbs, useAtlasVersions,
  usePublishAtlasVersion, useUpdateAtlasSheet,
} from "@/hooks/use-atlas"
import { atlasService, type AtlasSheet } from "@/services/atlas.service"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Check, CloudUpload, Download, Images, Layers } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
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
function SheetCard({ sheet, versionId, canManage, thumb, onOpen }: {
  sheet: AtlasSheet; versionId: string; canManage: boolean; thumb?: string; onOpen: () => void
}) {
  const update = useUpdateAtlasSheet(versionId)
  const [draft, setDraft] = useState({ sheetNumber: sheet.sheetNumber, title: sheet.title })
  const dirty = draft.sheetNumber !== sheet.sheetNumber || draft.title !== sheet.title

  return (
    <div className="flex aspect-square flex-col overflow-hidden rounded-lg border border-border/60 bg-card transition-colors hover:border-primary/40">
      {/* Sem respiro em volta da imagem: a moldura do cartão já é a moldura da
          prancha, e qualquer margem aqui só encolhe o desenho. */}
      <button onClick={onOpen} className="relative min-h-0 flex-1 bg-white">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground/60">
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
        {sheet.annotations > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-background/85 px-1.5 text-[11px] text-muted-foreground">
            {sheet.annotations} marks
          </span>
        )}
      </button>

      <div className="flex shrink-0 flex-col gap-1 border-t border-border/60 p-2">
        {canManage ? (
          <>
            <Input
              value={draft.sheetNumber}
              placeholder={`Plan no. (page ${sheet.pageIndex + 1})`}
              className="h-7 font-medium"
              onChange={e => setDraft({ ...draft, sheetNumber: e.target.value })}
            />
            <div className="flex items-center gap-1">
              <Input
                value={draft.title}
                placeholder="Title"
                className="h-7 flex-1"
                onChange={e => setDraft({ ...draft, title: e.target.value })}
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
            </div>
          </>
        ) : (
          <>
            <p className="truncate text-sm font-medium leading-tight">
              {sheet.sheetNumber || `Page ${sheet.pageIndex + 1}`}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {sheet.title || "No title yet"}
            </p>
          </>
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

  useEffect(() => {
    if (!versionId && versions?.length) setVersionId(versions[0].id)
  }, [versions, versionId])

  const { data: sheets } = useAtlasSheets(versionId)
  const { data: thumbs, refetch: refetchThumbs } = useAtlasThumbs(versionId)
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
              documentId={documentId}
              categoryId={doc?.categoryId ?? undefined}
              naming={categories.find(c => c.id === doc?.categoryId)?.naming}
              revisionCount={versions?.length ?? 0}
              open={uploading}
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
                        thumb={thumbs?.get(s.id)}
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
