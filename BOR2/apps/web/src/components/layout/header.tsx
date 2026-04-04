"use client"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/hooks/use-auth"
import { useFinancialStore } from "@/store/financial.store"
import {
  Award,
  Compass,
  Eye,
  EyeOff,
  Gem,
  LogOut,
  Moon,
  Sun,
  User,
} from "lucide-react"
import { useTheme } from "next-themes"

const roleBadges: Record<string, { label: string; icon: React.ElementType; light: string; dark: string }> = {
  dev: {
    label: "Developer",
    icon: Gem,
    light: "border-yellow-500 bg-yellow-500/10 text-yellow-600",
    dark: "border-yellow-400 bg-yellow-400/10 text-yellow-400",
  },
  admin: {
    label: "Admin",
    icon: Award,
    light: "border-primary bg-primary/10 text-primary",
    dark: "border-primary bg-primary/10 text-primary",
  },
  manager: {
    label: "Manager",
    icon: Award,
    light: "border-primary bg-primary/10 text-primary",
    dark: "border-primary bg-primary/10 text-primary",
  },
  gestor: {
    label: "Manager",
    icon: Award,
    light: "border-primary bg-primary/10 text-primary",
    dark: "border-primary bg-primary/10 text-primary",
  },
  owner: {
    label: "Owner",
    icon: Compass,
    light: "border-emerald-600 bg-emerald-600/10 text-emerald-600",
    dark: "border-emerald-400 bg-emerald-400/10 text-emerald-400",
  },
  user: {
    label: "User",
    icon: User,
    light: "border-border bg-secondary text-foreground",
    dark: "border-border bg-secondary text-foreground",
  },
  viewer: {
    label: "Viewer",
    icon: User,
    light: "border-border bg-secondary text-foreground",
    dark: "border-border bg-secondary text-foreground",
  },
}

export function Header() {
  const { user, logout } = useAuth()
  const { showFinancialData, toggleFinancialData } = useFinancialStore()
  const { resolvedTheme, setTheme } = useTheme()

  const role = user?.role ?? "viewer"
  const badge = roleBadges[role] ?? roleBadges.viewer
  const BadgeIcon = badge.icon
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

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleFinancialData}
          title={showFinancialData ? "Ocultar dados financeiros" : "Exibir dados financeiros"}
        >
          {showFinancialData ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title="Alternar tema"
        >
          {resolvedTheme === "dark" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => logout()}
          title="Sair"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
