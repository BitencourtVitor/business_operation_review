"use client"

import { AuthGuard } from "@/components/auth/auth-guard"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { useProducts, type Product } from "@/lib/products"
import { ArrowRight, LayoutDashboard, LogOut, Map } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

const PRODUCT_ICON = {
  bor: LayoutDashboard,
  atlas: Map,
} as const

function ProductCard({ product, onPick }: { product: Product; onPick: (p: Product) => void }) {
  const Icon = PRODUCT_ICON[product.id]
  return (
    <button
      onClick={() => onPick(product)}
      className="group flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border/60 bg-card p-6 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-base font-semibold leading-tight">{product.name}</span>
        <span className="text-sm text-muted-foreground">{product.tagline}</span>
      </span>
      <span className="mt-auto flex items-center gap-1.5 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Entrar <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}

function SelectProduct() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { available, isLoading } = useProducts()

  // Quem só tem um destino não deveria escolher entre uma opção só (AT-2,
  // ponto 3): a tela existe para bifurcar, e sem bifurcação ela é um clique a
  // mais entre a pessoa e o trabalho.
  useEffect(() => {
    if (!isLoading && available.length === 1) {
      router.replace(available[0].href)
    }
  }, [isLoading, available, router])

  if (isLoading || available.length === 1) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-10 px-4 py-12">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={() => logout()} className="text-muted-foreground">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-col items-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo_black.png" alt="Premium Group" className="h-8 object-contain dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo_white.png" alt="Premium Group" className="hidden h-8 object-contain dark:block" />
        <div className="text-center">
          <h1 className="text-xl font-semibold">Onde você quer trabalhar?</h1>
          <p className="text-sm text-muted-foreground">
            {user?.name ? `${user.name} · ` : ""}escolha o destino
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-3xl flex-col items-center justify-center gap-4 sm:flex-row sm:items-stretch">
        {available.map(product => (
          <ProductCard key={product.id} product={product} onPick={p => router.push(p.href)} />
        ))}
      </div>

      {available.length === 0 && (
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Sua conta ainda não tem acesso liberado a nenhum produto. Peça a um administrador
          para conceder as permissões em Settings.
        </p>
      )}
    </main>
  )
}

export default function SelectProductPage() {
  return (
    <AuthGuard>
      <SelectProduct />
    </AuthGuard>
  )
}
