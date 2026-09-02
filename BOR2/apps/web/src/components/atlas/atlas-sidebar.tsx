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
import { AtlasJobsitePicker } from "@/components/atlas/atlas-jobsite-picker"
import { onLastJobsiteCleared, readLastJobsite, writeLastJobsite } from "@/components/atlas/last-jobsite"
import { useAtlasJobsite } from "@/hooks/use-atlas"
import { usePermission } from "@/hooks/use-permission"
import {
  ClipboardList, FolderOpen, Images, ListChecks,
  Notebook, PanelLeftClose, PanelLeftOpen, Ruler, ShieldCheck,
  Settings,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

// As abas da sala da obra vivem aqui, e não dentro da página: a navegação do
// Atlas é a mesma do BOR — sidebar à esquerda, conteúdo à direita. A aba entra
// na URL (`?tab=`) para o link do menu ser um link de verdade, com histórico.
const ROOM_TABS = [
  { key: "documents", title: "Documents", icon: FolderOpen },
  { key: "photos",    title: "Photos",   icon: Images },
  { key: "tasks",     title: "Tasks",    icon: ListChecks },
  { key: "diary",     title: "Diary",    icon: Notebook },
] as const

// O que o Fieldwire e o Buildertrend fazem e o Atlas ainda não faz.
//
// Ficam visíveis e desabilitados de propósito: é o mapa do que falta, à vista de
// quem usa e de quem prioriza. Escondido, vira lista em documento que ninguém
// abre.
const SOON = [
  { title: "Reports", icon: ClipboardList, note: "What happened on site, exported" },
  // Um item só, e não dois: a medição do material é feita pela IA, então
  // separá-la de "AI insights" seria anunciar duas telas para uma coisa. Ela
  // lê o plan set, tria as páginas que têm material e mede o que dá para medir.
  { title: "Takeoff", icon: Ruler, note: "AI reads the plan set and measures the material on it" },
] as const

export function AtlasSidebar() {
  const { open, toggleSidebar } = useSidebar()
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const params = useSearchParams()

  // A obra em foco sai da própria rota: /atlas/<id> e tudo abaixo dela.
  const config = ["/atlas/settings", "/atlas/definitions", "/atlas/users"]
  const inJobsiteRoute = pathname.startsWith("/atlas/")
    && !config.some(route => pathname.startsWith(route))
  const routeJobsiteId = inJobsiteRoute ? pathname.split("/")[2] : ""

  // Entrar em Settings não é largar a obra. A rota de configuração não carrega
  // id, então a última obra aberta vem do registro do navegador — só o botão de
  // limpar a esquece.
  const [remembered, setRemembered] = useState("")
  useEffect(() => {
    if (routeJobsiteId) {
      writeLastJobsite(routeJobsiteId)
      setRemembered(routeJobsiteId)
    } else {
      setRemembered(readLastJobsite())
    }
  }, [routeJobsiteId, pathname])

  // Largar a obra estando já na Project List não muda a rota, então o efeito
  // acima não roda: o aviso é o que faz a barra esquecê-la na hora.
  useEffect(() => onLastJobsiteCleared(() => setRemembered("")), [])

  const jobsiteId = routeJobsiteId || remembered
  const { data: jobsite } = useAtlasJobsite(jobsiteId)
  const { canView } = usePermission()

  const tab = params.get("tab") ?? "documents"
  const inRoom = !!jobsiteId
  const expanded = open || isMobile

  return (
    <Sidebar collapsible="icon" className="overflow-x-hidden">
      <SidebarHeader className="flex h-14 items-center justify-center border-b bg-background p-0">
        {(open || isMobile) ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo_black.png" alt="Premium Group" className="h-6 object-contain md:max-lg:h-5 dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo_white.png" alt="Premium Group" className="hidden h-6 object-contain md:max-lg:h-5 dark:block" />
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
        {/* Obra e navegação da obra num bloco só: as abas não são seções do
            produto, são o que existe dentro daquela obra. Separá-las em outro
            grupo obrigava a repetir o nome dela como rótulo — a mesma
            informação duas vezes, uma delas truncada. */}
        <SidebarGroup>
          <SidebarGroupContent>
            {/* Colapsada, a moldura não tem o que emoldurar: sobra uma caixa em
                volta de cinco ícones soltos, e a borda de 1px ainda empurrava
                estes itens para fora do prumo dos de baixo. */}
            <div className={expanded ? "overflow-hidden rounded-lg border border-sidebar-border" : ""}>
              <AtlasJobsitePicker currentId={jobsiteId} />

              {/* As abas entram uma depois da outra, e a chave carrega o id da
                  obra para a sequência tocar de novo a cada troca. Escolher a
                  obra enchia a barra de um quadro para o outro, e o que muda de
                  lugar sem transição a pessoa tem de reencontrar. */}
              {inRoom && (
                <div
                  key={jobsiteId}
                  className={`duration-300 animate-in fade-in-0 ${
                    expanded
                      ? "border-t border-sidebar-border bg-gradient-to-b from-sidebar-accent/15 to-transparent p-1"
                      : ""
                  }`}
                >
                  <SidebarMenu>
                    {ROOM_TABS.map((item, i) => (
                      <SidebarMenuItem
                        key={item.key}
                        className="fill-mode-backwards duration-300 animate-in fade-in-0 slide-in-from-left-2"
                        style={{ animationDelay: `${60 + i * 45}ms` }}
                      >
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
                    {/* Dizer quem entra na obra é permissão própria: nem todo
                        mundo que administra a obra decide quem a enxerga. */}
                    {canView("atlas_access") && (
                      <SidebarMenuItem
                        className="fill-mode-backwards duration-300 animate-in fade-in-0 slide-in-from-left-2"
                        style={{ animationDelay: `${60 + ROOM_TABS.length * 45}ms` }}
                      >
                        <SidebarMenuButton
                          isActive={pathname === `/atlas/${jobsiteId}` && tab === "access"}
                          tooltip="Manage Access"
                          render={<Link href={`/atlas/${jobsiteId}?tab=access`} />}
                        >
                          <ShieldCheck />
                          <span>Manage Access</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </div>
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

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
        {/* Configuração no fim da lista, como no BOR: ela não divide espaço com
            a navegação de quem está trabalhando. Definitions e Users vivem
            dentro dela. */}
        <SidebarMenu className="p-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.startsWith("/atlas/settings")
                || pathname.startsWith("/atlas/definitions")
                || pathname.startsWith("/atlas/users")}
              tooltip="Settings"
              render={<Link href="/atlas/settings" />}
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
