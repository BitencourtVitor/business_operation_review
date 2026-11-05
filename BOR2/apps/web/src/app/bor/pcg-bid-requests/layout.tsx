"use client"

import { useEffect, useState } from "react"
import { Loader2, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePermission } from "@/hooks/use-permission"
import { PCG_BID_REQUESTS_PERM } from "./_lib/use-can-edit"
import { loadCatalog } from "./_lib/catalog-store"

// A tela saiu de "em construção": quem entra é quem tem a permissão
// PCG Bids and Contracts, concedida em Settings. Este guarda é o que barra o
// acesso por URL direta em qualquer sub-rota — a barra lateral já esconde o
// item para quem não pode ver, mas esconder não é bloquear.
export default function PCGBidRequestsLayout({ children }: { children: React.ReactNode }) {
  const { canView, isLoading } = usePermission()
  // O catálogo vem do Railway (PCG-3): nada abre antes dele, senão uma edição cairia sobre o seed.
  const [catalog, setCatalog] = useState<"loading" | "ready" | "error">("loading")
  const load = () => { setCatalog("loading"); loadCatalog().then(() => setCatalog("ready"), () => setCatalog("error")) }
  useEffect(load, [])

  if (isLoading || (catalog === "loading" && canView(PCG_BID_REQUESTS_PERM))) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!canView(PCG_BID_REQUESTS_PERM)) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive/60" />
          <p className="font-medium">Access Denied</p>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have access to PCG Bids and Contracts.
          </p>
        </div>
      </div>
    )
  }

  if (catalog === "error") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-medium">Could not load the trade catalog</p>
          <Button variant="outline" size="sm" onClick={load}>Try again</Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
