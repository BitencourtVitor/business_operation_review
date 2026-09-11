import type { Metadata } from "next"
import { AtlasHeader } from "@/components/atlas/atlas-header"
import { AtlasSidebar } from "@/components/atlas/atlas-sidebar"
import { AuthGuard } from "@/components/auth/auth-guard"
import { OfflineProvider } from "@/components/atlas/offline-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { cookies } from "next/headers"

// Mesma casca do BOR — sidebar com a logo, colapso, header com título e frase —
// e conteúdo diferente, porque são produtos diferentes. O que os dois
// compartilham de verdade é a sessão: o AuthGuard é o mesmo dos dois lados,
// porque a autorização é da plataforma.
//
// Route group próprio ainda assim: as opções do menu do Atlas não têm nada a ver
// com as do BOR, e herdar a sidebar de lá traria as páginas erradas junto.
export const metadata: Metadata = {
  title: "Atlas Project Control",
}

export default async function AtlasLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  // Colapsada por natureza. O Atlas é leitor de planta: a largura vale mais como
  // desenho do que como menu, e quem chega quer a prancha, não a navegação.
  //
  // Quem expande sobrescreve a natureza para sempre, porque o próprio
  // SidebarProvider grava a escolha em cookie ao alternar. Então isto é o
  // estado de quem nunca opinou, e não uma preferência imposta a cada visita.
  const sidebarOpen = cookieStore.get("sidebar_state")?.value === "true"
  return (
    <AuthGuard>
      {/* O offline liga aqui, e só aqui: o BOR não é aplicação de campo, e
          um Service Worker registrado para ele guardaria casca que ninguém usa. */}
      <OfflineProvider>
      {/* A casca tem a altura exata da área visível, e só o conteúdo rola.
          `100vh` no celular inclui a barra do navegador: a moldura ficava maior
          que a tela e a página inteira rolava. `dvh` acompanha o que aparece.

          O conteúdo ocupa o que sobra do cabeçalho por flex, e não por conta
          (`100vh - 3.5rem`): a conta precisava repetir a altura do cabeçalho, e
          no dia em que ela mudasse o fim da lista ficaria escondido atrás da
          borda. O `overscroll-contain` impede que o fim de uma lista puxe a
          página. */}
      <SidebarProvider defaultOpen={sidebarOpen} className="atlas-shell h-dvh min-h-0 overflow-hidden">
        <AtlasSidebar />
        <SidebarInset className="min-h-0 min-w-0 overflow-x-hidden">
          <AtlasHeader />
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
      </OfflineProvider>
    </AuthGuard>
  )
}
