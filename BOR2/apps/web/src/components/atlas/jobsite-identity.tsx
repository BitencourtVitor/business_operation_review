"use client"

import { KIND_META } from "@/components/atlas/jobsite-form-dialog"
import type { AtlasJobsite } from "@/services/atlas.service"
import { Briefcase, Building2, MapPin } from "lucide-react"

/**
 * O que a obra é, em uma linha.
 *
 * Cliente, local e tipo de um lado; o endereço do outro, com fundo próprio e
 * borda entre eles. Em tela larga ficam lado a lado, porque sobrava meia faixa
 * ao lado das três primeiras; em tela estreita o endereço desce.
 *
 * Mora aqui, e não na página da obra, porque a página do documento precisa da
 * mesma identificação: quem está dentro da pasta continua querendo saber de que
 * obra ela é e onde essa obra fica, sem ter que voltar para conferir.
 */
export function JobsiteIdentity({ jobsite }: { jobsite: AtlasJobsite }) {
  const kind = KIND_META[jobsite.kind] ?? KIND_META.house
  return (
    <div className="flex shrink-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/30 text-sm text-muted-foreground lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
        <IdentityFact icon={Briefcase} label="Client" value={jobsite.client} />
        <IdentityFact icon={Building2} label="Jobsite" value={jobsite.community || jobsite.name} />
        <IdentityFact
          icon={kind.icon}
          label="Build type"
          value={[kind.label, jobsite.unit || jobsite.code].filter(Boolean).join(" ")}
        />
      </div>
      {jobsite.address && (
        <div className="flex min-w-0 items-center border-t border-border/60 bg-muted/20 px-3 py-2 lg:max-w-[50%] lg:border-t-0 lg:border-l">
          <IdentityFact icon={MapPin} label="Address" value={jobsite.address} />
        </div>
      )}
    </div>
  )
}

export function IdentityFact({ icon: Icon, label, value }: {
  icon: React.ElementType
  label: string
  value: string
}) {
  if (!value) return null
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={label}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{value}</span>
    </span>
  )
}
