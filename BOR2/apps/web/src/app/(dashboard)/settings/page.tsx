"use client"

import { useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import Link from "next/link"
import { Bell, ChevronRight, KeyRound, Loader2, Network, ShieldAlert, ShieldCheck, Users } from "lucide-react"
import { PasswordResetModal } from "@/components/auth/password-reset-modal"
import { PermissionsModal } from "./permissions-modal"
import { TeamsModal } from "./teams-modal"

export default function SettingsPage() {
  const { user, isLoading } = useAuth()
  const [resetOpen, setResetOpen]   = useState(false)
  const [permsOpen, setPermsOpen]   = useState(false)
  const [teamsOpen, setTeamsOpen]   = useState(false)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (user && !["dev", "owner", "manager"].includes(user.role)) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive/60" />
          <p className="font-medium">Access Denied</p>
          <p className="text-sm text-muted-foreground">Only administrators can access Settings.</p>
        </div>
      </div>
    )
  }

  const options = [
    {
      icon:        Users,
      title:       "Manage Users",
      description: "Create, edit and delete user accounts. Control roles for each user.",
      href:        "/settings/users",
    },
    {
      icon:        ShieldCheck,
      title:       "Edit Permissions",
      description: "Define what each user can view or edit across every section of the system.",
      onClick:     () => setPermsOpen(true),
    },
    {
      icon:        Network,
      title:       "Teams",
      description: "Manage QB Time team assignments per employee, with manual override when QB Time is wrong.",
      onClick:     () => setTeamsOpen(true),
    },
    {
      icon:        Bell,
      title:       "Notifications",
      description: "Send or schedule system notifications. Edit and delete pending scheduled notifications.",
      href:        "/settings/notifications",
    },
    {
      icon:        KeyRound,
      title:       "Reset My Password",
      description: "Change your current password to a new secure one.",
      onClick:     () => setResetOpen(true),
    },
  ] as const

  return (
    <>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage system configuration, users and communications
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{opt.title}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
              </>
            )

            const cls = `group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/70 ${!isLast ? "border-b border-border/30" : ""}`

            if ("href" in opt) {
              return <Link key={opt.title} href={opt.href} className={cls}>{inner}</Link>
            }
            return (
              <button key={opt.title} type="button" onClick={opt.onClick} className={`${cls} w-full text-left`}>
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
      <PermissionsModal
        open={permsOpen}
        onClose={() => setPermsOpen(false)}
      />
      <TeamsModal
        open={teamsOpen}
        onClose={() => setTeamsOpen(false)}
      />
    </>
  )
}
