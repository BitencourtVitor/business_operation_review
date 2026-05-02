"use client"

import { cn } from "@/lib/utils"
import { COMPANY_LOGO, COMPANY_LABEL } from "../_lib/wex-algorithm"
import type { Company } from "../_lib/wex-algorithm"

export function CompanyLogo({ company, className }: { company: Company; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={COMPANY_LOGO[company]} alt={COMPANY_LABEL[company]}
      className={cn("h-4 w-auto object-contain", className)} />
  )
}
