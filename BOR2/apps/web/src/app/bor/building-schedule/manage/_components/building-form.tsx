"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function BuildingForm({ initial, onSave, onCancel }: {
  initial?:  { id: string; name: string; address: string }
  onSave:    (name: string, address: string) => Promise<void>
  onCancel:  () => void
}) {
  const [name,    setName]    = useState(initial?.name    ?? "")
  const [address, setAddress] = useState(initial?.address ?? "")
  const [saving,  setSaving]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try { await onSave(name.trim(), address.trim()) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Building name *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. 399 Neponset"
          className="w-full text-sm rounded-md border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">Address</label>
        <input
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="e.g. 399 Neponset Ave, Boston, MA"
          className="w-full text-sm rounded-md border border-border bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={!name.trim() || saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          {initial ? "Save Changes" : "Create Building"}
        </Button>
      </div>
    </form>
  )
}
