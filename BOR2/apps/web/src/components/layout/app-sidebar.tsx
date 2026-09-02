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
  CalendarX,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileCheck,
  FileText,
  Gauge,
  HandCoins,
  ImageIcon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  TrendingUp,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { usePermission } from "@/hooks/use-permission"
import { useIsMobile } from "@/hooks/use-mobile"
import { ManageDataModal as PermitManageDataModal }          from "@/app/bor/permits/manage-data-modal"
import { ManageDataModal as ServiceRequestManageDataModal } from "@/app/bor/service-requests/manage-data-modal"
import { ManageDataModal as WorkforceManageDataModal }      from "@/app/bor/workforce-productivity/manage-data-modal"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"

type SubItem = {
  title: string
  href: string
  icon?: React.ElementType
  image?: string
  permKey?: string       // permission key required to VIEW this sub-item
  devOnly?: boolean      // visible to everyone, but only the dev role can open it
  metricsHref?: string   // if set, shows a "See Metrics" action button linking here
}

type NavItem = {
  title: string
  href: string
  icon?: React.ElementType
  image?: string
  imageDark?: string
  children?: SubItem[]
  permKey?: string       // permission key required to VIEW this item
  editPermKey?: string   // permission key that grants the gear edit button (opens modal)
  metricsHref?: string   // if set, shows a "See Metrics" action button linking here
  badge?: string         // short label rendered opposite the title, where the chevron sits
  devOnly?: boolean      // visible to everyone, but only the dev role can open it
}

type NavGroup = {
  label?: string
  items: NavItem[]
}

const activeGroup: NavGroup = {
  items: [
    { title: "Monthly Execution",          href: "/bor/monthly-execution", icon: CalendarCheck, permKey: "monthly_execution" },
    { title: "Operational Forecast Index", href: "/bor/ofi",               icon: BarChart2,     permKey: "ofi"              },
    {
      // No direct permKey — visibility driven by children, one per division
      title: "Forecast", href: "/bor/forecast", icon: CalendarDays,
      children: [
        { title: "Framing", href: "/bor/forecast",      image: "/images/sublogo_framing.png", metricsHref: "/bor/forecast/metrics",      permKey: "forecast"      },
        { title: "HVAC",    href: "/bor/hvac-forecast", image: "/images/sublogo_hvac.png",    metricsHref: "/bor/hvac-forecast/metrics", permKey: "forecast_hvac" },
      ],
    },
    {
      title: "Workforce Productivity", href: "/bor/workforce-productivity", icon: Users,
      permKey: "workforce",
      editPermKey: "workforce",
      children: [
        { title: "Framing", href: "/bor/workforce-productivity?company=Framing", image: "/images/sublogo_framing.png" },
        { title: "HVAC",    href: "/bor/workforce-productivity?company=HVAC",    image: "/images/sublogo_hvac.png"    },
        { title: "PCG",     href: "/bor/workforce-productivity?company=PCG",     image: "/images/sublogo_pcg.png"     },
      ],
    },
    { title: "Inventory Control",  href: "/bor/inventory",         icon: Package,      permKey: "inventory"          },
    { title: "Permit Control",     href: "/bor/permits",           icon: FileCheck,    permKey: "permits", editPermKey: "permits" },
    { title: "Service Requests", href: "/bor/service-requests", icon: Wrench, permKey: "service_requests", editPermKey: "service_requests" },
    {
      title: "Accounting", href: "/bor/accounting", icon: Banknote,
      permKey: "accounting",
      children: [
        { title: "Framing", href: "/bor/accounting?company=framing",  image: "/images/sublogo_framing.png"  },
        { title: "HVAC",    href: "/bor/accounting?company=hvac",     image: "/images/sublogo_hvac.png"     },
        { title: "PCG",     href: "/bor/accounting?company=pcg",      image: "/images/sublogo_pcg.png"      },
      ],
    },
    {
      title: "Budget Control", href: "/bor/budget-control", icon: HandCoins,
      permKey: "budget_control",
      children: [
        { title: "Framing", href: "/bor/budget-control?company=framing", image: "/images/sublogo_framing.png" },
        { title: "HVAC",    href: "/bor/budget-control?company=hvac",    image: "/images/sublogo_hvac.png"     },
        { title: "PCG",     href: "/bor/budget-control?company=pcg",     image: "/images/sublogo_pcg.png"      },
      ],
    },
    { title: "Building Schedule", href: "/bor/building-schedule", icon: Building2, permKey: "building_schedule" },
    { title: "Subcontractor Docs", href: "/bor/subcontractor-docs", icon: FileText, permKey: "subcontractor_docs" },
    {
      title: "PCG Bids and Contracts", href: "/bor/pcg-bid-requests",
      // The square mark, not the full lockup — the wordmark is unreadable at 16px.
      image: "/images/icon_pcg.png",
      permKey: "pcg_bid_requests",
    },
  ],
}

