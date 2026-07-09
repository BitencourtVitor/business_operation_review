export type Company = "framing" | "hvac" | "pcg"
export type CompanyFilter = Company | "all"
export const COMPANIES: Company[] = ["framing", "hvac", "pcg"]

export const COMPANY_LOGO: Record<Company, string> = {
  framing: "/images/sublogo_framing.png",
  hvac:    "/images/sublogo_hvac.png",
  pcg:     "/images/sublogo_pcg.png",
}
export const COMPANY_LABEL: Record<Company, string> = {
  framing: "Framing",
  hvac:    "HVAC",
  pcg:     "PCG",
}
