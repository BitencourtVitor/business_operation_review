"use client"

import { useState } from "react"
import { Building2, Hash, Home, Loader2, MapPin } from "lucide-react"
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
            Stage dates and permit are set afterwards, in Project settings.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Onde o lote vai nascer: cliente primeiro, depois o jobsite. */}
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
            <InfoRow icon={<Building2 className="h-3.5 w-3.5" />} label="Client" value={client || "No client"} />
            <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Jobsite" value={jobsite} />
          </div>

          {/* Tipo primeiro, depois o número. Os dois só com a largura que pedem. */}
          <div className="flex gap-3">
            <div className="flex w-[130px] flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={v => v && setType(v)}>
                <SelectTrigger className="h-8 w-full">
                  <span className="flex items-center gap-2 text-sm">
                    <Home className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {type}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-[120px] flex-col gap-1.5">
              <Label htmlFor="lot-number">Lot</Label>
              <div className="relative">
                <Hash className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input id="lot-number" className="pl-8" value={lot} onChange={e => setLot(e.target.value)} placeholder="12" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lot-address">Address</Label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input id="lot-address" className="pl-8" value={address} onChange={e => setAddress(e.target.value)} placeholder="21 Broadleaf, Plymouth, MA 02360" />
            </div>
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

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  )
}
