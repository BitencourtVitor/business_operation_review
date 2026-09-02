"use client"

import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"

// Os dois braços da plataforma. Autenticar deixou de significar "entrar no
// BOR": o login é da plataforma, e BOR e Atlas são destinos dela (AT-2).
export type ProductId = "bor" | "atlas"

export interface Product {
  id: ProductId
  name: string
  tagline: string
  href: string
  /** Falso mantém o destino visível e o clique bloqueado. */
  enabled: boolean
  /** Por que está bloqueado, quando está. */
  reason?: string
}

const FULL_ACCESS_ROLES = ["dev", "owner", "admin", "manager"]

/**
 * A que o usuário tem acesso.
 *
 * O Atlas está em construção e, por decisão de 01/09, é **só do desenvolvedor**
 * enquanto estiver assim. Para todo mundo o card aparece desabilitado em vez de
 * sumir: esconder faria a plataforma parecer ter um produto só, e o que se quer
 * comunicar é "existe, e ainda não é seu".
 *
 * O BOR não tem chave própria — tê-lo é ter qualquer permissão que não seja a
 * do Atlas.
 */
export function useProducts() {
  const { user } = useAuth()
  const { data: myPerms, isLoading } = useMyPermissions()

  const role = user?.role ?? ""
  const full = FULL_ACCESS_ROLES.includes(role)
  const perms = myPerms?.permissions ?? {}

  const isDev = role === "dev"
  const hasBOR = full || Object.entries(perms).some(([key, level]) => key !== "atlas" && !!level)

  const products: Product[] = [
    {
      id: "bor",
      name: "Business Operations Review",
      tagline: "Forecast, financials, productivity and operational control.",
      href: "/monthly-execution",
      enabled: hasBOR,
      reason: hasBOR ? undefined : "No access granted",
    },
    {
      id: "atlas",
      name: "Atlas Project Control",
      tagline: "Documents, drawings and site diary.",
      href: "/atlas",
      enabled: isDev,
      reason: isDev ? undefined : "Under construction — developer only",
    },
  ]

  return {
    products,
    available: products.filter(p => p.enabled),
    hasBOR,
    hasAtlas: isDev,
    isLoading: !user || isLoading,
  }
}
