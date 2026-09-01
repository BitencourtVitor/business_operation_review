"use client"

import { AtlasHeader } from "@/components/atlas/atlas-header"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAtlasDocuments, useAtlasJobsite, useCreateAtlasDocument } from "@/hooks/use-atlas"
import type { AtlasDocument } from "@/services/atlas.service"
import { ArrowLeft, FileText, Layers, Plus } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"

const KINDS = [
  ["drawing", "Drawing"], ["spec", "Specification"], ["permit", "Permit"],
  ["submittal", "Submittal"], ["other", "Other"],
] as const

const VERSION_STATUS: Record<string, { label: string; className: string }> = {
  pending:   { label: "Awaiting upload", className: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  uploaded:  { label: "In review",       className: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  published: { label: "Published",       className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
  failed:    { label: "Failed",          className: "border-destructive/40 text-destructive" },
}

function NewDocumentDialog({ jobsiteId }: { jobsiteId: string }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<{ name: string; discipline: string; kind: AtlasDocument["kind"] }>(
    { name: "", discipline: "", kind: "drawing" })
  const create = useCreateAtlasDocument(jobsiteId)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="h-4 w-4" />
        New document
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New document</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-name">Name</Label>
            <Input id="doc-name" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-discipline">Discipline</Label>
            <Input id="doc-discipline" value={form.discipline}
              placeholder="Architectural, Structural, MEP…"
              onChange={e => setForm({ ...form, discipline: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-kind">Kind</Label>
            <NativeSelect id="doc-kind" value={form.kind}
              onChange={e => setForm({ ...form, kind: e.target.value as AtlasDocument["kind"] })}>
              {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </NativeSelect>
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

function DocumentsPanel({ jobsiteId, canManage }: { jobsiteId: string; canManage: boolean }) {
  const { data: documents, isLoading } = useAtlasDocuments(jobsiteId)

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
          <NewDocumentDialog jobsiteId={jobsiteId} />
        </div>
      )}

      {!documents?.length ? (
        <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
          <p className="text-sm font-medium">No documents in this jobsite</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A document holds the revisions of one set. The PDF comes in as a version of it.
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
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{d.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[d.discipline, `${d.versions} ${d.versions === 1 ? "version" : "versions"}`,
                      d.latestRevision && `rev ${d.latestRevision}`]
                      .filter(Boolean).join(" · ")}
                  </p>
                </div>
                {d.sheets > 0 && (
                  <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                    <Layers className="h-3.5 w-3.5" />
                    {d.sheets}
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
    </div>
  )
}

export default function JobsiteRoomPage() {
  const { jobsiteId } = useParams<{ jobsiteId: string }>()
  const { data: jobsite, isLoading, isError } = useAtlasJobsite(jobsiteId)
  const canManage = jobsite?.level === "manage"
  const canAnnotate = canManage || jobsite?.level === "annotate"

  if (isLoading) {
    return (
      <>
        <AtlasHeader />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      </>
    )
  }

  if (isError || !jobsite) {
    return (
      <>
        <AtlasHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">Jobsite not found, or no access.</p>
          <Button variant="outline" size="sm" onClick={() => history.back()}>Back</Button>
        </div>
      </>
    )
  }

  return (
    <>
      <AtlasHeader>
        <Link href="/atlas" className="ml-1 flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium leading-tight">{jobsite.name}</p>
          {jobsite.address && (
            <p className="truncate text-xs text-muted-foreground">{jobsite.address}</p>
          )}
        </div>
        {canManage && <JobsiteSettingsDialog jobsite={jobsite} />}
      </AtlasHeader>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          <Tabs defaultValue="documents">
            <TabsList>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="diary">Diary</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="events">
                Events
                {jobsite.openEvents > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    {jobsite.openEvents}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
              {canManage && <TabsTrigger value="access">Access</TabsTrigger>}
            </TabsList>

            <TabsContent value="documents" className="pt-4">
              <DocumentsPanel jobsiteId={jobsiteId} canManage={!!canManage} />
            </TabsContent>
            <TabsContent value="diary" className="pt-4">
              <DailyLogPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />
            </TabsContent>
            <TabsContent value="calendar" className="pt-4">
              <CalendarPanel jobsiteId={jobsiteId} />
            </TabsContent>
            <TabsContent value="events" className="pt-4">
              <EventsPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />
            </TabsContent>
            <TabsContent value="media" className="pt-4">
              <MediaPanel jobsiteId={jobsiteId} canWrite={!!canAnnotate} />
            </TabsContent>
            {canManage && (
              <TabsContent value="access" className="pt-4">
                <JobsiteAccessPanel jobsiteId={jobsiteId} />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </main>
    </>
  )
}
