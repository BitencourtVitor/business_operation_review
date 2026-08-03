export type Company = "hvac" | "framing" | "pcg"

export type Role = "dev" | "owner" | "admin" | "manager" | "user" | "viewer"

export type Month =
  | "January" | "February" | "March" | "April"
  | "May" | "June" | "July" | "August"
  | "September" | "October" | "November" | "December"

export const MONTHS: Month[] = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
]

export const COMPANIES: Company[] = ["hvac", "framing", "pcg"]
