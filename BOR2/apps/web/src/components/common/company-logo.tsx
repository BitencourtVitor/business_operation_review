"use client"

import { cn } from "@/lib/utils"
import { COMPANY_LOGO, COMPANY_LABEL } from "@/lib/company"
import type { Company } from "@/lib/company"

export function CompanyLogo({ company, className }: { company: Company; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={COMPANY_LOGO[company]} alt={COMPANY_LABEL[company]}
      className={cn("h-4 w-auto object-contain", className)} />
  )
}
