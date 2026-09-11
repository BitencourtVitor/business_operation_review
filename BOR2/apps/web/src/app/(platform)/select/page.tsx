"use client"

import { AuthGuard } from "@/components/auth/auth-guard"
import { SelectView } from "@/components/platform/select-view"
import { useAuth } from "@/hooks/use-auth"
import { useProducts } from "@/lib/products"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

function SelectProduct() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const { products, available, isLoading } = useProducts()

  // Entrar direto só quando não há mais nada a mostrar, nem sequer um destino
  // travado. Enquanto o Atlas está em construção ele aparece bloqueado para
  // quem não é dev, e pular a tela esconderia justamente o aviso de que ele
  // existe e está vindo.
  const skip = products.length === 1 && available.length === 1

  useEffect(() => {
    if (!isLoading && skip) {
      router.replace(available[0].href)
    }
  }, [isLoading, skip, available, router])

  if (isLoading || skip) {
    return (
      <div className="flex h-dvh w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  return (
    <SelectView
      userName={user?.name}
      userRole={user?.role}
      products={products}
      available={available}
      onPick={p => router.push(p.href)}
      onLogout={() => logout()}
    />
  )
}

export default function SelectProductPage() {
  return (
    <AuthGuard>
      <SelectProduct />
    </AuthGuard>
  )
}
