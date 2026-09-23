import { NextResponse, type NextRequest } from "next/server"

// O BOR nasceu sozinho e ficou na raiz do site. Agora é um produto entre
// outros, e o endereço passou a dizer isso: `/bor/forecast` em vez de
// `/forecast`, do mesmo jeito que o Atlas sempre viveu em `/atlas`.
//
// Quem tem link antigo salvo — e-mail, favorito, mensagem no WhatsApp — não
// pode cair numa página que não existe mais. Este middleware faz a ponte.

// Os primeiros segmentos que o BOR ocupava na raiz. Só estes são movidos:
// `/login` fica onde está.
const BOR_SEGMENTS = new Set([
  "accounting",
  "autolog",
  "bor1-explorer",
  "budget-control",
  "building-schedule",
  "dashboard",
  "data-control",
  "forecast",
  "forecast-improvement",
  "hvac-forecast",
  "hvac-schedule",
  "inventory",
  "monthly-execution",
  "ofi",
  "pcg-bid-requests",
  "permits",
  "qbtime",
  "service-requests",
  "settings",
  "subcontractor-docs",
  "subcontractors",
  "timesheet",
  "upload-timesheet",
  "weekly-hours-control",
  "wex-categorization",
  "workforce",
  "workforce-productivity",
])

// O Atlas saiu do BOR e virou o BuilderLog, outro site. Por enquanto todo
// endereço antigo do Atlas cai no login de lá, sem levar o caminho junto.
// 307 e não 308: é provisório, e o navegador guarda o 308 para sempre, o que
// impediria trocar isto depois por um destino equivalente página a página.
const BUILDERLOG_LOGIN = "https://builderlog.co/login"

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/atlas" || req.nextUrl.pathname.startsWith("/atlas/")) {
    return NextResponse.redirect(BUILDERLOG_LOGIN, 307)
  }

  const segment = req.nextUrl.pathname.split("/")[1] ?? ""
  if (!BOR_SEGMENTS.has(segment)) return NextResponse.next()

  // 308 e não 302: o endereço mudou de vez, e o navegador pode guardar isso.
  // O método também se preserva, então um POST antigo não vira GET no caminho.
  const url = req.nextUrl.clone()
  url.pathname = `/bor${url.pathname}`
  return NextResponse.redirect(url, 308)
}

export const config = {
  // Fora as rotas de API, o que o Next serve de estático e os arquivos com
  // extensão — nada disso muda de lugar.
  matcher: ["/((?!api|_next/static|_next/image|images|.*\\..*).*)"],
}
