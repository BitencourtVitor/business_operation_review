"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Banknote,
  BarChart2,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileCheck,
  Fuel,
  Gauge,
  ImageIcon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { useMyPermissions } from "@/hooks/use-settings"
import { useAuth } from "@/hooks/use-auth"
import { ManageDataModal as PermitManageDataModal }          from "@/app/(dashboard)/permits/manage-data-modal"
import { ManageDataModal as ServiceRequestManageDataModal } from "@/app/(dashboard)/service-requests/manage-data-modal"
import { ManageDataModal as WorkforceManageDataModal }      from "@/app/(dashboard)/workforce-productivity/manage-data-modal"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type SubItem = {
  title: string
  href: string
  icon?: React.ElementType
  image?: string
  disabled?: boolean
  permKey?: string       // permission key required to VIEW this sub-item
}

type NavItem = {
  title: string
  href: string
  icon?: React.ElementType
  image?: string
  imageDark?: string
  disabled?: boolean
  children?: SubItem[]
  permKey?: string       // permission key required to VIEW this item
  editPermKey?: string   // permission key that grants the gear edit button (opens modal)
  metricsHref?: string   // if set, shows a "See Metrics" action button linking here
}

type NavGroup = {
  label?: string
  items: NavItem[]
}

// Active — no section label
const activeGroup: NavGroup = {
  items: [
    {
      title: "Framing Forecast", href: "/forecast",
      image: "/images/sublogo_framing.png",
      permKey: "forecast",
      metricsHref: "/forecast/metrics",
    },
    { title: "Inventory Control", href: "/inventory", icon: Package, permKey: "inventory" },
    {
      title: "Workforce", href: "/workforce-productivity", icon: Users,
      permKey: "workforce", editPermKey: "workforce",
      children: [
        { title: "Framing", href: "/workforce-productivity?company=Framing", image: "/images/sublogo_framing.png" },
        { title: "HVAC",    href: "/workforce-productivity?company=HVAC",    image: "/images/sublogo_hvac.png"    },
        { title: "PCG",     href: "/workforce-productivity?company=PCG",     image: "/images/sublogo_pcg.png"     },
      ],
    },
    { title: "Operational Index", href: "/ofi", icon: BarChart2, permKey: "ofi" },
    { title: "Building Schedule", href: "/building-schedule", icon: Building2, permKey: "building_schedule" },
    { title: "Permit Control", href: "/permits", icon: FileCheck, permKey: "permits", editPermKey: "permits" },
    { title: "Service Requests", href: "/service-requests", icon: Wrench, permKey: "service_requests", editPermKey: "service_requests" },
    {
      title: "Accounting", href: "/accounting", icon: Banknote,
      permKey: "accounting",
      children: [
        { title: "Framing", href: "/accounting?company=framing",  image: "/images/sublogo_framing.png"  },
        { title: "HVAC",    href: "/accounting?company=hvac",     image: "/images/sublogo_hvac.png"     },
        { title: "PCG",     href: "/accounting?company=pcg",      image: "/images/sublogo_pcg.png"      },
      ],
    },
  ],
}

// Not ready — disabled, shown at the bottom with a "Coming Soon" label
const comingSoonGroup: NavGroup = {
  label: "Coming Soon",
  items: [
    {
      title: "Operational Efficiency",
      href: "/monthly-execution",
      icon: Gauge,
      disabled: true,
      children: [
        { title: "Monthly Execution",         href: "/monthly-execution", icon: CalendarCheck  },
        { title: "Subcontractor Performance", href: "/subcontractors",    icon: ClipboardCheck },
      ],
    },
    { title: "HVAC Project Monitoring", href: "/project-monitoring", image: "/images/sublogo_hvac.png", disabled: true },
    { title: "Fuel Control",            href: "/fuel",               icon: Fuel, disabled: true },
  ],
}

