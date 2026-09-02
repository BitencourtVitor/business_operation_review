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

  // Dev entra sempre; quem recebeu a chave `atlas` na tela de usuários do
  // Atlas entra também. É a mesma regra que a API cobra em RequireAtlas.
  // Cargo acima de `user` entra por definição — quem manda na obra manda no
  // Atlas. O `user` é convidado um a um na tela de usuários do Atlas, porque é
  // ele que pode ser um subcontratado. Mesma regra que a API cobra em
  // RequireAtlas.
  const hasAtlas = full || !!perms.atlas
  const hasBOR = full || Object.entries(perms).some(([key, level]) => key !== "atlas" && !!level)

  const products: Product[] = [
    {
      id: "bor",
      name: "Business Operations Review",
      tagline: "Every number the operation runs on: money, people, schedule and execution, measured in one place.",
      href: "/monthly-execution",
      enabled: hasBOR,
      reason: hasBOR ? undefined : "No access granted",
    },
    {
      id: "atlas",
      name: "Atlas Project Control",
      tagline: "Every drawing, every mark, every measurement. The jobsite exactly as it was built.",
      href: "/atlas",
      enabled: hasAtlas,
      reason: hasAtlas ? undefined : "Under construction",
    },
  ]

  return {
    products,
    available: products.filter(p => p.enabled),
    hasBOR,
    hasAtlas,
    isLoading: !user || isLoading,
  }
}
