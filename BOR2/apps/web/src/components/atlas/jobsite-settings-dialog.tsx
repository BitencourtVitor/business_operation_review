"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { atlasService, type AtlasJobsite } from "@/services/atlas.service"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Settings } from "lucide-react"
import { useState } from "react"

/** Edição da obra: nome, endereço, cliente, código e arquivamento. */
export function JobsiteSettingsDialog({ jobsite }: { jobsite: AtlasJobsite }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: jobsite.name,
    address: jobsite.address,
    client: jobsite.client,
    code: jobsite.code,
  })

  const save = useMutation({
    mutationFn: (patch: Partial<AtlasJobsite>) => atlasService.updateJobsite(jobsite.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atlas", "jobsite", jobsite.id] })
      qc.invalidateQueries({ queryKey: ["atlas", "jobsites"] })
      setOpen(false)
    },
  })

  const archived = jobsite.status === "archived"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="shrink-0" />}>
        <Settings className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Project settings</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          {([
            ["name", "Name"], ["address", "Address"], ["client", "Client"], ["code", "Code"],
          ] as const).map(([field, label]) => (
            <div key={field} className="flex flex-col gap-1.5">
              <Label htmlFor={`edit-${field}`}>{label}</Label>
              <Input
                id={`edit-${field}`}
                value={form[field]}
                onChange={e => setForm({ ...form, [field]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <DialogFooter className="sm:justify-between">
          {/* Arquivar, nunca apagar: a obra carrega documentos assinados e a
              trilha de quem marcou o quê. */}
          <Button
            variant="outline"
            onClick={() => save.mutate({ status: archived ? "active" : "archived" })}
          >
            {archived ? "Reactivate" : "Archive"}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending || !form.name.trim()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
