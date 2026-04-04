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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
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
  LayoutDashboard,
  LineChart,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Ruler,
  Settings,
  ShieldCheck,
  TrendingUp,
  Upload,
  Users,
  Watch,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRef, useState } from "react"

type SubItem = {
  title: string
  href: string
  icon?: React.ElementType
  image?: string
}

type NavItem = {
  title: string
  href: string
  icon: React.ElementType
  children?: SubItem[]
}

type NavGroup = {
  label?: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
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
      { title: "Permit Control", href: "/permits", icon: FileCheck },
      { title: "Service Requests", href: "/service-requests", icon: Wrench },
      {
        title: "Project Monitoring",
        href: "/project-monitoring",
        icon: ShieldCheck,
        children: [
          { title: "HVAC", href: "/project-monitoring", image: "/images/sublogo_hvac.png" },
        ],
      },
    ],
  },
  {
    label: "Finance & Analytics",
    items: [
      {
        title: "Forecast",
        href: "/forecast",
        icon: TrendingUp,
        children: [
          { title: "Framing", href: "/forecast", icon: TrendingUp },
          { title: "Metrics", href: "/forecast?tab=metrics", icon: LineChart },
          { title: "Operational Index", href: "/ofi", icon: BarChart2 },
        ],
      },
      {
        title: "Accounting",
        href: "/accounting",
        icon: Banknote,
        children: [
          { title: "HVAC", href: "/accounting?company=hvac", image: "/images/sublogo_hvac.png" },
          { title: "Framing", href: "/accounting?company=framing", image: "/images/sublogo_framing.png" },
          { title: "PCG", href: "/accounting?company=pcg", image: "/images/sublogo_pcg.png" },
        ],
      },
      { title: "Fuel Control", href: "/fuel", icon: Fuel },
      { title: "Timesheet", href: "/timesheet", icon: Watch },
      { title: "Takeoff Works", href: "/takeoff", icon: Ruler },
    ],
  },
  {
    label: "Data Management",
    items: [
      { title: "Data Control", href: "/data-control", icon: ClipboardList },
      { title: "Upload Timesheet", href: "/upload-timesheet", icon: Upload },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
]

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
        <item.icon />
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
}: {
  items: NavItem[]
  open: boolean
  isActive: (href: string) => boolean
  isGroupActive: (item: NavItem) => boolean
  isItemExpanded: (item: NavItem) => boolean
  toggleExpanded: (title: string) => void
}) {
  return (
    <SidebarMenu>
      {items.map((item) =>
        item.children ? (
          <SidebarMenuItem key={item.title}>
            {!open ? (
              <CollapsedSubmenu item={item} isActive={isActive} />
            ) : (
              <>
                <SidebarMenuButton
                  isActive={isGroupActive(item)}
                  tooltip={item.title}
                  onClick={() => toggleExpanded(item.title)}
                >
                  <item.icon />
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
            >
              <item.icon />
              <span>{item.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      )}
    </SidebarMenu>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { open, toggleSidebar } = useSidebar()
  const [expanded, setExpanded] = useState<string[]>([])

  function isActive(href: string) {
    return pathname === href.split("?")[0]
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

  return (
    <Sidebar collapsible="icon">
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

      <SidebarContent>
        {navGroups.map((group, index) => (
          <div key={index}>
            {index > 0 && <SidebarSeparator />}
            <SidebarGroup>
              {group.label && open && (
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <NavGroupItems
                  items={group.items}
                  open={open}
                  isActive={isActive}
                  isGroupActive={isGroupActive}
                  isItemExpanded={isItemExpanded}
                  toggleExpanded={toggleExpanded}
                />
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
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
  )
}
