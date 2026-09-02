import { NextResponse, type NextRequest } from "next/server"

// O BOR nasceu sozinho e ficou na raiz do site. Agora é um produto entre
// outros, e o endereço passou a dizer isso: `/bor/forecast` em vez de
// `/forecast`, do mesmo jeito que o Atlas sempre viveu em `/atlas`.
//
// Quem tem link antigo salvo — e-mail, favorito, mensagem no WhatsApp — não
// pode cair numa página que não existe mais. Este middleware faz a ponte.

const OLD_HOST = "pg-bor.up.railway.app"
const NEW_HOST = "pg-dip.up.railway.app"

// Os primeiros segmentos que o BOR ocupava na raiz. Só estes são movidos:
// `/atlas`, `/login` e `/select` são da plataforma e ficam onde estão.
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

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone()
  let redirect = false

  // O domínio antigo continua respondendo, mas manda para o novo em vez de
  // servir uma segunda cópia do site no mesmo endereço.
  const host = req.headers.get("host")
  if (host === OLD_HOST) {
    url.host = NEW_HOST
    url.port = ""
    url.protocol = "https"
    redirect = true
  }

  const segment = url.pathname.split("/")[1] ?? ""
  if (BOR_SEGMENTS.has(segment)) {
    url.pathname = `/bor${url.pathname}`
    redirect = true
  }

  // 308 e não 302: o endereço mudou de vez, e o navegador pode guardar isso.
  // O método também se preserva, então um POST antigo não vira GET no caminho.
  return redirect ? NextResponse.redirect(url, 308) : NextResponse.next()
}

export const config = {
  // Fora as rotas de API, o que o Next serve de estático e os arquivos com
  // extensão — nada disso muda de lugar.
  matcher: ["/((?!api|_next/static|_next/image|images|.*\\..*).*)"],
}
