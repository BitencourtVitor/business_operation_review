"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useCreateForecast } from "@/hooks/use-forecast"

// Obra nova da HVAC dentro de um jobsite. Pede só o que identifica o lote: as
// datas das etapas e o Permit entram depois, pelo Project settings.
//
// Nasce com todas as integrações desligadas, sempre. Obra nova nunca herda
// flag do lote vizinho.

const TYPES = ["Lot", "House", "Building"]

export function AddLotDialog({
  jobsite, client, open, onOpenChange,
}: {
  jobsite: string
  client: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [lot, setLot] = useState("")
  const [address, setAddress] = useState("")
  const [type, setType] = useState("Lot")
  const [obs, setObs] = useState("")
  const [error, setError] = useState("")
  const create = useCreateForecast()

  async function confirm() {
    setError("")
    if (!lot.trim()) return setError("Write the lot number.")
    // O endereço é o que liga a obra da HVAC à da Framing.
    if (!address.trim()) return setError("Write the address.")
    try {
      await create.mutateAsync({
        company: "hvac",
        name: lot.trim(),
        loteBld: lot.trim(),
        status: "planned",
        cliente: client,
        jobSite: jobsite,
        type,
        address: address.trim(),
        obs: obs.trim(),
        contractValue: 0,
        team: "",
        machineProvider: "",
        qbTime: false,
        hvac: false,
        buildertrend: false,
        storage: false,
        hasOrders: false,
      })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add lot</DialogTitle>
          <DialogDescription>
            {jobsite}{client ? ` · ${client}` : ""}. Stage dates and permit are set afterwards, in Project settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_140px] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lot-number">Lot</Label>
              <Input id="lot-number" value={lot} onChange={e => setLot(e.target.value)} placeholder="12" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={v => v && setType(v)}>
                <SelectTrigger className="h-8 w-full"><span className="text-sm">{type}</span></SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lot-address">Address</Label>
            <Input id="lot-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="21 Broadleaf, Plymouth, MA 02360" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lot-obs">Note <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="lot-obs" value={obs} onChange={e => setObs(e.target.value)} rows={2} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Add lot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