const bottomGroup: NavGroup = {
  label: "Data Management",
  items: [
    { title: "Forecast Data Control",  href: "/data-control",                icon: ClipboardList, permKey: "data_control"         },
    { title: "Schedule Management",    href: "/building-schedule/manage",    icon: Building2,     permKey: "building_schedule"    },
    { title: "WEX Categorization",    href: "/wex-categorization", icon: CreditCard,    permKey: "wex_categorization" },
    {
      title: "QBTime Reports", href: "/autolog",
      image: "/images/icon_qbtime.png", imageDark: "/images/icon_qbtime_dark.png",
      // No direct permKey — visibility driven by children
      children: [
        { title: "Auto Log",             href: "/autolog",              icon: ImageIcon,     permKey: "autolog"           },
        { title: "Daily Report",         href: "/qbtime/daily-report",  icon: CalendarDays,  permKey: "daily_report"      },
        { title: "Pay Period Report",    href: "/qbtime/job-costing",   icon: ScrollText,    permKey: "pay_period_report" },
        { title: "Weekly Hours Control", href: "/weekly-hours-control", icon: CalendarClock, permKey: "weekly_hours"      },
      ],
    },
    { title: "Settings", href: "/settings", icon: Settings, permKey: "settings" },
  ],
}

function NavItemIcon({ item }: { item: NavItem }) {
  if (item.image) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.image} alt={item.title}
          className={`h-4 w-4 object-contain${item.imageDark ? " dark:hidden" : ""}`}
        />
        {item.imageDark && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageDark} alt={item.title} className="hidden h-4 w-4 object-contain dark:block" />
        )}
      </>
    )
  }
  if (item.icon) return <item.icon />
  return null
}

