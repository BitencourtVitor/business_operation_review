"use client"

import Link from "next/link"
import { ArrowLeft, ChevronRight, Tag, Clock } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"

export default function BudgetManagePage() {
  const { user } = useAuth()
  const { data: myPerms } = useMyPermissions()
  const canManage =
    (!!user && ["dev", "owner", "admin"].includes(user.role)) ||
    myPerms?.permissions?.budget_control === "write"

  if (!canManage) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        You don&apos;t have permission to manage budget settings.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/budget-control"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="h-8 w-px bg-border" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Budget Control</h1>
          <p className="text-sm text-muted-foreground">Management settings</p>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-border/30 bg-muted/40">
        <Link
          href="/budget-control/manage/categories"
          className="group flex items-center gap-4 border-b border-border/30 px-4 py-3 transition-colors hover:bg-muted/70"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-transparent text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary">
            <Tag className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Category Assignment</p>
            <p className="text-xs text-muted-foreground">
              Define categories per project type and assign subcontractors (POs)
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </Link>

        <Link
          href="/budget-control/manage/labor-mapping"
          className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/70"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-transparent text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary">
            <Clock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Labor Mapping</p>
            <p className="text-xs text-muted-foreground">
              Bridge QB Time addresses to QuickBooks projects (initial setup)
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
        </Link>
      </div>
    </div>
  )
}
