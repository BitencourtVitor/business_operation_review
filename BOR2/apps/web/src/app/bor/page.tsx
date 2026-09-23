"use client"

import { useProducts } from "@/lib/products"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

// A porta do BOR depois do login. Cada um cai na primeira página que pode abrir.
// Quem só tinha Atlas não tem nada aqui: a conta dele agora é do BuilderLog.
const BUILDERLOG_LOGIN = "https://builderlog.co/login"

export default function BorHome() {
  const router = useRouter()
  const { hasBOR, borHref, isLoading } = useProducts()

  useEffect(() => {
    if (isLoading) return
    if (hasBOR) router.replace(borHref)
    else window.location.assign(BUILDERLOG_LOGIN)
  }, [isLoading, hasBOR, borHref, router])

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  )
}
