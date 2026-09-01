import { AuthGuard } from "@/components/auth/auth-guard"

// Route group próprio, fora de `(dashboard)`: o Atlas não herda a sidebar nem o
// header do BOR (AT-5). O que os dois compartilham é a sessão, e ela vem do
// AuthGuard — o mesmo dos dois lados, porque a autorização é da plataforma.
export default function AtlasLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-screen flex-col overflow-hidden">{children}</div>
    </AuthGuard>
  )
}
