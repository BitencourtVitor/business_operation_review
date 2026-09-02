"use client"

import { AuthGuard } from "@/components/auth/auth-guard"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import { useProducts, type Product } from "@/lib/products"
import {
  Award, CircleGauge, CodeXml, Compass, Lock, LogOut, Map, User,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

const PRODUCT_ICON = {
  bor: CircleGauge,
  atlas: Map,
} as const

// Mesmo crachá que o header dos dois produtos mostra, com a mesma cor por papel.
const ROLE_BADGE: Record<string, { icon: typeof User; className: string }> = {
  dev:     { icon: CodeXml, className: "text-yellow-600 dark:text-yellow-400" },
  owner:   { icon: Compass, className: "text-emerald-600 dark:text-emerald-400" },
  admin:   { icon: Award,   className: "text-primary" },
  manager: { icon: Award,   className: "text-primary" },
  gestor:  { icon: Award,   className: "text-primary" },
  user:    { icon: User,    className: "text-foreground" },
  viewer:  { icon: User,    className: "text-foreground" },
}

function ProductCard({ product, onPick }: { product: Product; onPick: (p: Product) => void }) {
  const Icon = PRODUCT_ICON[product.id]
  return (
    <button
      onClick={() => product.enabled && onPick(product)}
      disabled={!product.enabled}
      className="group flex w-full items-center gap-4 rounded-lg border border-border/60 bg-card p-4 text-left transition-colors enabled:hover:border-primary/50 enabled:hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground transition-colors group-enabled:group-hover:border-primary/40 group-enabled:group-hover:text-primary">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold leading-tight">{product.name}</span>
        <span className="line-clamp-2 text-sm text-muted-foreground">{product.tagline}</span>
      </span>
      {/* Card inteiro é o alvo do clique; a seta só repetia isso. O cadeado
          fica, porque ele informa em vez de decorar. */}
      {!product.enabled && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{product.reason}</span>
        </span>
      )}
    </button>
  )
}

function SelectProduct() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { products, available, isLoading } = useProducts()

  const role = ROLE_BADGE[user?.role ?? "viewer"] ?? ROLE_BADGE.viewer
  const RoleIcon = role.icon

  // Quem só tem um destino não deveria escolher entre uma opção só (AT-2): a
  // tela existe para bifurcar, e sem bifurcação é um clique a mais entre a
  // pessoa e o trabalho.
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
        <div className="flex flex-col items-center gap-1 text-center">
          {/* Uma linha de texto só, com o ícone dentro dela: envolver o nome num
              flex empurrava o "!" para longe da palavra e pintava o nome com a
              cor do papel. A cor é do crachá, não de quem o usa. */}
          <h1 className="text-xl font-semibold">
            Welcome,{" "}
            <RoleIcon className={`inline-block h-5 w-5 align-[-0.15em] ${role.className}`} />{" "}
            {user?.name?.split(" ")[0] ?? "there"}!
          </h1>
          <p className="text-sm text-muted-foreground">Where are we working today?</p>
        </div>
      </div>

      <div className="flex w-full max-w-xl flex-col gap-3">
        {products.map(product => (
          <ProductCard key={product.id} product={product} onPick={p => router.push(p.href)} />
        ))}
      </div>

      {available.length === 0 && (
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Your account has no product access yet. Ask an administrator to grant permissions
          in Settings.
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
