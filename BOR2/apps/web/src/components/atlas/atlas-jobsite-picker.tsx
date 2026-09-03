"use client"

import { useSidebar } from "@/components/ui/sidebar"
import { clearLastJobsite } from "@/components/atlas/last-jobsite"
import { KIND_META, placeLabel } from "@/components/atlas/jobsite-form-dialog"
import { useAtlasJobsites } from "@/hooks/use-atlas"
import { MapPinned, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

// A obra não é um item de menu: é o contexto de tudo que a sidebar mostra
// abaixo dela. Por isso ocupa um bloco próprio no topo, com cara de campo e não
// de botão.
//
// Trocar de obra sem largar a atual era uma busca dentro da barra, com filtros
// e tudo. Não valia o peso: quem quer outra obra larga esta no X e escolhe na
// Project List, que é onde as obras já se procuram.

export function AtlasJobsitePicker({ currentId }: { currentId: string }) {
  const { data: jobsites = [] } = useAtlasJobsites()
  const { open: sidebarOpen, isMobile } = useSidebar()
  const router = useRouter()

  const current = jobsites.find(j => j.id === currentId)
  const CurrentIcon = current ? (KIND_META[current.kind]?.icon ?? MapPinned) : MapPinned
  const expanded = sidebarOpen || isMobile

  // Colapsada, a obra é um alvo do tamanho dos outros, e não uma faixa que
  // atravessa a barra. O que a distingue é o preenchimento: ela é o contexto de
  // tudo que vem abaixo, e não mais um destino.
  if (!expanded) {
    return (
      <Link
        href="/atlas"
        title={current ? current.name : "Pick a project"}
        className={`mx-auto mb-1 flex size-8 items-center justify-center rounded-md border transition-colors ${
          current
            ? "border-sidebar-border bg-sidebar-accent text-foreground hover:bg-sidebar-accent/70"
            : "border-dashed border-sidebar-border text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        }`}
      >
        <CurrentIcon className="h-4 w-4 shrink-0" />
      </Link>
    )
  }

  return (
    <div className="flex items-stretch bg-sidebar-accent/40">
      <div className="min-w-0 flex-1 px-2.5 py-2 leading-tight">
        {current ? (
          // A chave é o id: trocar de obra reanima o bloco, então a
          // identificação nova entra em vez de aparecer trocada no lugar.
          //
          // Do geral ao particular: cliente, lugar, e por fim a obra. A
          // identificação vem por último porque é onde a leitura chega, e é ela
          // que ganha o destaque, sendo como a obra é chamada no dia a dia.
          <div key={current.id} className="flex flex-col duration-300 animate-in fade-in-0 slide-in-from-top-1">
            <span className="block truncate text-[10px] uppercase tracking-wide text-muted-foreground">
              {current.client || "No client"}
            </span>
            {/* A mesma regra do cartão da Project List: sai só o miolo, que é
                a cidade e se repete em toda obra da comunidade. O estado fica,
                porque é ele que separa duas comunidades de nome parecido. O
                nome por extenso está no bloco Project, dentro da obra. */}
            <span className="block text-xs leading-snug text-muted-foreground">
              {placeLabel(current.community || current.name)}
            </span>
            {/* "Building Panels" é o rótulo mais longo da taxonomia, e em tablet
                a barra tem 122px: a 14px ele quebra em duas linhas e a obra
                aparece partida ao meio. Meio ponto a menos, e só nessa faixa,
                resolve sem mexer no resto. */}
            <span className={`mt-0.5 flex items-center gap-1.5 text-sm font-medium ${
              current.kind === "panels" ? "md:max-lg:text-[12.5px]" : ""
            }`}>
              <CurrentIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {[KIND_META[current.kind]?.label ?? current.kind, current.unit]
                .filter(Boolean).join(" ")}
            </span>
          </div>
        ) : (
          <Link href="/atlas" className="block">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              Project
            </span>
            <span className="block truncate text-sm font-medium">Select a project</span>
          </Link>
        )}
      </div>

      {current && (
        <div className="flex shrink-0 flex-col border-l border-sidebar-border">
          <button
            type="button"
            title="Clear selected project"
            onClick={() => { clearLastJobsite(); router.push("/atlas") }}
            className="flex flex-1 items-center justify-center px-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
