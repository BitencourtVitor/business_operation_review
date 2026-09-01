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
}

export const PRODUCTS: Record<ProductId, Product> = {
  bor: {
    id: "bor",
    name: "Business Operations Review",
    tagline: "Forecast, financeiro, produtividade e controle operacional.",
    href: "/monthly-execution",
  },
  atlas: {
    id: "atlas",
    name: "Atlas",
    tagline: "Documentos, plantas e diário de obra.",
    href: "/atlas",
  },
}

// Papéis que administram a plataforma entram nos dois lados sem depender de
// alguém lembrar de conceder acesso a eles.
const FULL_ACCESS_ROLES = ["dev", "owner", "admin", "manager"]

/**
 * A que o usuário tem acesso, e se a resposta já é confiável.
 *
 * O Atlas é chave própria (`atlas`) porque acesso a produto é um eixo acima de
 * acesso a feature: dá para ter Atlas e não ter BOR. O BOR, por sua vez, não
 * tem chave — ele é o conjunto de tudo o que já existia, então tê-lo é ter
 * qualquer permissão que não seja a do Atlas.
 */
export function useProducts() {
  const { user } = useAuth()
  const { data: myPerms, isLoading } = useMyPermissions()

  const role = user?.role ?? ""
  const full = FULL_ACCESS_ROLES.includes(role)
  const perms = myPerms?.permissions ?? {}

  const hasAtlas = full || !!perms.atlas
  const hasBOR = full || Object.entries(perms).some(([key, level]) => key !== "atlas" && !!level)

  const available: Product[] = []
  if (hasBOR) available.push(PRODUCTS.bor)
  if (hasAtlas) available.push(PRODUCTS.atlas)

  return { available, hasBOR, hasAtlas, isLoading: !user || isLoading }
}
