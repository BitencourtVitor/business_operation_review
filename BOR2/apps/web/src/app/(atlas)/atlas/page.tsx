"use client"

import { AtlasHeader } from "@/components/atlas/atlas-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAtlasJobsites, useCreateAtlasJobsite } from "@/hooks/use-atlas"
import { FileText, MapPin, MessageSquareWarning, Plus, Search } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

function NewJobsiteDialog() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", address: "", client: "", code: "" })
  const create = useCreateAtlasJobsite()

  function submit() {
    if (!form.name.trim()) return
    create.mutate(form, {
      onSuccess: () => { setOpen(false); setForm({ name: "", address: "", client: "", code: "" }) },
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="h-4 w-4" />
        New jobsite
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New jobsite</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          {([
            ["name", "Name"], ["address", "Address"], ["client", "Client"], ["code", "Code"],
          ] as const).map(([field, label]) => (
            <div key={field} className="flex flex-col gap-1.5">
              <Label htmlFor={`jobsite-${field}`}>{label}</Label>
              <Input
                id={`jobsite-${field}`}
                value={form[field]}
                onChange={e => setForm({ ...form, [field]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AtlasJobsitesPage() {
  const { data: jobsites, isLoading } = useAtlasJobsites()
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = jobsites ?? []
    if (!q) return rows
    return rows.filter(j =>
      [j.name, j.address, j.client, j.code].some(v => v.toLowerCase().includes(q)))
  }, [jobsites, query])

  return (
    <>
      <AtlasHeader>
        <div className="relative ml-2 hidden max-w-xs flex-1 md:block">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search jobsites"
            className="h-8 pl-8"
          />
        </div>
      </AtlasHeader>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">Jobsites</h1>
              <p className="text-sm text-muted-foreground">
                Every jobsite is a room: documents, drawings and diary in one place.
              </p>
            </div>
            <NewJobsiteDialog />
          </div>

          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
              <p className="text-sm font-medium">No jobsites here</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {jobsites?.length
                  ? "Nothing matches this search."
                  : "Create the first jobsite to start uploading documents."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(j => (
                <Link
                  key={j.id}
                  href={`/atlas/${j.id}`}
                  className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold leading-tight">{j.name}</span>
                    {j.status === "archived" && <Badge variant="outline">Archived</Badge>}
                  </div>
                  {j.address && (
                    <span className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      {j.address}
                    </span>
                  )}
                  <div className="mt-auto flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      {j.documents}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquareWarning className="h-3.5 w-3.5" />
                      {j.openEvents}
                    </span>
                    {j.client && <span className="ml-auto truncate">{j.client}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
