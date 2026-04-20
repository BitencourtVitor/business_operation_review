"use client"

import type { ForecastProject, ForecastStatus } from "@bor2/shared"
import type { CatalogTable } from "@/services/catalog.service"
import React from "react"
import {
  ClipboardList,
  FilePlus2,
  FileText,
  Info,
  Pencil,
  Database,
  SlidersHorizontal,
  Truck,
  UserCircle,
  Users,
  Wrench,
} from "lucide-react"
import type { ViewTab } from "@/components/features/data-control/project-card"

// ─── Re-export ViewTab so consumers can import from a single place ─────────────
export type { ViewTab }

// ─── Section + table selectors ────────────────────────────────────────────────
export type DCSection = "new-project" | "edit-project" | "catalog"
export type SidebarTable = CatalogTable | "clients"

// ─── Row shapes ───────────────────────────────────────────────────────────────
export type FWRow = {
  id: number
  client: string
  type: string
  document: string
  where_location: string
  notes: string
}

export type MRow = {
  id: number
  category: string
  subcategory: string
  equipment_category: string
  title: string
}

// ─── Form state ───────────────────────────────────────────────────────────────
export type FormState = Omit<
  ForecastProject,
  "id" | "createdAt" | "updatedAt" | "fieldwire" | "machines" | "contractSteps"
>

export const EMPTY_FORM: FormState = {
  company: "framing",
  name: "",
  status: "planned",
  startDate: "",
  endDate: "",
  contractValue: 0,
  team: "",
  qbTime: false,
  cliente: "",
  jobSite: "",
  type: "",
  loteBld: "",
  address: "",
  obs: "",
  hvac: false,
  buildertrend: false,
  storage: false,
  machineProvider: "",
  previousBeamsDate: null,
  previousStartDate: null,
  previousEndDate: null,
}

// ─── Status constants ─────────────────────────────────────────────────────────
export const STATUSES: ForecastStatus[] = ["planned", "active", "completed", "cancelled"]
export const PROJECT_TYPES = ["Building", "Lot"]

export const STATUS_BADGE: Record<ForecastStatus, string> = {
  planned:   "secondary",
  active:    "default",
  completed: "outline",
  cancelled: "destructive",
}

export const STATUS_SEARCH: Record<string, string> = {
  active:    "open",
  planned:   "not started",
  completed: "closed",
  cancelled: "cancelled",
}

export const STATUS_OPTS: { value: ForecastStatus; label: string }[] = [
  { value: "planned",   label: "Not started" },
  { value: "active",    label: "Open"        },
  { value: "completed", label: "Closed"      },
]

// ─── Fieldwire / Machines project type options ─────────────────────────────────
export const FW_PROJECT_TYPES = ["Building", "Lot"] as const
export const MACHINE_TYPES    = ["Building", "Lot"] as const

// ─── Catalog sidebar tabs ─────────────────────────────────────────────────────
export const CATALOG_TABS: {
  key: SidebarTable
  label: string
  icon?: React.ElementType
  image?: string
  cols: { field: string; label: string }[]
}[] = [
  { key: "clients",        label: "Clients & Job Sites", icon: UserCircle,    cols: [] },
  { key: "workforce",      label: "Workforce",           icon: Users,         cols: [{ field: "name",  label: "Name" }] },
  { key: "providers",      label: "Machine Providers",   icon: Truck,         cols: [{ field: "name",  label: "Name" }] },
  { key: "contract-steps", label: "Contract Steps",      icon: ClipboardList, cols: [{ field: "step",  label: "Step" }] },
  {
    key: "fieldwire", label: "Fieldwire Docs", image: "/images/icon_fieldwire.png",
    cols: [
      { field: "category",       label: "Category" },
      { field: "document",       label: "Document" },
      { field: "where_location", label: "Where"    },
      { field: "notes",          label: "Notes"    },
    ],
  },
  {
    key: "machines", label: "Machines", icon: Wrench,
    cols: [
      { field: "category",           label: "Category"    },
      { field: "subcategory",        label: "Subcategory" },
      { field: "equipment_category", label: "Equip. Cat." },
      { field: "title",              label: "Title"       },
    ],
  },
]

// ─── DC nav groups ─────────────────────────────────────────────────────────────
export const DC_GROUPS: {
  label: string
  items: { key: DCSection; label: string; icon: React.ElementType }[]
}[] = [
  {
    label: "Options",
    items: [
      { key: "new-project",  label: "New Project",    icon: FilePlus2 },
      { key: "edit-project", label: "Edit Project",   icon: Pencil    },
      { key: "catalog",      label: "Catalog Tables", icon: Database  },
    ],
  },
]

// ─── View-mode tabs (used inside EditProjectSection) ──────────────────────────
export const VIEW_TABS: { key: ViewTab; label: string; icon: React.ReactNode }[] = [
  { key: "info",      label: "Info & Dates", icon: React.createElement(Info,              { className: "h-3.5 w-3.5" }) },
  { key: "fieldwire", label: "Fieldwire",    icon: React.createElement("img", { src: "/images/icon_fieldwire.png", alt: "Fieldwire", className: "h-3.5 w-3.5 object-contain" }) },
  { key: "machines",  label: "Machines",     icon: React.createElement(Truck,             { className: "h-3.5 w-3.5" }) },
  { key: "contract",  label: "Contract",     icon: React.createElement(FileText,          { className: "h-3.5 w-3.5" }) },
  { key: "optionals", label: "Optionals",    icon: React.createElement(SlidersHorizontal, { className: "h-3.5 w-3.5" }) },
]
