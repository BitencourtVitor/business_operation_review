"use client"

import { useAuth } from "@/hooks/use-auth"
import Link from "next/link"
import { Bell, ChevronRight, Loader2, ShieldAlert, Users } from "lucide-react"

const options = [
  {
    href:        "/settings/users",
    icon:        Users,
    title:       "Manage Users",
    description: "Create, edit and delete user accounts. Control roles and screen permissions for each user.",
  },
  {
    href:        "/settings/notifications",
    icon:        Bell,
    title:       "Notifications",
    description: "Send or schedule system notifications. Edit and delete pending scheduled notifications.",
  },
]

export default function SettingsPage() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (user && !["admin", "dev", "owner"].includes(user.role)) {
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

  return (
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
          return (
            <Link
              key={opt.href}
              href={opt.href}
              className={`group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/70 ${i < options.length - 1 ? "border-b border-border/30" : ""}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-transparent text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary">
                <Icon className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{opt.title}</p>
                <p className="text-xs text-muted-foreground">{opt.description}</p>
              </div>

              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
