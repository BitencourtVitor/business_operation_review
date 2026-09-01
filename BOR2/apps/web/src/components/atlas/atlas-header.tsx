"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/hooks/use-auth"
import { useProducts } from "@/lib/products"
import { ArrowLeftRight, LayoutDashboard, LogOut, Moon, Sun, User } from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { useRouter } from "next/navigation"

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A casca do Atlas é dele: nada de sidebar do BOR.
 *
 * O leitor de planta em tablet compete por espaço com qualquer cromo de
 * navegação (AT-5), então o cabeçalho é uma faixa só — identidade à esquerda,
 * contexto no meio, e à direita os mesmos botões-ícone do header do BOR, para
 * os dois produtos não parecerem sistemas diferentes.
 */
export function AtlasHeader({ children }: { children?: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { hasBOR } = useProducts()
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-4">
      <Link href="/atlas" className="flex shrink-0 items-center gap-2">
        <span className="text-base font-semibold tracking-tight">Atlas</span>
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>

      {/* Salto para o outro braço da plataforma, sem passar de novo pelo login:
          a sessão é da plataforma e os produtos são destinos dela (AT-2). */}
      {hasBOR && (
        <Tip label="Go to BOR">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/monthly-execution")}
            className="hidden md:inline-flex"
          >
            <LayoutDashboard className="h-4 w-4" />
          </Button>
        </Tip>
      )}

      <Tip label={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="hidden md:inline-flex"
        >
          {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </Tip>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
          <User className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* O label é parte de um grupo no Base UI; solto, o menu quebra em runtime. */}
          {user && <DropdownMenuGroup><DropdownMenuLabel>{user.name}</DropdownMenuLabel></DropdownMenuGroup>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/select")}>
            <ArrowLeftRight className="h-4 w-4" />
            Switch product
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
