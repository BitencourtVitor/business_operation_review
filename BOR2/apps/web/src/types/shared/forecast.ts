import type { Company } from "./common"

export type ForecastStatus = "planned" | "active" | "completed" | "cancelled"

export interface ForecastFieldwireDoc {
  id?: number
  status?: string | null
  category?: string
  document?: string
  /** false: aparece na lista mas não conta em nota (ex.: "On Atlas"). Vem do catálogo. */
  scored?: boolean
}

/** Os documentos que contam para nota e progresso. */
export function scoredFieldwire(docs?: ForecastFieldwireDoc[]): ForecastFieldwireDoc[] {
  return (docs ?? []).filter(d => d.scored !== false)
}

/**
 * O parâmetro do Fieldwire que o bloco do Atlas passou a responder. A linha
 * segue no catálogo e no banco; o que mudou é quem conta a história.
 */
export function isAtlasDoc(doc?: string | null): boolean {
  return (doc ?? "").trim().toLowerCase() === "on atlas"
}

export interface ForecastPermitStep {
  id?: number
  step?: string
  status?: string | null
}

export interface ForecastMachineItem {
  id?: number
  title?: string | null
  unit?: string | null
  status?: string | null   // "scheduled" | "dispensed" | "true" | "yes" | "1" → active
}

export interface ForecastContractStep {
  id?: number
  team?: string | null
  step?: string | null
  status?: string | null
}

/**
 * Uma vaga dentro da categoria. Categoria sem eixo tem uma só, de rótulo vazio;
 * categoria por andar ou por unidade tem uma por andar ou por unidade.
 */
export interface ForecastAtlasSlot {
  label: string
  imported: boolean
}

/** Uma categoria que se espera ver documentada na obra. */
export interface ForecastAtlasCategory {
  id: number
  name: string
  axis: string
  slots: ForecastAtlasSlot[]
}

/**
 * O que o Atlas documenta da obra. A lista de categorias vem sempre, mesmo na
 * obra que ainda não está no Atlas: saber o que falta é o motivo do bloco. Ela
 * nasce do tipo de obra, e por isso não espelha a lista do Fieldwire. Nada aqui
 * entra no OFI.
 */
export interface ForecastAtlas {
  jobsiteId: string | null
  categories: ForecastAtlasCategory[]
}

export type ForecastDisplayStatus = "active" | "planned" | "overdue" | "completed" | "cancelled"

export interface ForecastProject {
  id: string
  company: Company
  name: string
  status: ForecastStatus
  startDate: string
  endDate: string
  contractValue: number
  team: string
  qbTime: boolean
  // Extended fields
  cliente: string
  jobSite: string
  type: string
  loteBld: string
  address: string
  obs: string
  obsAuthor?: string
  obsRole?: string
  obsAt?: string | null
  /** @deprecated marcação manual legada — o selo agora vem de linkedCompanies */
  hvac: boolean
  /** Etapas do ciclo de HVAC — só a company 'hvac' as usa. */
  hvacRoughDate?: string | null
  hvacAirHandlerDate?: string | null
  hvacCondenserDate?: string | null
  hvacFinishDate?: string | null
  /** Fim de cada etapa — as Orders trazem RS e RE por task. */
  hvacRoughEndDate?: string | null
  hvacAirHandlerEndDate?: string | null
  hvacCondenserEndDate?: string | null
  hvacFinishEndDate?: string | null
  /** Abertura do job na conta do cliente — referência, não cronograma. */
  jobOpenedDate?: string | null
  /** Obra física compartilhada entre empresas (forecast_sites). */
  siteId?: string
  /** Outras empresas que atuam nesta mesma obra. Origem do selo de HVAC. */
  linkedCompanies?: string[]
  buildertrend: boolean
  storage: boolean
  hasOrders: boolean
  machineProvider: string
  previousBeamsDate?: string | null
  previousStartDate?: string | null
  previousEndDate?: string | null
  // Tracked item arrays (from backend sub-resources)
  fieldwire?: ForecastFieldwireDoc[]
  machines?: ForecastMachineItem[]
  contractSteps?: ForecastContractStep[]
  permit?: ForecastPermitStep[]
  atlas?: ForecastAtlas | null
  createdAt: string
  updatedAt: string
}

export interface ForecastObsEntry {
  id: number
  projectId: string
  body: string
  authorId: string
  authorName: string
  authorRole: string
  createdAt: string
}

export interface ForecastFilters {
  company?: Company
  status?: ForecastStatus
  year?: number
  month?: number
}

export function getForecastDisplayStatus(
  p: ForecastProject,
  dateMode?: "start" | "beams",
): ForecastDisplayStatus {
  if (p.status === "completed" || p.status === "cancelled") return p.status
  if (p.status === "active") return "active"
  if (p.status === "planned") {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    // Which date(s) to check depends on the active grouping mode.
    // If dateMode is provided, only the matching date qualifies a project as overdue.
    // Without dateMode (e.g. detail panels) both dates are considered.
    const candidates =
      dateMode === "start"  ? [p.previousStartDate] :
      dateMode === "beams"  ? [p.previousBeamsDate]  :
      [p.previousStartDate, p.previousBeamsDate]
    const dates = candidates
      .filter(Boolean)
      .map(s => {
        // parseInt stops at "T" in "YYYY-MM-DDTHH:mm:ssZ", avoiding NaN from Number()
        const [y, m, d] = s!.split("-").map(n => parseInt(n, 10))
        return new Date(y, m - 1, d)
      })
    if (dates.some(date => date <= today)) return "overdue"
  }
  return p.status
}

/** Uma mudança de data registrada pelo banco (trigger da migração 000117). */
export interface ForecastDateEntry {
  id: number
  projectId: string
  company: string
  field: string
  oldValue?: string | null
  newValue?: string | null
  source: string
  changedBy: string
  /** Por que a data mudou. Só a edição à mão exige; a rotina grava vazio. */
  note?: string
  changedAt: string
}
