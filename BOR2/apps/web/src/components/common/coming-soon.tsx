"use client"

import { usePermission } from "@/hooks/use-permission"
import { Clock } from "lucide-react"

/**
 * Portão de página ainda não liberada.
 *
 * Diferente das demais telas, aqui a permissão não decide nada: enquanto a
 * página estiver em preparação, só o desenvolvedor entra — nem owner, nem
 * manager. Quem não é dev vê o aviso de "em breve", e não uma tela vazia que
 * parece defeito.
 *
 * A navegação já esconde o acesso; este componente existe porque URL digitada à
 * mão não passa pela navegação.
 */
export function ComingSoonGate({
  title,
  description,
  icon,
  children,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  const { isDev } = usePermission()

  if (isDev) return <>{children}</>

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>

      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border">
        <div className="text-center">
          {icon ?? <Clock className="mx-auto h-10 w-10 text-muted-foreground/20" />}
          <p className="mt-3 text-sm font-medium text-muted-foreground">Coming soon</p>
          <p className="mt-1 text-xs text-muted-foreground/50">
            This page is still being built and isn&apos;t available yet.
          </p>
        </div>
      </div>
    </div>
  )
}
