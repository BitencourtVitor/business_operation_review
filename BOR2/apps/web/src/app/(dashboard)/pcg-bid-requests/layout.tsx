"use client"

import { Loader2, ShieldAlert } from "lucide-react"
import { usePermission } from "@/hooks/use-permission"
import { PCG_BID_REQUESTS_PERM } from "./_lib/use-can-edit"

// A tela saiu de "em construção": quem entra é quem tem a permissão
// PCG Bids and Contracts, concedida em Settings. Este guarda é o que barra o
// acesso por URL direta em qualquer sub-rota — a barra lateral já esconde o
// item para quem não pode ver, mas esconder não é bloquear.
export default function PCGBidRequestsLayout({ children }: { children: React.ReactNode }) {
  const { canView, isLoading } = usePermission()

  if (isLoading) {
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

  return <>{children}</>
}
