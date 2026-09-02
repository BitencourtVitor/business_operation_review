"use client"

import { DailyLogPanel } from "@/components/atlas/daily-log-panel"
import { EventsPanel } from "@/components/atlas/events-panel"
import { JobsiteAccessPanel } from "@/components/atlas/jobsite-access-panel"
import { JobsiteSettingsDialog } from "@/components/atlas/jobsite-settings-dialog"
import { PhotosPanel } from "@/components/atlas/photos-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import {
  useAddCategorySlot, useAtlasDocCategories, useAtlasDocuments, useAtlasJobsite,
  useCreateDocCategory,
} from "@/hooks/use-atlas"

import type { AtlasDocument } from "@/services/atlas.service"
import { FileQuestion, FolderOpen, Layers, MapPin, Plus } from "lucide-react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useState } from "react"

const VERSION_STATUS: Record<string, { label: string; className: string }> = {
  pending:   { label: "Awaiting upload", className: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  uploaded:  { label: "In review",       className: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  published: { label: "Published",       className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
  failed:    { label: "Failed",          className: "border-destructive/40 text-destructive" },
}

const AXIS_OPTIONS = [
  { value: "none", label: "Single folder" },
  { value: "floor", label: "One per floor" },
  { value: "unit", label: "One per unit" },
]

const TAB_TITLE: Record<string, string> = {
  documents: "Documents",
  photos: "Photos",
  tasks: "Tasks",
  diary: "Diary",
  access: "Access",
}

function NewDocumentDialog({ jobsiteId, client, kind, usedCategoryIds }: {
  jobsiteId: string; client: string; kind: string; usedCategoryIds: Set<number>
}) {
  const [open, setOpen] = useState(false)
  const addSlot = useAddCategorySlot(jobsiteId)
  const createCategory = useCreateDocCategory()

  // Toda pasta pertence a uma categoria — não existe documento sem filiação.
  // Por isso não há campo livre aqui: ou se escolhe uma categoria que a
  // taxonomia já conhece, ou se cria uma, que fica guardada para as outras
  // obras poderem usar depois.
  const { data: categories = [] } = useAtlasDocCategories()
  const available = categories
    .filter(c => !c.client || c.client.toLowerCase() === client.toLowerCase())
    .filter(c => !c.buildType || c.buildType.toLowerCase() === kind.toLowerCase())
    .filter(c => !usedCategoryIds.has(c.id))

  const [mode, setMode] = useState<"pick" | "new">("pick")
  const [picked, setPicked] = useState("")
  const [draft, setDraft] = useState({ name: "", axis: "none" })

  function close() {
    setOpen(false)
    setMode("pick"); setPicked(""); setDraft({ name: "", axis: "none" })
  }

  function confirm() {
    if (mode === "pick") {
      if (!picked) return
      addSlot.mutate(Number(picked), { onSuccess: close })
      return
    }
    if (!draft.name.trim()) return
    // Nasce como sugestão: só esta obra recebe a pasta agora. As demais a
    // acrescentam quando precisarem — inclusive as já cadastradas.
    createCategory.mutate(
      { client: "", buildType: kind, name: draft.name.trim(), axis: draft.axis, defaultSlot: false, jobsiteId },
      { onSuccess: close },
    )
  }

  const pending = addSlot.isPending || createCategory.isPending

  return (
    <Dialog open={open} onOpenChange={v => (v ? setOpen(true) : close())}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus className="h-4 w-4" />
        Add folder
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add a folder to this jobsite</DialogTitle></DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex gap-1 rounded-lg border border-border/60 p-1">
            {(["pick", "new"] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  mode === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "pick" ? "From the taxonomy" : "New category"}
              </button>
            ))}
          </div>

          {mode === "pick" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slot-category">Category</Label>
              <Select value={picked} onValueChange={v => setPicked(v ?? "")}>
                <SelectTrigger id="slot-category" className="w-full">
                  <span className="flex-1 truncate text-left text-sm">
                    {available.find(o => String(o.id) === picked)?.name ?? "Select a category…"}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {available.map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.axis === "floor" ? `${o.name} — one per floor`
                        : o.axis === "unit" ? `${o.name} — one per unit`
                        : o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {available.length === 0
                  ? "Every category in the taxonomy is already here."
                  : "Only what this jobsite doesn't have yet."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cat-name">Category name</Label>
                <Input
                  id="cat-name"
                  value={draft.name}
                  placeholder="Panels - Elevation - Bearing Walls…"
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cat-axis">Subcategory</Label>
                <Select value={draft.axis} onValueChange={v => setDraft(d => ({ ...d, axis: v ?? "none" }))}>
                  <SelectTrigger id="cat-axis" className="w-full">
                    <span className="flex-1 text-left text-sm">
                      {AXIS_OPTIONS.find(a => a.value === draft.axis)?.label}
                    </span>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {AXIS_OPTIONS.map(a => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Saved for every jobsite to use later — added here only for now.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button
            disabled={pending || (mode === "pick" ? !picked : !draft.name.trim())}
            onClick={confirm}
          >
            {pending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DocumentsPanel({ jobsiteId, client, kind, canManage }: {
  jobsiteId: string; client: string; kind: string; canManage: boolean
}) {
  const { data: documents, isLoading } = useAtlasDocuments(jobsiteId)

  // A lista é a das vagas da própria obra, criadas a partir da taxonomia do
  // Atlas quando ela foi cadastrada ou importada. A pasta existe desde o
  // começo; o que muda é ter documento dentro ou não — e é essa lacuna que a
  // obra precisa mostrar.
  const slots = documents ?? []

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  const row = (key: string, doc: AtlasDocument | undefined, label: string) => {
    const status = doc ? VERSION_STATUS[doc.latestStatus] : null
    const body = (
      <>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 ${
          doc ? "text-muted-foreground" : "text-muted-foreground/50"
        }`}>
          {doc ? <FolderOpen className="h-4 w-4" /> : <FileQuestion className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight">
            {doc?.name ?? label}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {doc
              ? [doc.category, `${doc.versions} ${doc.versions === 1 ? "revision" : "revisions"}`,
                 doc.latestRevision && `rev ${doc.latestRevision}`].filter(Boolean).join(" · ")
              : "Nothing attached yet"}
          </span>
        </span>
        {!!doc?.sheets && (
          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Layers className="h-3.5 w-3.5" />
            {doc.sheets} {doc.sheets === 1 ? "plan" : "plans"}
          </span>
        )}
        {status && <Badge variant="outline" className={status.className}>{status.label}</Badge>}
        {!doc && <Badge variant="outline" className="text-muted-foreground">Missing</Badge>}
      </>
    )

    return doc ? (
      <Link
        key={key}
        href={`/atlas/${jobsiteId}/documents/${doc.id}`}
        className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
      >
        {body}
      </Link>
    ) : (
      <div
        key={key}
        className="flex items-center gap-3 rounded-lg border border-dashed border-border/40 p-3"
      >
        {body}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <NewDocumentDialog
            jobsiteId={jobsiteId}
            client={client}
            kind={kind}
            usedCategoryIds={new Set(slots.map(d => d.categoryId).filter((n): n is number => !!n))}
          />
        </div>
      )}

      {slots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
          <p className="text-sm font-medium">No folders yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Set the categories in Manage Categories and Subcategories, or add a folder anyway.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {slots.map(d => row(d.id, d.versions > 0 ? d : undefined, d.name))}
        </div>
      )}
    </div>
  )
}

export default function JobsiteRoomPage() {
  const { jobsiteId } = useParams<{ jobsiteId: string }>()
  const params = useSearchParams()
  const { data: jobsite, isLoading, isError } = useAtlasJobsite(jobsiteId)

  const canManage = jobsite?.level === "manage"
  const canAnnotate = canManage || jobsite?.level === "annotate"
  // A seção vem da URL porque quem navega é a sidebar. Um link com a seção
  // dentro também é um link que se manda para alguém.
  const tab = params.get("tab") ?? "documents"

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  if (isError || !jobsite) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <p className="text-sm text-muted-foreground">Jobsite not found, or no access.</p>
        <Button variant="outline" render={<Link href="/atlas" />}>Back to jobsites</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{jobsite.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {jobsite.address && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {jobsite.address}
              </span>
            )}
            {jobsite.client && <span>{jobsite.client}</span>}
            <span>{TAB_TITLE[tab] ?? "Documents"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {jobsite.status === "archived" && <Badge variant="outline">Archived</Badge>}
          {canManage && <JobsiteSettingsDialog jobsite={jobsite} />}
        </div>
      </div>

      {tab === "documents" && (
        <DocumentsPanel jobsiteId={jobsiteId} client={jobsite.client} kind={jobsite.kind} canManage={!!canManage} />
      )}
      {tab === "diary" && <DailyLogPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />}
      {tab === "tasks" && <EventsPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />}
      {tab === "photos" && <PhotosPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />}
      {tab === "access" && canManage && <JobsiteAccessPanel jobsiteId={jobsiteId} />}
    </div>
  )
}
