"use client"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationBell } from "@/components/layout/notification-bell"
import { useSidebar } from "@/components/ui/sidebar"
import { useAuth } from "@/hooks/use-auth"
import { useNotifications } from "@/hooks/use-notifications"
import { useFinancialStore } from "@/store/financial.store"
import { permitService } from "@/services/permit.service"
import { periodReportService } from "@/services/qbtime-period-report.service"
import { useQueryClient } from "@tanstack/react-query"
import { usePathname } from "next/navigation"
import {
  Award,
  Bell,
  Compass,
  Ellipsis,
  Eye,
  EyeOff,
  Gem,
  LogOut,
  Menu,
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
  const { toggleSidebar } = useSidebar()
  const { user, logout } = useAuth()
  const { data: notifications = [] } = useNotifications()
  const { showFinancialData, toggleFinancialData } = useFinancialStore()
  const { resolvedTheme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const pathname    = usePathname()
  const [refreshing, setRefreshing] = useState(false)
  const [notifOpen,  setNotifOpen]  = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      if (pathname === "/permits") {
        await permitService.syncFromSheet()
      }
      if (pathname === "/qbtime/period-reports") {
        await periodReportService.sync(14)
      }
      await queryClient.invalidateQueries()
    } finally {
      setTimeout(() => setRefreshing(false), 600)
    }
  }

  const role       = user?.role ?? "viewer"
  const badge      = roleBadges[role] ?? roleBadges.viewer
  const BadgeIcon  = badge.icon
  const badgeStyle = resolvedTheme === "dark" ? badge.dark : badge.light

  const userID = user?.id ?? ""
  const unread = notifications.filter(n => !n.viewedBy.includes(userID)).length

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">

      {/* Mobile: hamburger + mini logo + title */}
      <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="-ml-2 shrink-0">
          <Menu className="h-5 w-5" />
        </Button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/minilogo_black.png" alt="Premium" className="h-6 w-6 shrink-0 object-contain dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/minilogo_white.png" alt="Premium" className="hidden h-6 w-6 shrink-0 object-contain dark:block" />
        <span className="min-w-0 truncate text-sm font-medium tracking-tight text-primary">Business Operations Review</span>
      </div>

      {/* Desktop: title + subtitle */}
      <div className="hidden flex-1 flex-col justify-center md:flex">
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
            <span className={`hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide md:inline-flex ${badgeStyle}`}>
              <BadgeIcon className="h-3 w-3" />
              {badge.label}
            </span>
          )}

          <div className="mx-1.5 w-px self-stretch bg-border" />

          {/* Desktop-only individual buttons */}
          <Tip label="Refresh data">
            <Button variant="ghost" size="icon" onClick={handleRefresh} className="hidden md:inline-flex">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </Tip>

          {/* Single NotificationBell — trigger hidden on mobile, Dialog opened via notifOpen */}
          <NotificationBell
            open={notifOpen}
            onOpenChange={setNotifOpen}
            triggerClassName="hidden md:inline-flex"
          />

          <Tip label={showFinancialData ? "Hide financial data" : "Show financial data"}>
            <Button variant="ghost" size="icon" onClick={toggleFinancialData} className="hidden md:inline-flex">
              {showFinancialData ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </Tip>

          <Tip label={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}>
            <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className="hidden md:inline-flex">
              {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
          </Tip>

          <Tip label="Sign out">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout()}
              className="hidden text-destructive hover:bg-destructive/10 hover:text-destructive md:inline-flex"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </Tip>

          {/* Mobile: single dropdown with all 5 actions */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="md:hidden" />}
            >
              <Ellipsis className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-52">
              {user && <DropdownMenuGroup><DropdownMenuLabel>{user.name}</DropdownMenuLabel></DropdownMenuGroup>}
              <DropdownMenuItem onClick={handleRefresh}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh data
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setNotifOpen(true)}>
                <div className="relative">
                  <Bell className="h-4 w-4" />
                  {unread > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </div>
                Notifications
                {unread > 0 && (
                  <span className="ml-auto text-xs font-semibold text-destructive">{unread}</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleFinancialData}>
                {showFinancialData ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {showFinancialData ? "Hide financial data" : "Show financial data"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
                {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => logout()}>
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>

    </header>
  )
}
