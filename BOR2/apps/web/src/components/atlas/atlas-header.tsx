"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useSidebar } from "@/components/ui/sidebar"
import { useAuth } from "@/hooks/use-auth"
import { useProducts } from "@/lib/products"
import { useQueryClient } from "@tanstack/react-query"
import {
  Award, CircleGauge, Compass, Ellipsis, CodeXml, LogOut, Menu, Moon,
  RefreshCw, Sun, User,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useState } from "react"

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

const roleBadges: Record<string, { label: string; icon: React.ElementType; light: string; dark: string }> = {
  dev:     { label: "Developer", icon: CodeXml,     light: "border-yellow-500 bg-yellow-500/10 text-yellow-600", dark: "border-yellow-400 bg-yellow-400/10 text-yellow-400" },
  admin:   { label: "Admin",     icon: Award,   light: "border-primary bg-primary/10 text-primary",          dark: "border-primary bg-primary/10 text-primary" },
  manager: { label: "Manager",   icon: Award,   light: "border-primary bg-primary/10 text-primary",          dark: "border-primary bg-primary/10 text-primary" },
  owner:   { label: "Owner",     icon: Compass, light: "border-emerald-600 bg-emerald-600/10 text-emerald-600", dark: "border-emerald-400 bg-emerald-400/10 text-emerald-400" },
  user:    { label: "User",      icon: User,    light: "border-border bg-secondary text-foreground",         dark: "border-border bg-secondary text-foreground" },
  viewer:  { label: "Viewer",    icon: User,    light: "border-border bg-secondary text-foreground",         dark: "border-border bg-secondary text-foreground" },
}

/**
 * O cabeçalho do Atlas é o do BOR: mesma altura, mesma divisão, mesmos
 * controles à direita. São produtos diferentes, mas da mesma casa — trocar de
 * braço não deveria parecer trocar de sistema.
 */
export function AtlasHeader() {
  const { toggleSidebar } = useSidebar()
  const { user, logout } = useAuth()
  const { hasBOR } = useProducts()
  const { resolvedTheme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries()
    } finally {
      setTimeout(() => setRefreshing(false), 600)
    }
  }

  const role = user?.role ?? "viewer"
  const badge = roleBadges[role] ?? roleBadges.viewer
  const BadgeIcon = badge.icon
  const badgeStyle = resolvedTheme === "dark" ? badge.dark : badge.light

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">

      {/* Mobile: hambúrguer + mini logo + título */}
      <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="-ml-2 shrink-0">
          <Menu className="h-5 w-5" />
        </Button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/minilogo_black.png" alt="Premium" className="h-6 w-6 shrink-0 object-contain dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/minilogo_white.png" alt="Premium" className="hidden h-6 w-6 shrink-0 object-contain dark:block" />
        <span className="min-w-0 truncate text-sm font-medium tracking-tight text-primary">Atlas Project Control</span>
      </div>

      {/* Desktop: título + frase */}
      <div className="hidden flex-1 flex-col justify-center md:flex">
        <h1 className="text-base font-medium tracking-tight text-primary">Atlas Project Control</h1>
        <p className="text-[10px] text-muted-foreground">
          Unless commitment is made, there are only promises and hopes, but no plans.
        </p>
      </div>

      <TooltipProvider>
        <div className="flex items-center gap-2">
          {user && (
            <span className="hidden text-sm text-muted-foreground lg:inline">{user.name}</span>
          )}

          {user && (
            <span className={`hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide md:inline-flex ${badgeStyle}`}>
              <BadgeIcon className="h-3 w-3" />
              {badge.label}
            </span>
          )}

          <div className="mx-1.5 w-px self-stretch bg-border" />

          <Tip label="Refresh data">
            <Button variant="ghost" size="icon" onClick={handleRefresh} className="hidden md:inline-flex">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </Tip>

          {/* Salto para o outro braço da plataforma, sem passar de novo pelo
              login: a sessão é da plataforma e os produtos são destinos dela. */}
          {hasBOR && (
            <Tip label="Go to BOR">
              <Button
                variant="ghost" size="icon"
                onClick={() => router.push("/monthly-execution")}
                className="hidden md:inline-flex"
              >
                <CircleGauge className="h-4 w-4" />
              </Button>
            </Tip>
          )}

          <Tip label={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}>
            <Button
              variant="ghost" size="icon"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              className="hidden md:inline-flex"
            >
              {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </Button>
          </Tip>

          <Tip label="Sign out">
            <Button
              variant="ghost" size="icon" onClick={() => logout()}
              className="hidden text-destructive hover:bg-destructive/10 hover:text-destructive md:inline-flex"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </Tip>

          {/* Mobile: as mesmas ações num menu só */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="md:hidden" />}>
              <Ellipsis className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-52">
              {user && <DropdownMenuGroup><DropdownMenuLabel>{user.name}</DropdownMenuLabel></DropdownMenuGroup>}
              <DropdownMenuItem onClick={handleRefresh}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh data
              </DropdownMenuItem>
              {hasBOR && (
                <DropdownMenuItem onClick={() => router.push("/monthly-execution")}>
                  <CircleGauge className="h-4 w-4" />
                  Go to BOR
                </DropdownMenuItem>
              )}
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
