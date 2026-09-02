"use client"

import { useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { usePermission } from "@/hooks/use-permission"
import Link from "next/link"
import { ChevronRight, KeyRound, Loader2, ShieldAlert, ShieldCheck, SlidersHorizontal, Users } from "lucide-react"
import { PasswordResetModal } from "@/components/auth/password-reset-modal"
import { AtlasPermissionsModal } from "./permissions-modal"

// A mesma tela de Settings do BOR, com as opções do Atlas: mesma hierarquia de
// cargo, mesmo bloqueio quando não sobra nada a que a pessoa tenha acesso,
// mesmo desenho de lista. Quem administra um produto não deveria reaprender o
// outro.
//
// Dev, Owner e Manager enxergam tudo — o mesmo grupo que o modal de permissões
// trata como acesso que não se revoga. Edit Permissions é só deles, e nunca vira
// permissão concedível.
const ALWAYS_ACCESS_ROLES = ["dev", "owner", "manager"]

export default function AtlasSettingsPage() {
  const { user, isLoading: authLoading } = useAuth()
  const { canView, isLoading: permsLoading } = usePermission()
  const [resetOpen, setResetOpen] = useState(false)
  const [permsOpen, setPermsOpen] = useState(false)

  if (authLoading || permsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasFullAccess = !!user && ALWAYS_ACCESS_ROLES.includes(user.role)
  const canManageUsers = hasFullAccess || canView("atlas_users")
  const canManageDefinitions = hasFullAccess || canView("atlas_definitions")

  // Trocar a própria senha sozinha não abre a tela: sem nada de administração,
  // não há Settings a que chegar.
  if (!hasFullAccess && !canManageUsers && !canManageDefinitions) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive/60" />
          <p className="font-medium">Access Denied</p>
          <p className="text-sm text-muted-foreground">You don&apos;t have access to any Settings page.</p>
        </div>
      </div>
    )
  }

  const options = [
    canManageUsers && {
      icon: Users,
      title: "Manage Users",
      description: "Create, edit and delete Atlas accounts. Access here never grants the BOR.",
      href: "/atlas/users",
    },
    hasFullAccess && {
      icon: ShieldCheck,
      title: "Edit Permissions",
      description: "Define what each user can view or edit across every page of the Atlas.",
      onClick: () => setPermsOpen(true),
    },
    canManageDefinitions && {
      icon: SlidersHorizontal,
      title: "Manage Categories and Subcategories",
      description: "The categories and subcategories a project is organised by, and what each build type carries.",
      href: "/atlas/definitions",
    },
    {
      icon: KeyRound,
      title: "Reset My Password",
      description: "Change your current password to a new secure one.",
      onClick: () => setResetOpen(true),
    },
  ].filter((o): o is Exclude<typeof o, false> => !!o)

  return (
    <>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage who works in the Atlas and what each jobsite is expected to carry
          </p>
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border border-border/30 bg-muted/40">
          {options.map((opt, i) => {
            const Icon = opt.icon
            const isLast = i === options.length - 1
            const inner = (
              <>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-transparent text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-medium">{opt.title}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
              </>
            )

            const cls = `group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/70 ${
              isLast ? "" : "border-b border-border/30"
            }`

            if (opt.href) {
              return <Link key={opt.title} href={opt.href} className={cls}>{inner}</Link>
            }
            return (
              <button key={opt.title} type="button" onClick={opt.onClick} className={`${cls} w-full`}>
                {inner}
              </button>
            )
          })}
        </div>
      </div>

      <PasswordResetModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onSuccess={() => setResetOpen(false)}
      />
      {hasFullAccess && (
        <AtlasPermissionsModal open={permsOpen} onClose={() => setPermsOpen(false)} />
      )}
    </>
  )
}
