"use client"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { NotificationBell } from "@/components/layout/notification-bell"
import { useAuth } from "@/hooks/use-auth"
import { useFinancialStore } from "@/store/financial.store"
import { useQueryClient } from "@tanstack/react-query"
import {
  Award,
  Compass,
  Eye,
  EyeOff,
  Gem,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
  User,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useState } from "react"

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

const roleBadges: Record<string, { label: string; icon: React.ElementType; light: string; dark: string }> = {
  dev: {
    label: "Developer",
    icon: Gem,
    light: "border-yellow-500 bg-yellow-500/10 text-yellow-600",
    dark:  "border-yellow-400 bg-yellow-400/10 text-yellow-400",
  },
  admin: {
    label: "Admin",
    icon: Award,
    light: "border-primary bg-primary/10 text-primary",
    dark:  "border-primary bg-primary/10 text-primary",
  },
  manager: {
    label: "Manager",
    icon: Award,
    light: "border-primary bg-primary/10 text-primary",
    dark:  "border-primary bg-primary/10 text-primary",
  },
  gestor: {
    label: "Manager",
    icon: Award,
    light: "border-primary bg-primary/10 text-primary",
    dark:  "border-primary bg-primary/10 text-primary",
  },
  owner: {
    label: "Owner",
    icon: Compass,
    light: "border-emerald-600 bg-emerald-600/10 text-emerald-600",
    dark:  "border-emerald-400 bg-emerald-400/10 text-emerald-400",
  },
  user: {
    label: "User",
    icon: User,
    light: "border-border bg-secondary text-foreground",
    dark:  "border-border bg-secondary text-foreground",
  },
  viewer: {
    label: "Viewer",
    icon: User,
    light: "border-border bg-secondary text-foreground",
    dark:  "border-border bg-secondary text-foreground",
  },
}

export function Header() {
  const { user, logout } = useAuth()
  const { showFinancialData, toggleFinancialData } = useFinancialStore()
  const { resolvedTheme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    await queryClient.invalidateQueries()
    setTimeout(() => setRefreshing(false), 600)
  }

  const role       = user?.role ?? "viewer"
  const badge      = roleBadges[role] ?? roleBadges.viewer
  const BadgeIcon  = badge.icon
  const badgeStyle = resolvedTheme === "dark" ? badge.dark : badge.light

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">

      {/* Title */}
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-base font-medium tracking-tight text-primary">
          Business Operations Review
        </h1>
        <p className="text-[10px] text-muted-foreground">
          What matters isn&apos;t the company&apos;s mistakes, but how it responds to them.
        </p>
      </div>

      {/* Right controls */}
      <TooltipProvider>
        <div className="flex items-center gap-2">
          {user && (
            <span className="hidden text-sm text-muted-foreground lg:inline">
              {user.name}
            </span>
          )}

          {user && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${badgeStyle}`}>
              <BadgeIcon className="h-3 w-3" />
              {badge.label}
            </span>
          )}

          <div className="mx-1.5 w-px self-stretch bg-border" />

          <Tip label="Refresh data">
            <Button variant="ghost" size="icon" onClick={handleRefresh}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </Tip>

          {/* Notifications */}
          <NotificationBell />

          <Tip label={showFinancialData ? "Hide financial data" : "Show financial data"}>
            <Button variant="ghost" size="icon" onClick={toggleFinancialData}>
              {showFinancialData ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </Tip>

          <Tip label={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}>
            <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>
          </Tip>

          <Tip label="Sign out">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout()}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </Tip>
        </div>
      </TooltipProvider>

    </header>
  )
}
