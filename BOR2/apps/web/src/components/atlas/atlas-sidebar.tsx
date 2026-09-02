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
  useSidebar,
} from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/use-mobile"
import { useAtlasJobsite, useAtlasJobsites } from "@/hooks/use-atlas"
import {
  Bot, CalendarDays, ClipboardList, FileSpreadsheet, FolderOpen, Images, ListChecks,
  Map, Notebook, PanelLeftClose, PanelLeftOpen, Ruler, ScrollText, ShieldCheck,
  SlidersHorizontal, Users,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

// As abas da sala da obra vivem aqui, e não dentro da página: a navegação do
// Atlas é a mesma do BOR — sidebar à esquerda, conteúdo à direita. A aba entra
// na URL (`?tab=`) para o link do menu ser um link de verdade, com histórico.
const ROOM_TABS = [
  { key: "documents", title: "Documents", icon: FolderOpen },
  { key: "photos",    title: "Photos",   icon: Images },
  { key: "tasks",     title: "Tasks",    icon: ListChecks },
  { key: "diary",     title: "Diary",    icon: Notebook },
  { key: "calendar",  title: "Calendar", icon: CalendarDays },
] as const

// O que o Fieldwire e o Buildertrend fazem e o Atlas ainda não faz.
//
// Ficam visíveis e desabilitados de propósito: é o mapa do que falta, à vista de
// quem usa e de quem prioriza. Escondido, vira lista em documento que ninguém
// abre.
const SOON = [
  { title: "Specifications", icon: ScrollText,      note: "Spec book tied to the plan set" },
  { title: "Forms",          icon: FileSpreadsheet, note: "Checklists and inspections filled in the field" },
  { title: "Reports",        icon: ClipboardList,   note: "What happened on site, exported" },
  { title: "AI insights",    icon: Bot,             note: "Reads the plan set and answers about it" },
  { title: "Takeoff",        icon: Ruler,           note: "Measures wood framing straight off the drawing" },
] as const

export function AtlasSidebar() {
  const { open, toggleSidebar } = useSidebar()
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const params = useSearchParams()

  // A obra em foco sai da própria rota: /atlas/<id> e tudo abaixo dela.
  const inJobsiteRoute = pathname.startsWith("/atlas/")
    && !pathname.startsWith("/atlas/definitions")
    && !pathname.startsWith("/atlas/users")
  const jobsiteId = inJobsiteRoute ? pathname.split("/")[2] : ""
  const { data: jobsite } = useAtlasJobsite(jobsiteId)
  const { data: jobsites } = useAtlasJobsites()

  const tab = params.get("tab") ?? "documents"
  const inRoom = !!jobsiteId
  const recent = (jobsites ?? []).filter(j => j.id !== jobsiteId).slice(0, 6)

  return (
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
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/atlas"}
                  tooltip="Plans"
                  render={<Link href="/atlas" />}
                >
                  <Map />
                  <span>Plans</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/atlas/definitions")}
                  tooltip="Definitions"
                  render={<Link href="/atlas/definitions" />}
                >
                  <SlidersHorizontal />
                  <span>Definitions</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/atlas/users")}
                  tooltip="Users"
                  render={<Link href="/atlas/users" />}
                >
                  <Users />
                  <span>Users</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* A sala da obra só existe quando há obra aberta — um menu com as abas
            de nenhuma obra seria um menu que não leva a lugar nenhum. */}
        {inRoom && (
          <SidebarGroup>
            {(open || isMobile) && (
              <SidebarGroupLabel className="truncate">
                {jobsite?.name ?? "Jobsite"}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {ROOM_TABS.map(item => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      isActive={pathname === `/atlas/${jobsiteId}` && tab === item.key}
                      tooltip={item.title}
                      render={<Link href={`/atlas/${jobsiteId}?tab=${item.key}`} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {jobsite?.level === "manage" && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={pathname === `/atlas/${jobsiteId}` && tab === "access"}
                      tooltip="Access"
                      render={<Link href={`/atlas/${jobsiteId}?tab=access`} />}
                    >
                      <ShieldCheck />
                      <span>Access</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {recent.length > 0 && (
          <SidebarGroup>
            {(open || isMobile) && <SidebarGroupLabel>Other jobsites</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {recent.map(j => (
                  <SidebarMenuItem key={j.id}>
                    <SidebarMenuButton tooltip={j.name} render={<Link href={`/atlas/${j.id}`} />}>
                      <Map />
                      <span className="truncate">{j.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {/* O que ainda não existe fica separado por uma linha, como o botão de
            colapsar no rodapé: é uma seção de outra natureza, não mais um grupo
            de páginas. O rótulo em caixa alta e peso leve reforça que ele
            anuncia, em vez de navegar. */}
        <div className="h-px bg-sidebar-border" />
        <SidebarGroup>
          {(open || isMobile) && (
            <SidebarGroupLabel className="font-light uppercase tracking-wide">
              Soon
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {SOON.map(item => (
                <SidebarMenuItem key={item.title}>
                  <Tooltip>
                    <TooltipTrigger render={<span className="block" />}>
                      <SidebarMenuButton disabled className="cursor-not-allowed opacity-50">
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.note}</TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-0 overflow-x-hidden p-0">
        <div className="h-px bg-sidebar-border" />
        {isMobile ? (
          <div className="px-4 py-3 text-xs leading-relaxed text-muted-foreground/70">
            The plan reader is built for tablet and desktop. On a phone, expect the drawings
            to be hard to read.
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
  )
}
