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
  CalendarCheck,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileCheck,
  Fuel,
  Gauge,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Ruler,
  Settings,
  Users,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { useMyPermissions } from "@/hooks/use-settings"
import { useAuth } from "@/hooks/use-auth"

type SubItem = {
  title: string
  href: string
  icon?: React.ElementType
  image?: string
}

type NavItem = {
  title: string
  href: string
  icon?: React.ElementType
  image?: string
  imageDark?: string
  disabled?: boolean
  children?: SubItem[]
  editPermKey?: string   // permission key that grants the gear edit button
}

type NavGroup = {
  label?: string
  items: NavItem[]
}

const mainGroups: NavGroup[] = [
  {
    label: "Operations",
    items: [
      {
        title: "Operational Efficiency",
        href: "/monthly-execution",
        icon: Gauge,
        children: [
          { title: "Monthly Execution", href: "/monthly-execution", icon: CalendarCheck },
          { title: "Workforce Productivity", href: "/workforce", icon: Users },
          { title: "Subcontractor Performance", href: "/subcontractors", icon: ClipboardCheck },
        ],
      },
      { title: "Inventory Control", href: "/inventory", icon: Package },
      { title: "Permit Control",    href: "/permits",          icon: FileCheck, editPermKey: "permits"          },
      { title: "Service Requests",  href: "/service-requests", icon: Wrench,    editPermKey: "service_requests" },
      {
        title: "HVAC Project Monitoring",
        href: "/project-monitoring",
        image: "/images/sublogo_hvac.png",
        editPermKey: "project_monitoring",
      },
    ],
  },
  {
    label: "Finance & Analytics",
    items: [
      {
        title: "Framing Forecast", href: "/forecast",
        image: "/images/sublogo_framing.png",
        // imageDark: "/images/sublogo_framing_dark.png",  ← add when available
      },
      { title: "Operational Index", href: "/ofi", icon: BarChart2 },
      {
        title: "Accounting",
        href: "/accounting",
        icon: Banknote,
        disabled: true,
        children: [
          { title: "HVAC", href: "/accounting?company=hvac", image: "/images/sublogo_hvac.png" },
          { title: "Framing", href: "/accounting?company=framing", image: "/images/sublogo_framing.png" },
          { title: "PCG", href: "/accounting?company=pcg", image: "/images/sublogo_pcg.png" },
        ],
      },
      { title: "Fuel Control", href: "/fuel", icon: Fuel },
      { title: "Takeoff Works", href: "/takeoff", icon: Ruler, editPermKey: "takeoff" },
    ],
  },
]

const bottomGroup: NavGroup = {
  label: "Data Management",
  items: [
    { title: "Forecast Data Control", href: "/data-control", icon: ClipboardList },
    { title: "Quickbooks Time Auto Log", href: "/autolog", image: "/images/icon_qbtime.png", imageDark: "/images/icon_qbtime_dark.png" },
    { title: "Settings",              href: "/settings",      icon: Settings      },
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

function CollapsedSubmenu({ item, isActive }: { item: NavItem; isActive: (href: string) => boolean }) {
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

  return (
    <div ref={ref} className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <SidebarMenuButton isActive={item.children?.some((c) => isActive(c.href)) ?? false}>
        <NavItemIcon item={item} />
        <span>{item.title}</span>
      </SidebarMenuButton>

      {show && item.children && (
        <div
          className="fixed z-50 ml-1 flex min-w-[160px] flex-col gap-1 rounded-lg border bg-popover p-1.5 shadow-lg"
          style={{
            left: ref.current ? ref.current.getBoundingClientRect().right : 0,
            top: ref.current ? ref.current.getBoundingClientRect().top : 0,
          }}
          onMouseEnter={enter}
          onMouseLeave={leave}
        >
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{item.title}</div>
          {item.children.map((child) => (
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
          ))}
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
  return (
    <SidebarMenu>
      {items.map((item) =>
        item.children ? (
          <SidebarMenuItem key={item.title}>
            {!open ? (
              item.disabled ? (
                <SidebarMenuButton disabled className="cursor-not-allowed opacity-40" tooltip="Coming soon — QuickBooks integration pending">
                  <NavItemIcon item={item} />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              ) : (
                <CollapsedSubmenu item={item} isActive={isActive} />
              )
            ) : item.disabled ? (
              <SidebarMenuButton disabled className="cursor-not-allowed opacity-40" tooltip="Coming soon — QuickBooks integration pending">
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
                >
                  <NavItemIcon item={item} />
                  <span>{item.title}</span>
                  <ChevronDown
                    className={`ml-auto h-4 w-4 transition-transform ${
                      isItemExpanded(item) ? "rotate-0" : "-rotate-90"
                    }`}
                  />
                </SidebarMenuButton>
                {isItemExpanded(item) && (
                  <SidebarMenuSub>
                    {item.children.map((child) => (
                      <SidebarMenuSubItem key={child.title + child.href}>
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
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </>
            )}
          </SidebarMenuItem>
        ) : (
          <SidebarMenuItem key={item.title + item.href}>
            <SidebarMenuButton
              isActive={isActive(item.href)}
              render={<Link href={item.href} />}
              tooltip={item.title}
              className={item.editPermKey && canEdit(item.editPermKey) ? "peer" : ""}
            >
              <NavItemIcon item={item} />
              <span>{item.title}</span>
            </SidebarMenuButton>
            {item.editPermKey && canEdit(item.editPermKey) && (
              <SidebarMenuAction
                showOnHover
                title={`Manage ${item.title}`}
                onClick={e => { e.preventDefault(); onEditOpen(item) }}
              >
                <Settings className="h-3.5 w-3.5" />
              </SidebarMenuAction>
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
  const { data: myPerms } = useMyPermissions()

  const ADMIN_ROLES = ["dev", "owner", "admin"]

  function canEdit(permKey: string): boolean {
    if (!user) return false
    if (ADMIN_ROLES.includes(user.role)) return true
    return myPerms?.permissions[permKey] === "write"
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

  const groupProps = { open, isActive, isGroupActive, isItemExpanded, toggleExpanded, canEdit, onEditOpen: setEditItem }

  return (
    <>
    <Sheet open={!!editItem} onOpenChange={v => { if (!v) setEditItem(null) }}>
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
        {/* Main groups */}
        {mainGroups.map((group, index) => (
          <div key={index}>
            {index > 0 && <SidebarSeparator className="mx-0" />}
            <SidebarGroup>
              {group.label && open && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <NavGroupItems items={group.items} {...groupProps} />
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}

        {/* Bottom group — Data Management pinned to bottom */}
        <div className="mt-auto">
          <SidebarSeparator className="mx-0" />
          <SidebarGroup>
            {open && <SidebarGroupLabel>{bottomGroup.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <NavGroupItems items={bottomGroup.items} {...groupProps} />
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </SidebarContent>

      <SidebarFooter className="overflow-x-hidden">
        <div className="-mx-2 h-px bg-sidebar-border" />
        <SidebarMenu>
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