function CollapsedSubmenu({ item, isActive, canEdit, onEditOpen }: { item: NavItem; isActive: (href: string) => boolean; canEdit: (k: string) => boolean; onEditOpen: (item: NavItem) => void }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function enter() {
    clearTimeout(timeout.current)
    setShow(true)
  }

  function leave() {
    timeout.current = setTimeout(() => setShow(false), 150)
  }

  function getPopupStyle(): React.CSSProperties {
    if (!ref.current) return { left: 0, top: 0 }
    const rect = ref.current.getBoundingClientRect()
    const itemCount = (item.children?.length ?? 0) + (item.editPermKey && canEdit(item.editPermKey) ? 1 : 0)
    const estimatedH = 40 + itemCount * 36   // label row + per-item height
    const flipUp = rect.top + estimatedH > window.innerHeight - 8
    return {
      left: rect.right,
      ...(flipUp
        ? { bottom: window.innerHeight - rect.bottom }
        : { top: rect.top }),
    }
  }

  return (
    <div ref={ref} className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <SidebarMenuButton isActive={item.children?.some((c) => isActive(c.href)) ?? false}>
        <NavItemIcon item={item} />
        <span>{item.title}</span>
      </SidebarMenuButton>

      {show && item.children && (
        <div
          className="fixed z-[200] ml-1 flex min-w-[160px] flex-col gap-1 rounded-lg border bg-popover p-1.5 shadow-lg"
          style={getPopupStyle()}
          onMouseEnter={enter}
          onMouseLeave={leave}
        >
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{item.title}</div>
          {item.children.map((child) => (
            child.disabled ? (
              <div
                key={child.href + child.title}
                className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-sm opacity-40"
              >
                {child.icon ? <child.icon className="h-3.5 w-3.5" /> : null}
                {child.title}
              </div>
            ) : (
              <Link
                key={child.href + child.title}
                href={child.href}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
                  isActive(child.href) ? "bg-accent font-medium text-accent-foreground" : "text-popover-foreground"
                }`}
                onClick={() => setShow(false)}
              >
                {child.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={child.image} alt={child.title} className="h-4 w-4 object-contain" />
                ) : child.icon ? (
                  <child.icon className="h-3.5 w-3.5" />
                ) : null}
                {child.title}
              </Link>
            )
          ))}
          {item.editPermKey && canEdit(item.editPermKey) && (
            <>
              <div className="my-1 h-px bg-border/60" />
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => { setShow(false); onEditOpen(item) }}
              >
                <Settings className="h-3.5 w-3.5" />
                Manage Data
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function NavGroupItems({
  items,
  open,
  isActive,
  isGroupActive,
  isItemExpanded,
  toggleExpanded,
  canEdit,
  onEditOpen,
}: {
  items: NavItem[]
  open: boolean
  isActive: (href: string) => boolean
  isGroupActive: (item: NavItem) => boolean
  isItemExpanded: (item: NavItem) => boolean
  toggleExpanded: (title: string) => void
  canEdit: (permKey: string) => boolean
  onEditOpen: (item: NavItem) => void
}) {
  const router = useRouter()
  return (
    <SidebarMenu>
      {items.map((item) =>
        item.children ? (
          <SidebarMenuItem key={item.title}>
            {!open ? (
              item.disabled ? (
                <SidebarMenuButton disabled className="cursor-not-allowed opacity-40" tooltip="Coming soon">
                  <NavItemIcon item={item} />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              ) : (
                <CollapsedSubmenu item={item} isActive={isActive} canEdit={canEdit} onEditOpen={onEditOpen} />
              )
            ) : item.disabled ? (
              <SidebarMenuButton disabled className="cursor-not-allowed opacity-40" tooltip="Coming soon">
                <NavItemIcon item={item} />
                <span>{item.title}</span>
                <ChevronDown className="ml-auto h-4 w-4 -rotate-90" />
              </SidebarMenuButton>
            ) : (
              <>
                <SidebarMenuButton
                  isActive={isGroupActive(item)}
                  tooltip={item.title}
                  onClick={() => toggleExpanded(item.title)}
                  className={item.editPermKey && canEdit(item.editPermKey) ? "peer !pr-14" : ""}
                >
                  <NavItemIcon item={item} />
                  <span>{item.title}</span>
                  {/* Chevron inside button for no-gear items — no nested-button issue */}
                  {!(item.editPermKey && canEdit(item.editPermKey)) && (
                    <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${isItemExpanded(item) ? "rotate-0" : "-rotate-90"}`} />
                  )}
                </SidebarMenuButton>
                {/* Chevron sibling for gear items — mirrors button color via peer classes */}
                {item.editPermKey && canEdit(item.editPermKey) && (
                  <span className="pointer-events-none absolute right-1 top-0 flex h-8 w-6 items-center justify-center peer-hover/menu-button:text-sidebar-accent-foreground peer-data-active/menu-button:text-sidebar-accent-foreground">
                    <ChevronDown className={`h-4 w-4 transition-transform ${isItemExpanded(item) ? "rotate-0" : "-rotate-90"}`} />
                  </span>
                )}
                {/* Manage Data gear — right-7 (28px from right), starts exactly where chevron ends */}
                {item.editPermKey && canEdit(item.editPermKey) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger render={
                        <SidebarMenuAction
                          showOnHover
                          onClick={e => { e.preventDefault(); e.stopPropagation(); onEditOpen(item) }}
                          className="right-7 hover:bg-primary/15 hover:text-primary focus-visible:bg-primary/15 focus-visible:text-primary"
                        />
                      }>
                        <Settings className="h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent side="right">Manage Data</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {isItemExpanded(item) && (
                  <SidebarMenuSub className="gap-1 py-1">
                    {item.children.map((child) => (
                      <SidebarMenuSubItem key={child.title + child.href}>
                        {child.disabled ? (
                          <span className="flex cursor-not-allowed items-center gap-2 px-2 py-1.5 text-sm opacity-40">
                            {child.icon ? <child.icon className="h-3.5 w-3.5" /> : null}
                            {child.title}
                          </span>
                        ) : (
                          <SidebarMenuSubButton
                            isActive={isActive(child.href)}
                            render={<Link href={child.href} />}
                          >
                            {child.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={child.image} alt={child.title} className="h-4 w-4 object-contain" />
                            ) : child.icon ? (
                              <child.icon className="h-3.5 w-3.5" />
                            ) : null}
                            <span>{child.title}</span>
                          </SidebarMenuSubButton>
                        )}
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </>
            )}
          </SidebarMenuItem>
        ) : (
          <SidebarMenuItem key={item.title + item.href}>
            {item.disabled ? (
              <SidebarMenuButton disabled className="cursor-not-allowed opacity-40" tooltip="Coming soon">
                <NavItemIcon item={item} />
                <span>{item.title}</span>
              </SidebarMenuButton>
            ) : (
              <>
                <SidebarMenuButton
                  isActive={isActive(item.href)}
                  render={<Link href={item.href} />}
                  tooltip={item.title}
                  className={(item.editPermKey && canEdit(item.editPermKey)) || item.metricsHref ? "peer" : ""}
                >
                  <NavItemIcon item={item} />
                  <span>{item.title}</span>
                </SidebarMenuButton>
                {item.metricsHref && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger render={
                        <SidebarMenuAction
                          showOnHover
                          onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(item.metricsHref!) }}
                          className={`hover:bg-primary/15 hover:text-primary focus-visible:bg-primary/15 focus-visible:text-primary ${item.editPermKey && canEdit(item.editPermKey) ? "right-7" : ""}`}
                        />
                      }>
                        <TrendingUp className="h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent side="right">See Metrics</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {item.editPermKey && canEdit(item.editPermKey) && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger render={
                        <SidebarMenuAction
                          showOnHover
                          onClick={e => { e.preventDefault(); onEditOpen(item) }}
                          className="hover:bg-primary/15 hover:text-primary focus-visible:bg-primary/15 focus-visible:text-primary"
                        />
                      }>
                        <Settings className="h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent side="right">Manage Data</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </>
            )}
          </SidebarMenuItem>
        )
      )}
    </SidebarMenu>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { open, toggleSidebar } = useSidebar()
  const [expanded, setExpanded] = useState<string[]>([])
  const [editItem, setEditItem] = useState<NavItem | null>(null)

  const { user } = useAuth()
  const { data: myPerms, isLoading: permsLoading } = useMyPermissions()

  const ADMIN_ROLES    = ["dev", "owner", "admin"]
  const FULL_ACCESS_ROLES = ["dev", "owner", "admin", "manager"]

  function canEdit(permKey: string): boolean {
    if (!user) return false
    if (ADMIN_ROLES.includes(user.role)) return true
    return myPerms?.permissions[permKey] === "write"
  }

  // canView: controls whether the nav item is rendered at all
  function canView(permKey: string): boolean {
    if (!user) return false
    if (FULL_ACCESS_ROLES.includes(user.role)) return true
    if (permsLoading) return true           // avoid flash while permissions load
    return !!myPerms?.permissions[permKey]  // "read" or "write" both grant visibility
  }

  // Filter nav items based on permissions; also filters children with permKeys
  function filterNavItems(items: NavItem[]): NavItem[] {
    return items.flatMap(item => {
      const childrenHavePermKeys = item.children?.some(c => !!c.permKey) ?? false

      if (childrenHavePermKeys) {
        // Parent visibility is determined by its children (e.g. QBTime Reports)
        const visibleChildren = item.children!.filter(c => !c.permKey || canView(c.permKey))
        if (visibleChildren.length === 0) return []
        return [{ ...item, children: visibleChildren }]
      }

      // Regular item gated by its own permKey
      if (item.permKey && !canView(item.permKey)) return []
      return [item]
    })
  }

  function isActive(href: string) {
    const [hrefPath, hrefQuery] = href.split("?")
    if (pathname !== hrefPath) return false
    if (hrefQuery) {
      // Link has query params — all must match the current URL
      const hrefParams = new URLSearchParams(hrefQuery)
      for (const [k, v] of hrefParams.entries()) {
        if (searchParams.get(k) !== v) return false
      }
    } else {
      // Link has no query params — only active when current URL also has no query
      if (searchParams.toString()) return false
    }
    return true
  }

  function isGroupActive(item: NavItem) {
    if (isActive(item.href)) return true
    return item.children?.some((c) => isActive(c.href)) ?? false
  }

  function toggleExpanded(title: string) {
    setExpanded((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    )
  }

  function isItemExpanded(item: NavItem) {
    return expanded.includes(item.title) || isGroupActive(item)
  }

  const groupProps = {
    open, isActive, isGroupActive, isItemExpanded, toggleExpanded, canEdit,
    onEditOpen: setEditItem,
  }

  const isPermitEdit         = editItem?.href === '/permits'
  const isServiceRequestEdit = editItem?.href === '/service-requests'
  const isWorkforceEdit      = editItem?.href === '/workforce-productivity'

  return (
    <>
    {/* Permit Control — opens full-screen data modal */}
    {isPermitEdit && (
      <PermitManageDataModal onClose={() => setEditItem(null)} />
    )}

    {/* Service Requests — opens full-screen data modal */}
    {isServiceRequestEdit && (
      <ServiceRequestManageDataModal onClose={() => setEditItem(null)} />
    )}

    {/* Workforce — opens full-screen data modal */}
    {isWorkforceEdit && (
      <WorkforceManageDataModal onClose={() => setEditItem(null)} />
    )}

    {/* Generic edit sheet for other items */}
    <Sheet open={!!editItem && !isPermitEdit && !isServiceRequestEdit && !isWorkforceEdit} onOpenChange={v => { if (!v) setEditItem(null) }}>
      <SheetContent side="right" className="w-[min(90vw,28rem)]">
        <SheetHeader className="border-b pb-4">
          <SheetTitle className="flex items-center gap-2">
            {editItem && <NavItemIcon item={editItem} />}
            {editItem?.title}
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Edit panel coming soon
        </div>
      </SheetContent>
    </Sheet>
    <Sidebar collapsible="icon" className="overflow-x-hidden">
      <SidebarHeader className="flex h-14 items-center justify-center border-b bg-background p-0">
        {open ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo_black.png" alt="Premium Group" className="h-6 object-contain dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo_white.png" alt="Premium Group" className="hidden h-6 object-contain dark:block" />
          </>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/minilogo_black.png" alt="Premium" className="h-6 w-6 object-contain dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/minilogo_white.png" alt="Premium" className="hidden h-6 w-6 object-contain dark:block" />
          </>
        )}
      </SidebarHeader>

      <SidebarContent className="overflow-x-hidden">

        {/* Active items — no label */}
        <SidebarGroup>
          <SidebarGroupContent>
            <NavGroupItems items={filterNavItems(activeGroup.items)} {...groupProps} />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Full-width separator */}
        <div className="h-px shrink-0 bg-sidebar-border" />

        {/* Coming Soon */}
        <SidebarGroup>
          {open && <SidebarGroupLabel className="text-muted-foreground/50">{comingSoonGroup.label}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <NavGroupItems items={comingSoonGroup.items} {...groupProps} />
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      {/* Data Management — always pinned to bottom, outside scroll area */}
      <SidebarFooter className="gap-0 overflow-x-hidden p-0">
        <div className="h-px bg-sidebar-border" />
        <SidebarGroup>
          {open && <SidebarGroupLabel>{bottomGroup.label}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <NavGroupItems items={filterNavItems(bottomGroup.items)} {...groupProps} />
          </SidebarGroupContent>
        </SidebarGroup>
        <div className="h-px bg-sidebar-border" />
        <SidebarMenu className="p-2">
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggleSidebar} tooltip="Toggle sidebar">
              {open ? <PanelLeftClose /> : <PanelLeftOpen />}
              <span>Collapse</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
    </>
  )
}
