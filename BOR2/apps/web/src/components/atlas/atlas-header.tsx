"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/hooks/use-auth"
import { useProducts } from "@/lib/products"
import { ArrowLeftRight, LayoutDashboard, LogOut, Moon, Sun, User } from "lucide-react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { useRouter } from "next/navigation"

/**
 * A casca do Atlas é dele: nada de sidebar do BOR.
 *
 * O leitor de planta em tablet compete por espaço com qualquer cromo de
 * navegação (AT-5), então o cabeçalho é uma faixa só — identidade à esquerda,
 * contexto no meio, salto de produto e conta à direita.
 */
export function AtlasHeader({ children }: { children?: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { hasBOR } = useProducts()
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
      <Link href="/atlas" className="flex shrink-0 items-center gap-2">
        <span className="text-base font-semibold tracking-tight">Atlas</span>
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>

      {/* O salto para o outro produto não passa de novo pelo login: a sessão é
          da plataforma, e os produtos são destinos dela (AT-2). */}
      {hasBOR && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/monthly-execution")}
          className="hidden gap-2 text-muted-foreground md:inline-flex"
        >
          <LayoutDashboard className="h-4 w-4" />
          BOR
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="hidden md:inline-flex"
      >
        {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" />}>
          <User className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {user && <DropdownMenuLabel>{user.name}</DropdownMenuLabel>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/select")}>
            <ArrowLeftRight className="h-4 w-4" />
            Trocar de produto
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {resolvedTheme === "dark" ? "Modo claro" : "Modo escuro"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
