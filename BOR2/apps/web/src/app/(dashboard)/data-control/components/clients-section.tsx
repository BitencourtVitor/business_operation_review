"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  useClients,
  useJobSites,
  useAddClient,
  useUpdateClient,
  useDeleteClient,
  useAddJobSite,
  useUpdateJobSite,
  useDeleteJobSite,
} from "@/hooks/use-clients"
import type { ClientItem, JobSiteItem } from "@/services/clients.service"
import { Check, ChevronDown, Pencil, Plus, Search, Trash2, UserCircle, X } from "lucide-react"
import { useMemo, useState } from "react"

// ─── JobSiteRowItem ────────────────────────────────────────────────────────────

function JobSiteRowItem({
  site,
  onSaved,
  onDeleted,
}: {
  site: JobSiteItem
  onSaved: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(site.name)
  const updateMutation = useUpdateJobSite()
  const deleteMutation = useDeleteJobSite()

  function handleSave() {
    if (!name.trim()) return
    updateMutation.mutate(
      { id: site.id, name: name.trim() },
      { onSuccess: () => { setEditing(false); onSaved() } },
    )
  }

  function handleCancel() {
    setName(site.name)
    setEditing(false)
  }

  if (editing) {
    return (
      <TableRow className="bg-accent/30">
        <TableCell>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            className="h-7 text-sm"
            onKeyDown={e => {
              if (e.key === "Enter") handleSave()
              if (e.key === "Escape") handleCancel()
            }}
            autoFocus
          />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-green-500 hover:text-green-400"
              onClick={handleSave} disabled={updateMutation.isPending}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow className="group">
      <TableCell className="text-sm">{site.name}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => deleteMutation.mutate(site.id, { onSuccess: onDeleted })}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

// ─── ClientBlock ───────────────────────────────────────────────────────────────

function ClientBlock({
  client,
  jobSites,
  onMutated,
  initialAdding = false,
  onCancelledEmpty,
}: {
  client: ClientItem
  jobSites: JobSiteItem[]
  onMutated: () => void
  initialAdding?: boolean
  onCancelledEmpty?: () => void
}) {
  const [collapsed, setCollapsed]       = useState(true)
  const [editingName, setEditingName]   = useState(false)
  const [clientName, setClientName]     = useState(client.name)
  const [adding, setAdding]             = useState(initialAdding)
  const [newSiteName, setNewSiteName]   = useState("")
  const addClient    = useAddClient()
  const updateClient = useUpdateClient()
  const deleteClient = useDeleteClient()
  const addJobSite   = useAddJobSite()

  function handleSaveClient() {
    if (!clientName.trim()) return
    updateClient.mutate(
      { id: client.id, name: clientName.trim() },
      { onSuccess: () => { setEditingName(false); onMutated() } },
    )
  }

  function handleAddSite() {
    if (!newSiteName.trim()) return
    // If this is a pending (not-yet-saved) client, create it first then add the job site
    if (client.id === -1) {
      addClient.mutate(client.name, {
        onSuccess: res => {
          addJobSite.mutate(
            { clientId: res.id, name: newSiteName.trim() },
            { onSuccess: () => { setNewSiteName(""); setAdding(false); onMutated() } },
          )
        },
      })
      return
    }
    addJobSite.mutate(
      { clientId: client.id, name: newSiteName.trim() },
      { onSuccess: () => { setNewSiteName(""); setAdding(false); onMutated() } },
    )
  }

  function handleCancelAdd() {
    setAdding(false)
    if (jobSites.length === 0) onCancelledEmpty?.()
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Client header */}
      <div className="flex h-10 items-center justify-between gap-2 bg-muted/40 px-4">
        {editingName ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              className="h-7 text-sm"
              onKeyDown={e => {
                if (e.key === "Enter") handleSaveClient()
                if (e.key === "Escape") { setClientName(client.name); setEditingName(false) }
              }}
              autoFocus
            />
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-green-500 hover:text-green-400 shrink-0"
              onClick={handleSaveClient} disabled={updateClient.isPending}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 shrink-0"
              onClick={() => { setClientName(client.name); setEditingName(false) }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <>
            <button
              className="flex items-center gap-2 text-sm font-semibold text-foreground"
              onClick={() => setCollapsed(c => !c)}
            >
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${collapsed ? "-rotate-90" : ""}`} />
              {client.name}
              <span className="text-xs font-normal text-muted-foreground">{jobSites.length}</span>
            </button>
            <div className="flex items-center gap-1">
              {!collapsed && (
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAdding(a => !a)}>
                  <Plus className="h-3.5 w-3.5" />Add site
                </Button>
              )}
              {client.id !== -1 && (
                <>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => { setEditingName(true); setCollapsed(false) }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteClient.mutate(client.id, { onSuccess: onMutated })}
                    disabled={deleteClient.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {!collapsed && (
        <table className="w-full caption-bottom text-sm">
          <TableHeader className="sr-only">
            <TableRow>
              <TableHead>Job Site</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobSites.map(site => (
              <JobSiteRowItem key={site.id} site={site} onSaved={onMutated} onDeleted={onMutated} />
            ))}
            {adding && (
              <TableRow className="bg-accent/20">
                <TableCell>
                  <Input
                    placeholder="Job site name"
                    value={newSiteName}
                    onChange={e => setNewSiteName(e.target.value)}
                    className="h-7 text-sm"
                    onKeyDown={e => {
                      if (e.key === "Enter") handleAddSite()
                      if (e.key === "Escape") handleCancelAdd()
                    }}
                    autoFocus
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-green-500 hover:text-green-400"
                      onClick={handleAddSite}
                      disabled={addJobSite.isPending || !newSiteName.trim()}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancelAdd}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {jobSites.length === 0 && !adding && (
              <TableRow>
                <TableCell colSpan={2} className="py-4 text-center text-xs text-muted-foreground">
                  No job sites yet —{" "}
                  <button className="underline hover:text-foreground" onClick={() => setAdding(true)}>
                    add one
                  </button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </table>
      )}
    </div>
  )
}

// ─── ClientsSection ────────────────────────────────────────────────────────────

export function ClientsSection() {
  const { data: clients = [], isLoading: loadingClients } = useClients()
  const { data: jobSites = [], isLoading: loadingJobSites } = useJobSites()
  const [search, setSearch]               = useState("")
  const [addOpen, setAddOpen]             = useState(false)
  const [newClientName, setNewClientName] = useState("")
  const [pendingClient, setPendingClient] = useState<string | null>(null)

  const isLoading = loadingClients || loadingJobSites

  const filtered = useMemo(() => {
    if (!search.trim()) return clients
    const q = search.toLowerCase()
    return clients.filter(c => {
      if (c.name.toLowerCase().includes(q)) return true
      return jobSites.some(js => js.client_id === c.id && js.name.toLowerCase().includes(q))
    })
  }, [clients, jobSites, search])

  const clientAlreadyExists =
    !!newClientName.trim() &&
    clients.some(c => c.name.toLowerCase() === newClientName.trim().toLowerCase())

  function handleAddClient() {
    const name = newClientName.trim()
    if (!name || clientAlreadyExists) return
    setAddOpen(false)
    setNewClientName("")
    setPendingClient(name)
  }

  function handlePendingCreated() {
    setPendingClient(null)
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            {clients.length} {clients.length === 1 ? "client" : "clients"} · {jobSites.length}{" "}
            job {jobSites.length === 1 ? "site" : "sites"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`h-8 pl-8 text-sm w-52 ${search ? "pr-7" : ""}`}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Add Client
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading...</p>
        ) : filtered.length === 0 && !pendingClient ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {search ? "No results found" : "No clients yet"}
          </p>
        ) : (
          <div className="space-y-3">
            {filtered.map(client => (
              <ClientBlock
                key={client.id}
                client={client}
                jobSites={jobSites.filter(js => js.client_id === client.id)}
                onMutated={() => {}}
              />
            ))}
            {pendingClient && !clients.some(c => c.name.toLowerCase() === pendingClient.toLowerCase()) && (
              <ClientBlock
                key={`pending-${pendingClient}`}
                client={{ id: -1, name: pendingClient }}
                jobSites={[]}
                onMutated={handlePendingCreated}
                initialAdding
                onCancelledEmpty={() => setPendingClient(null)}
              />
            )}
          </div>
        )}
      </div>

      {/* Add Client dialog */}
      <Dialog
        open={addOpen}
        onOpenChange={v => { setAddOpen(v); if (!v) setNewClientName("") }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="h-4 w-4" />
              New Client
            </DialogTitle>
            <DialogDescription>
              Add a client to the catalog. Job sites can be added after.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Client Name</label>
              <Input
                placeholder="e.g. Toll Brothers"
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddClient() }}
                autoFocus
              />
            </div>
            {clientAlreadyExists && (
              <p className="text-xs text-destructive">This client already exists.</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddClient}
                disabled={!newClientName.trim() || clientAlreadyExists}
              >
                <UserCircle className="h-3.5 w-3.5" />Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
