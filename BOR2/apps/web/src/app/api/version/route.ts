import { NextResponse } from "next/server"

// A versão que está servindo agora, lida a cada chamada. O bundle que o
// navegador já baixou carrega a versão do momento em que foi construído
// (NEXT_PUBLIC_BUILD_SHA); as duas divergirem quer dizer que saiu deploy e a
// aba aberta está velha.
export const dynamic = "force-dynamic"

export function GET() {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA ?? ""
  return NextResponse.json({ sha }, { headers: { "Cache-Control": "no-store" } })
}
