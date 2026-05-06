import {
  ArrowUpDown,
  Briefcase,
  Building2,
  Circle,
  ClipboardList,
  DoorOpen,
  Droplets,
  Flame,
  Hammer,
  Home,
  LayoutGrid,
  Layers,
  Logs,
  Package2,
  PanelLeft,
  TrendingUp,
  Triangle,
  Users2,
  Warehouse,
  Wind,
  Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

// ─── Phase bar colours ────────────────────────────────────────────────────────

export const PHASE_COLORS_LIGHT = [
  "#d97706","#dc2626","#9333ea","#2563eb",
  "#0891b2","#059669","#ea580c","#db2777",
  "#65a30d","#4f46e5","#0d9488","#ca8a04",
]
export const PHASE_COLORS_DARK = [
  "#fbbf24","#f87171","#c084fc","#60a5fa",
  "#22d3ee","#34d399","#fb923c","#f472b6",
  "#a3e635","#818cf8","#2dd4bf","#facc15",
]

// ─── Resource helpers ─────────────────────────────────────────────────────────

export function toTitleCase(s: string): string {
  const l = s.replace(/[^a-zA-Z]/g, "")
  if (l.length > 1 && l === l.toUpperCase()) return s
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

export const TRADE_ENTRIES: Array<{
  match: RegExp
  icon:  LucideIcon
  cls:   string
}> = [
  { match: /electrical|electric/i,          icon: Zap,        cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300" },
  { match: /plumbing|plumb/i,               icon: Droplets,   cls: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300" },
  { match: /hvac|mechanical/i,              icon: Wind,       cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { match: /framer.*(ext|exterior)/i,       icon: Hammer,     cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { match: /framer.*(int|interior)/i,       icon: PanelLeft,  cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  { match: /framer.*shell/i,                icon: Building2,  cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200" },
  { match: /framing|framer/i,               icon: Hammer,     cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  { match: /drywall/i,                      icon: Layers,     cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  { match: /sprinkler/i,                    icon: Droplets,   cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  { match: /fireproof|fire\s/i,             icon: Flame,      cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  { match: /flatwork|concrete|foundation/i, icon: Layers,     cls: "bg-stone-100 text-stone-800 dark:bg-stone-900/40 dark:text-stone-300" },
  { match: /tile|flooring/i,                icon: Layers,     cls: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300" },
  { match: /paint/i,                        icon: Circle,     cls: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300" },
  { match: /elevator/i,                     icon: ArrowUpDown,cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  { match: /structural/i,                   icon: Triangle,   cls: "bg-stone-100 text-stone-700 dark:bg-stone-800/60 dark:text-stone-300" },
  { match: /alum|door|window|glass/i,       icon: DoorOpen,   cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
  { match: /truss/i,                        icon: Triangle,   cls: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300" },
  { match: /appliance/i,                    icon: Package2,   cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { match: /panel|insul/i,                  icon: PanelLeft,  cls: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300" },
  { match: /subs|subcontractor/i,           icon: Users2,     cls: "bg-muted text-muted-foreground" },
  { match: /lumber/i,                       icon: Logs,       cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" },
  { match: /pulte/i,                        icon: Home,       cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300" },
  { match: /roof.shingle|shingle/i,         icon: Warehouse,  cls: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300" },
  { match: /\bscar\b/i,                     icon: ClipboardList, cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" },
  { match: /\bsales\b/i,                    icon: TrendingUp, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { match: /\bunits?\b/i,                   icon: LayoutGrid, cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  { match: /client|owner/i,                 icon: Briefcase,  cls: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300" },
]

export function resColor(r: string) {
  return TRADE_ENTRIES.find(e => e.match.test(r))?.cls ?? "bg-muted text-muted-foreground"
}
export function resIcon(r: string): LucideIcon | null {
  return TRADE_ENTRIES.find(e => e.match.test(r))?.icon ?? null
}

export const RES_BAR_HEX: Array<{ match: RegExp; dark: string; light: string }> = [
  { match: /electrical|electric/i,          dark: "#facc15", light: "#ca8a04" },
  { match: /plumbing|plumb/i,               dark: "#22d3ee", light: "#0891b2" },
  { match: /hvac|mechanical/i,              dark: "#60a5fa", light: "#2563eb" },
  { match: /framer.*(ext|exterior)/i,       dark: "#fbbf24", light: "#d97706" },
  { match: /framer.*(int|interior)/i,       dark: "#fb923c", light: "#ea580c" },
  { match: /framer.*shell/i,                dark: "#fde047", light: "#ca8a04" },
  { match: /framing|framer/i,               dark: "#fbbf24", light: "#d97706" },
  { match: /drywall/i,                      dark: "#4ade80", light: "#16a34a" },
  { match: /sprinkler/i,                    dark: "#f87171", light: "#dc2626" },
  { match: /fireproof|fire\s/i,             dark: "#fda4af", light: "#e11d48" },
  { match: /flatwork|concrete|foundation/i, dark: "#a8a29e", light: "#78716c" },
  { match: /tile|flooring/i,                dark: "#c084fc", light: "#7c3aed" },
  { match: /paint/i,                        dark: "#f9a8d4", light: "#db2777" },
  { match: /elevator/i,                     dark: "#818cf8", light: "#4f46e5" },
  { match: /structural/i,                   dark: "#d6d3d1", light: "#57534e" },
  { match: /alum|door|window|glass/i,       dark: "#38bdf8", light: "#0284c7" },
  { match: /truss/i,                        dark: "#a3e635", light: "#65a30d" },
  { match: /appliance/i,                    dark: "#34d399", light: "#059669" },
  { match: /panel|insul/i,                  dark: "#94a3b8", light: "#475569" },
  { match: /subs|subcontractor/i,           dark: "#9ca3af", light: "#6b7280" },
  { match: /lumber/i,                       dark: "#d97706", light: "#b45309" },
  { match: /pulte/i,                        dark: "#818cf8", light: "#4f46e5" },
  { match: /roof.shingle|shingle/i,         dark: "#94a3b8", light: "#64748b" },
  { match: /\bscar\b/i,                     dark: "#c084fc", light: "#9333ea" },
  { match: /\bsales\b/i,                    dark: "#34d399", light: "#059669" },
  { match: /\bunits?\b/i,                   dark: "#60a5fa", light: "#2563eb" },
  { match: /client|owner/i,                 dark: "#2dd4bf", light: "#0d9488" },
]

const SUBLOGO_ENTRIES: Array<{ match: RegExp; src: string }> = [
  { match: /framing|framer/i, src: "/images/sublogo_framing.png" },
  { match: /hvac|mechanical/i, src: "/images/sublogo_hvac.png" },
  { match: /\bpcg\b/i,        src: "/images/sublogo_pcg.png" },
]

export function resSubLogo(r: string): string | null {
  return SUBLOGO_ENTRIES.find(e => e.match.test(r))?.src ?? null
}

export function resBarColor(r: string, isDark: boolean): string | null {
  const entry = RES_BAR_HEX.find(e => e.match.test(r))
  return entry ? (isDark ? entry.dark : entry.light) : null
}

export const TRADE_CATEGORIES: Array<{ label: string; match: RegExp }> = [
  { label: "Structure", match: /framing|framer|structural|truss|flatwork|concrete|foundation/i },
  { label: "MEP",       match: /electrical|electric|plumbing|plumb|hvac|mechanical|sprinkler|fireproof|fire\s|elevator/i },
  { label: "Finishing", match: /drywall|tile|flooring|paint|appliance/i },
  { label: "Envelope",  match: /alum|door|window|glass|panel|insul/i },
  { label: "Other",     match: /subs|subcontractor/i },
]
export const CATEGORY_ORDER = TRADE_CATEGORIES.map(c => c.label)

export function resCategory(r: string): string {
  return TRADE_CATEGORIES.find(c => c.match.test(r))?.label ?? "Other"
}