const bottomGroup: NavGroup = {
  label: "Data Management",
  items: [
    {
      title: "Forecast Data Control", href: "/bor/data-control", icon: ClipboardList,
      children: [
        { title: "Framing", href: "/bor/data-control?division=framing", image: "/images/sublogo_framing.png", permKey: "data_control"      },
        { title: "HVAC",    href: "/bor/data-control?division=hvac",    image: "/images/sublogo_hvac.png",    permKey: "data_control_hvac" },
      ],
    },
    { title: "Schedule Management",    href: "/bor/building-schedule/manage",    icon: Building2,     permKey: "building_schedule"    },
    { title: "WEX Categorization",    href: "/bor/wex-categorization", icon: CreditCard,    permKey: "wex_categorization" },
    {
      title: "QBTime Reports", href: "/bor/autolog",
      image: "/images/icon_qbtime.png", imageDark: "/images/icon_qbtime_dark.png",
      // No direct permKey — visibility driven by children
      children: [
        { title: "Auto Log",             href: "/bor/autolog",                    icon: ImageIcon,     permKey: "autolog"           },
        { title: "Weekly Hours Control", href: "/bor/weekly-hours-control",       icon: CalendarClock, permKey: "weekly_hours"      },
        { title: "Who's Working",        href: "/bor/qbtime/whos-working",        icon: UserCheck,     permKey: "whos_working"      },
        { title: "Period Reports",       href: "/bor/qbtime/period-reports",      icon: Banknote,      permKey: "period_reports"    },
        { title: "Absence Control",      href: "/bor/qbtime/absences",            icon: CalendarX,     permKey: "absence_control"   },
      ],
    },
    { title: "Settings", href: "/bor/settings", icon: Settings, permKey: "settings" },
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

// Sits in the same slot the chevron uses on items with a company selector.
function NavItemBadge({ item }: { item: NavItem }) {
  if (!item.badge) return null
  return (
    <Badge
      variant="outline"
      className="ml-auto h-4 px-1.5 text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden"
    >
      {item.badge}
    </Badge>
  )
}

function CollapsedSubmenu({ item, isActive, canEdit, isDev, onEditOpen }: { item: NavItem; isActive: (href: string) => boolean; canEdit: (k: string) => boolean; isDev: boolean; onEditOpen: (item: NavItem) => void }) {
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
          {item.children.map((child) => {
            const icon = child.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={child.image} alt={child.title} className="h-4 w-4 object-contain" />
            ) : child.icon ? (
              <child.icon className="h-3.5 w-3.5" />
            ) : null

            if (child.devOnly && !isDev) {
              return (
                <span
                  key={child.href + child.title}
                  className="flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-sm text-popover-foreground opacity-40"
                >
                  {icon}
                  {child.title}
                  <span className="ml-auto rounded-sm border px-1 text-[9px] font-semibold uppercase tracking-wide">
                    Soon
                  </span>
                </span>
              )
            }

            return (
              <Link
                key={child.href + child.title}
                href={child.href}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
                  isActive(child.href) ? "bg-accent font-medium text-accent-foreground" : "text-popover-foreground"
                }`}
                onClick={() => setShow(false)}
              >
                {icon}
                {child.title}
              </Link>
            )
          })}
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
  isMobile,
  isActive,
  isGroupActive,
  isItemExpanded,
  toggleExpanded,
  canEdit,
  isDev,
  onEditOpen,
}: {
  items: NavItem[]
  open: boolean
  isMobile: boolean
  isActive: (href: string) => boolean
  isGroupActive: (item: NavItem) => boolean
  isItemExpanded: (item: NavItem) => boolean
  toggleExpanded: (title: string) => void
  canEdit: (permKey: string) => boolean
  isDev: boolean
  onEditOpen: (item: NavItem) => void
}) {
  const router = useRouter()
  return (
    <SidebarMenu>
      {items.map((item) => {
        // On mobile, every page except /forecast is locked — tapping redirects to /forecast
        if (isMobile && item.href !== "/bor/forecast") {
          return (
            <SidebarMenuItem key={item.title + item.href}>
              <SidebarMenuButton
                render={<Link href="/bor/forecast" />}
                className="opacity-40"
                tooltip="Mobile version coming soon"
              >
                <NavItemIcon item={item} />
                <span>{item.title}</span>
                <NavItemBadge item={item} />
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        }

        // Gear and metrics share the same right-hand slot; the chevron shifts left when one is present
        const hasGear    = !!item.editPermKey && canEdit(item.editPermKey)
        const hasMetrics = !!item.metricsHref
        const hasRightAction = hasGear || hasMetrics

        return item.children ? (
          <SidebarMenuItem key={item.title}>
            {!open ? (
              <CollapsedSubmenu item={item} isActive={isActive} canEdit={canEdit} isDev={isDev} onEditOpen={onEditOpen} />
            ) : (
              <>
                <SidebarMenuButton
                  isActive={isGroupActive(item)}
                  tooltip={item.title}
                  onClick={() => toggleExpanded(item.title)}
                  className={hasRightAction ? "peer !pr-14" : ""}
                >
                  <NavItemIcon item={item} />
                  <span>{item.title}</span>
                  {/* Chevron inside button when nothing else claims the right slot — no nested-button issue */}
                  {!hasRightAction && (
                    <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${isItemExpanded(item) ? "rotate-0" : "-rotate-90"}`} />
                  )}
                </SidebarMenuButton>
                {/* Chevron sibling when the right slot is taken — mirrors button color via peer classes */}
                {hasRightAction && (
                  <span className="pointer-events-none absolute right-1 top-0 flex h-8 w-6 items-center justify-center peer-hover/menu-button:text-sidebar-accent-foreground peer-data-active/menu-button:text-sidebar-accent-foreground">
                    <ChevronDown className={`h-4 w-4 transition-transform ${isItemExpanded(item) ? "rotate-0" : "-rotate-90"}`} />
                  </span>
                )}
                {/* See Metrics — right-7 (28px from right), starts exactly where chevron ends */}
                {hasMetrics && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger render={
                        <SidebarMenuAction
                          showOnHover
                          onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(item.metricsHref!) }}
                          className="right-7 hover:bg-primary/15 hover:text-primary focus-visible:bg-primary/15 focus-visible:text-primary"
                        />
                      }>
                        <TrendingUp className="h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent side="right">See Metrics</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {/* Manage Data gear — right-7 (28px from right), starts exactly where chevron ends */}
                {hasGear && (
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
                        <SidebarMenuSubButton
                          isActive={isActive(child.href)}
                          {...(child.devOnly && !isDev
                            ? { "aria-disabled": true, className: "cursor-not-allowed opacity-40" }
                            : { render: <Link href={child.href} /> })}
                        >
                          {child.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={child.image} alt={child.title} className="h-4 w-4 object-contain" />
                          ) : child.icon ? (
                            <child.icon className="h-3.5 w-3.5" />
                          ) : null}
                          <span>{child.title}</span>
                          {child.devOnly && !isDev && (
                            <span className="ml-auto rounded-sm border px-1 text-[9px] font-semibold uppercase tracking-wide">
                              Soon
                            </span>
                          )}
                        </SidebarMenuSubButton>
                        {child.metricsHref && !(child.devOnly && !isDev) && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger render={
                                <button
                                  type="button"
                                  onClick={e => { e.preventDefault(); e.stopPropagation(); router.push(child.metricsHref!) }}
                                  className="absolute right-1 top-0.5 flex h-5 w-5 items-center justify-center rounded-md text-sidebar-foreground opacity-0 transition-opacity hover:bg-primary/15 hover:text-primary focus-visible:opacity-100 group-hover/menu-sub-item:opacity-100"
                                />
                              }>
                                <TrendingUp className="h-3 w-3" />
                              </TooltipTrigger>
                              <TooltipContent side="right">See Metrics</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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
            {item.devOnly && !isDev ? (
              <SidebarMenuButton disabled className="cursor-not-allowed opacity-40" tooltip="Coming soon">
                <NavItemIcon item={item} />
                <span>{item.title}</span>
                <NavItemBadge item={item} />
              </SidebarMenuButton>
            ) : (
            <SidebarMenuButton
              isActive={isActive(item.href)}
              render={<Link href={item.href} />}
              tooltip={item.title}
              className={(item.editPermKey && canEdit(item.editPermKey)) || item.metricsHref ? "peer" : ""}
            >
              <NavItemIcon item={item} />
              <span>{item.title}</span>
              <NavItemBadge item={item} />
            </SidebarMenuButton>
            )}
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
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { open, toggleSidebar } = useSidebar()
  const isMobile = useIsMobile()
  const [expanded, setExpanded] = useState<string[]>([])
  const [editItem, setEditItem] = useState<NavItem | null>(null)

  const { canView, canEdit, isDev } = usePermission()

  // Filter nav items based on permissions; also filters children with permKeys
  function filterNavItems(items: NavItem[]): NavItem[] {
    return items.flatMap(item => {
      const childrenHavePermKeys = item.children?.some(c => !!c.permKey) ?? false

      if (childrenHavePermKeys) {
        // Parent visibility is determined by its children (e.g. QBTime Reports)
        const visibleChildren = item.children?.filter(c => !c.permKey || canView(c.permKey)) ?? []
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
    open: isMobile ? true : open,
    isMobile,
    isActive, isGroupActive, isItemExpanded, toggleExpanded, canEdit, isDev,
    onEditOpen: setEditItem,
  }

  const isPermitEdit         = editItem?.href === '/bor/permits'
  const isServiceRequestEdit = editItem?.href === '/bor/service-requests'
  const isWorkforceEdit      = editItem?.href === '/bor/workforce-productivity'

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
        {(open || isMobile) ? (
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

      </SidebarContent>

      {/* Data Management — always pinned to bottom, outside scroll area */}
      <SidebarFooter className="gap-0 overflow-x-hidden p-0">
        <div className="h-px bg-sidebar-border" />
        <SidebarGroup>
          {(open || isMobile) && <SidebarGroupLabel>{bottomGroup.label}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <NavGroupItems items={filterNavItems(bottomGroup.items)} {...groupProps} />
          </SidebarGroupContent>
        </SidebarGroup>
        <div className="h-px bg-sidebar-border" />
        {isMobile ? (
          <div className="px-4 py-3 text-xs leading-relaxed text-muted-foreground/70">
            Mobile versions for other pages are on the way. Full experience available on desktop.
          </div>
        ) : (
          <SidebarMenu className="p-2">
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleSidebar} tooltip="Toggle sidebar">
                {open ? <PanelLeftClose /> : <PanelLeftOpen />}
                <span>Collapse</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
    </>
  )
}
