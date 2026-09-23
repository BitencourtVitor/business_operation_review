"use client"

import { useAuth } from "@/hooks/use-auth"
import { useMyPermissions } from "@/hooks/use-settings"
import { CircleGauge, DraftingCompass, type LucideIcon } from "lucide-react"

// Os dois braços da plataforma. Autenticar deixou de significar "entrar no
// BOR": o login é da plataforma, e BOR e Atlas são destinos dela (AT-2).
export type ProductId = "bor" | "atlas"

/**
 * A marca de cada produto, num lugar só. O compasso do Atlas desenha um A com
 * as duas pernas, e é o mesmo sinal na seleção de produto, no cabeçalho e onde
 * mais o Atlas aparecer — marca que muda de desenho por tela deixa de ser marca.
 */
export const PRODUCT_ICON: Record<ProductId, LucideIcon> = {
  bor: CircleGauge,
  atlas: DraftingCompass,
}

const FULL_ACCESS_ROLES = ["dev", "owner", "admin", "manager"]

/**
 * Por onde o BOR abre, na ordem da barra lateral. A primeira que a pessoa tem
 * permissão de ver é a que ela vê.
 *
 * Antes isto era `/bor/monthly-execution` fixo, e quem não tinha essa chave
 * caía numa página que não podia abrir. A lista é de folhas, nunca de grupos:
 * Framing e HVAC são duas permissões distintas (`forecast` e `forecast_hvac`),
 * então mandar para `/bor/forecast` daria Framing a quem só tem HVAC.
 *
 * Chave repetida é intencional: a primeira entrada vence, e as seguintes só
 * existem para o dia em que a de cima sair da lista.
 */
const BOR_LANDING: { permKey: string; href: string }[] = [
  { permKey: "monthly_execution", href: "/bor/monthly-execution" },
  { permKey: "ofi", href: "/bor/ofi" },
  { permKey: "forecast", href: "/bor/forecast" },
  { permKey: "forecast_hvac", href: "/bor/hvac-forecast" },
  { permKey: "forecast_hvac", href: "/bor/hvac-schedule" },
  { permKey: "workforce", href: "/bor/workforce-productivity" },
  { permKey: "inventory", href: "/bor/inventory" },
  { permKey: "permits", href: "/bor/permits" },
  { permKey: "service_requests", href: "/bor/service-requests" },
  { permKey: "accounting", href: "/bor/accounting" },
  { permKey: "budget_control", href: "/bor/budget-control" },
  { permKey: "building_schedule", href: "/bor/building-schedule" },
  { permKey: "subcontractor_docs", href: "/bor/subcontractor-docs" },
  { permKey: "pcg_bid_requests", href: "/bor/pcg-bid-requests" },
  { permKey: "data_control", href: "/bor/data-control?division=framing" },
  { permKey: "data_control_hvac", href: "/bor/data-control?division=hvac" },
  { permKey: "wex_categorization", href: "/bor/wex-categorization" },
  { permKey: "autolog", href: "/bor/autolog" },
  { permKey: "weekly_hours", href: "/bor/weekly-hours-control" },
  { permKey: "whos_working", href: "/bor/qbtime/whos-working" },
  { permKey: "period_reports", href: "/bor/qbtime/period-reports" },
  { permKey: "absence_control", href: "/bor/qbtime/absences" },
  { permKey: "settings", href: "/bor/settings" },
]

/** A primeira página do BOR que estas permissões abrem. */
export function borLandingHref(
  permissions: Record<string, unknown>,
  fullAccess: boolean,
): string {
  if (fullAccess) return BOR_LANDING[0].href
  return BOR_LANDING.find(p => !!permissions[p.permKey])?.href ?? BOR_LANDING[0].href
}

/**
 * Se o usuário tem o BOR, e por onde ele entra.
 *
 * O BOR não tem chave própria: tê-lo é ter qualquer permissão que não seja a
 * do Atlas, que agora é do BuilderLog.
 */
export function useProducts() {
  const { user } = useAuth()
  const { data: myPerms, isLoading } = useMyPermissions()

  const role = user?.role ?? ""
  const full = FULL_ACCESS_ROLES.includes(role)
  const perms = myPerms?.permissions ?? {}
  const hasBOR = full || Object.entries(perms).some(([key, level]) => key !== "atlas" && !!level)

  return {
    hasBOR,
    /** Para quem manda o usuário de volta ao BOR de dentro do Atlas. */
    borHref: borLandingHref(perms, full),
    isLoading: !user || isLoading,
  }
}
