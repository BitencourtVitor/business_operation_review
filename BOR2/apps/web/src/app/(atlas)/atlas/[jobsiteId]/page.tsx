"use client"

import { CalendarPanel } from "@/components/atlas/calendar-panel"
import { DailyLogPanel } from "@/components/atlas/daily-log-panel"
import { EventsPanel } from "@/components/atlas/events-panel"
import { JobsiteAccessPanel } from "@/components/atlas/jobsite-access-panel"
import { JobsiteSettingsDialog } from "@/components/atlas/jobsite-settings-dialog"
import { MediaPanel } from "@/components/atlas/media-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import {
  useAtlasDocumentCategories, useAtlasDocuments, useAtlasJobsite, useCreateAtlasDocument,
} from "@/hooks/use-atlas"

import { FolderOpen, Layers, MapPin, Plus } from "lucide-react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { useState } from "react"

const VERSION_STATUS: Record<string, { label: string; className: string }> = {
  pending:   { label: "Awaiting upload", className: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  uploaded:  { label: "In review",       className: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  published: { label: "Published",       className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
  failed:    { label: "Failed",          className: "border-destructive/40 text-destructive" },
}

const TAB_TITLE: Record<string, string> = {
  documents: "Documents",
  diary: "Diary",
  calendar: "Calendar",
  events: "Events",
  media: "Media",
  access: "Access",
}

function NewDocumentDialog({ jobsiteId, client }: { jobsiteId: string; client: string }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", category: "", discipline: "" })
  const create = useCreateAtlasDocument(jobsiteId)

  // As opções são as do cliente da obra, e só caem para a lista inteira quando
  // o cliente não tem catálogo próprio: o que a Pulte exige não é o que a Toll
  // Brothers exige.
  const { data: byClient } = useAtlasDocumentCategories(client)
  const { data: all } = useAtlasDocumentCategories()
  const options = (byClient?.length ? byClient : all) ?? []

  // Nomear a pasta é trabalho repetido quando ela é "House Plan" e o documento
  // é o House Plan. O nome acompanha a categoria até alguém digitar outro.
  const [nameTouched, setNameTouched] = useState(false)
  function pickCategory(category: string) {
    setForm(f => ({ ...f, category, name: nameTouched ? f.name : category }))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus className="h-4 w-4" />
        New folder
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New document folder</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-category">Category</Label>
            <NativeSelect
              id="doc-category"
              value={options.some(o => o.document === form.category) ? form.category : ""}
              onChange={e => pickCategory(e.target.value)}
            >
              <option value="">Not in the catalog</option>
              {options.map(o => (
                <option key={`${o.client}-${o.type}-${o.document}`} value={o.document}>
                  {o.type ? `${o.type} · ${o.document}` : o.document}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Same list the Forecast checks for Fieldwire{client ? ` — ${client}` : ""}.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-name">Folder name</Label>
            <Input
              id="doc-name"
              value={form.name}
              placeholder="Permit Set, House Plan…"
              onChange={e => { setNameTouched(true); setForm({ ...form, name: e.target.value }) }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-discipline">Discipline</Label>
            <Input id="doc-discipline" value={form.discipline}
              placeholder="Architectural, Structural, MEP…"
              onChange={e => setForm({ ...form, discipline: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!form.name.trim() || create.isPending}
            onClick={() => create.mutate(form, { onSuccess: () => setOpen(false) })}
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DocumentsPanel({ jobsiteId, client, canManage }: {
  jobsiteId: string; client: string; canManage: boolean
}) {
  const { data: documents, isLoading } = useAtlasDocuments(jobsiteId)
  const { data: catalog } = useAtlasDocumentCategories(client)

  // O que o Forecast cobra deste cliente e ainda não tem pasta nesta obra.
  // Aparece como lacuna, não como erro: a obra pode não precisar do documento,
  // mas quem olha a tela merece ver que ele não está aqui.
  const missing = (catalog ?? [])
    .map(c => c.document)
    .filter((doc, i, arr) => arr.indexOf(doc) === i)
    .filter(doc => !(documents ?? []).some(d => d.category === doc))

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <NewDocumentDialog jobsiteId={jobsiteId} client={client} />
        </div>
      )}

      {!documents?.length ? (
        <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
          <p className="text-sm font-medium">No document folders in this jobsite</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A folder holds one document and its revisions. Each page of the PDF becomes a
            plan inside it.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map(d => {
            const status = VERSION_STATUS[d.latestStatus]
            return (
              <Link
                key={d.id}
                href={`/atlas/${jobsiteId}/documents/${d.id}`}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/30"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
                  <FolderOpen className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{d.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[d.category, d.discipline,
                      `${d.versions} ${d.versions === 1 ? "revision" : "revisions"}`,
                      d.latestRevision && `rev ${d.latestRevision}`]
                      .filter(Boolean).join(" · ")}
                  </p>
                </div>
                {d.sheets > 0 && (
                  <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                    <Layers className="h-3.5 w-3.5" />
                    {d.sheets} {d.sheets === 1 ? "plan" : "plans"}
                  </span>
                )}
                {status && (
                  <Badge variant="outline" className={status.className}>{status.label}</Badge>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {missing.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Not here yet {client && `· ${client}`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing.map(doc => (
              <Badge key={doc} variant="outline" className="text-muted-foreground">{doc}</Badge>
            ))}
          </div>
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
        <Button variant="outline" size="sm" render={<Link href="/atlas" />}>Back to jobsites</Button>
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
        <DocumentsPanel jobsiteId={jobsiteId} client={jobsite.client} canManage={!!canManage} />
      )}
      {tab === "diary" && <DailyLogPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />}
      {tab === "calendar" && <CalendarPanel jobsiteId={jobsiteId} />}
      {tab === "events" && <EventsPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />}
      {tab === "media" && <MediaPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />}
      {tab === "access" && canManage && <JobsiteAccessPanel jobsiteId={jobsiteId} />}
    </div>
  )
}
