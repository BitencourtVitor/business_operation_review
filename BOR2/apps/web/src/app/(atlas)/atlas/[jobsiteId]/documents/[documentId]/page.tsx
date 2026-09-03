"use client"

import { backfillThumbs } from "@/components/atlas/plan-split"
import { SheetViewer } from "@/components/atlas/sheet-viewer"
import { VersionUpload } from "@/components/atlas/version-upload"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  useAtlasDocuments, useAtlasJobsite, useAtlasSheets, useAtlasThumbs, useAtlasVersions,
  usePublishAtlasVersion, useUpdateAtlasSheet,
} from "@/hooks/use-atlas"
import { atlasService, type AtlasSheet } from "@/services/atlas.service"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Check, Download, Images, Layers } from "lucide-react"
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

  useEffect(() => {
    if (!versionId && versions?.length) setVersionId(versions[0].id)
  }, [versions, versionId])

  const { data: sheets } = useAtlasSheets(versionId)
  const { data: thumbs, refetch: refetchThumbs } = useAtlasThumbs(versionId)
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
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <div className="flex items-start gap-3">
            <Link
              href={`/atlas/${jobsiteId}`}
              className="mt-1 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{doc?.name ?? "Document"}</h1>
              <p className="truncate text-sm text-muted-foreground">
                {[jobsite?.name, doc?.discipline].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          {canManage && <VersionUpload documentId={documentId} />}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Versions</h2>
            {isLoading ? (
              <div className="flex h-24 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              </div>
            ) : !versions?.length ? (
              <p className="text-sm text-muted-foreground">
                No revisions yet. The original PDF is immutable: a new revision is always a new
                version, never an overwrite.
              </p>
            ) : versions.map(v => {
              const status = STATUS[v.status]
              const selected = v.id === versionId
              return (
                <div
                  key={v.id}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors ${
                    selected ? "border-primary/50 bg-accent/30" : "border-border/60 bg-card"
                  }`}
                >
                  <button className="min-w-0 flex-1 text-left" onClick={() => setVersionId(v.id)}>
                    <p className="text-sm font-medium leading-tight">rev {v.revision}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[bytes(v.byteSize), v.pageCount ? `${v.pageCount} pages` : null,
                        new Date(v.uploadedAt).toLocaleDateString()].filter(Boolean).join(" · ")}
                    </p>
                  </button>
                  {status && <Badge variant="outline" className={status.className}>{status.label}</Badge>}
                  {selected && v.status !== "pending" && (
                    <Button variant="outline" onClick={download}>
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  )}
                  {canManage && v.status === "uploaded" && (
                    <Button onClick={() => publish.mutate(v.id)} disabled={publish.isPending}>
                      Publish
                    </Button>
                  )}
                </div>
              )
            })}
          </section>

          {version && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  Plans in rev {version.revision}
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
