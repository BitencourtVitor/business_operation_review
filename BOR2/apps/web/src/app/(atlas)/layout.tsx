import type { Metadata } from "next"
import { AtlasHeader } from "@/components/atlas/atlas-header"
import { AtlasSidebar } from "@/components/atlas/atlas-sidebar"
import { AuthGuard } from "@/components/auth/auth-guard"
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
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false"
  return (
    <AuthGuard>
      <SidebarProvider defaultOpen={sidebarOpen} className="atlas-shell">
        <AtlasSidebar />
        <SidebarInset className="min-w-0 overflow-x-hidden">
          <AtlasHeader />
          <main className="h-[calc(100vh-3.5rem)] overflow-y-auto p-6">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  )
}
