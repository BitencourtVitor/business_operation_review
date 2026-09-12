"use client"

import { FileDown, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { atlasService } from "@/services/atlas.service"
import { gerarRelatorio } from "@/components/atlas/punch-report"

/**
 * Escolher o escopo antes de emitir.
 *
 * Duas perguntas, e as duas existem porque a resposta muda a cada vez que
 * alguém emite: qual escopo, e o que mostrar.
 *
 * O padrão é tudo, resolvido ou não, porque o relatório **não é artefato de
 * fechamento**: o uso mais frequente é levar para a reunião a lista do que ainda
 * falta, e um padrão que só mostra o que foi resolvido esconderia justamente
 * isso.
 *
 * Aberto de dentro de um escopo, ele já vem com aquele escopo e não pergunta de
 * novo: quem está olhando o primeiro andar e pede o relatório quer o do primeiro
 * andar.
 */
export function PunchReportDialog({ jobsiteId, jobsiteName, scope, open, onOpenChange }: {
  jobsiteId: string
  jobsiteName: string
  /** Preenchido quando o relatório sai de dentro de um escopo. */
  scope?: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [escopos, setEscopos] = useState<Array<{
    scopeValue: string; open: number; resolved: number; total: number
  }>>([])
  const [geral, setGeral] = useState({ open: 0, resolved: 0, total: 0 })
  const [escolhido, setEscolhido] = useState(scope ?? "")
  const [condicao, setCondicao] = useState<"" | "open" | "resolved">("")
  const [gerando, setGerando] = useState(false)
  const [vazio, setVazio] = useState(false)

  useEffect(() => { setEscolhido(scope ?? "") }, [scope, open])

  useEffect(() => {
    if (!open) return
    // A contagem vem junto da lista de escopos porque quem escolhe quer saber o
    // tamanho do que vai emitir. "First floor" sem número não diz se são três
    // pontos ou sessenta.
    void atlasService.punchSummary(jobsiteId).then(r => {
      setEscopos(r.bySubcategory.filter(b => b.scopeValue))
      setGeral(r.jobsite)
    }).catch(() => undefined)
  }, [jobsiteId, open])

  async function emitir() {
    setGerando(true)
    setVazio(false)
    try {
      await gerarRelatorio({
        jobsiteId, jobsiteName,
        scope: escolhido || undefined,
        status: condicao || undefined,
      })
      onOpenChange(false)
    } catch {
      setVazio(true)
    } finally {
      setGerando(false)
    }
  }

  const alvo = escolhido
    ? escopos.find(p => p.scopeValue === escolhido)
    : { open: geral.open, resolved: geral.resolved, total: geral.total }
  const quantos = condicao === "open" ? alvo?.open
    : condicao === "resolved" ? alvo?.resolved
    : alvo?.total

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Punch list report</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!scope && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Scope
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Opcao ativa={escolhido === ""} onClick={() => setEscolhido("")}>
                  Whole job ({geral.total})
                </Opcao>
                {escopos.map(p => (
                  <Opcao
                    key={p.scopeValue}
                    ativa={escolhido === p.scopeValue}
                    onClick={() => setEscolhido(p.scopeValue)}
                  >
                    {p.scopeValue} ({p.total})
                  </Opcao>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Show
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Opcao ativa={condicao === ""} onClick={() => setCondicao("")}>Everything</Opcao>
              <Opcao ativa={condicao === "open"} onClick={() => setCondicao("open")}>Pending only</Opcao>
              <Opcao ativa={condicao === "resolved"} onClick={() => setCondicao("resolved")}>Done only</Opcao>
            </div>
          </div>

          <Button onClick={emitir} disabled={gerando} className="gap-1.5">
            {gerando
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileDown className="h-3.5 w-3.5" />}
            {gerando
              ? "Building the document"
              : `Issue ${quantos ?? 0} ${quantos === 1 ? "point" : "points"}`}
          </Button>
          {vazio && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Nothing to issue with these filters.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {/* Dizer de onde sai o PDF evita o susto de quem espera um download
                e recebe a caixa de impressão. */}
            Opens the print dialog, which saves it as a PDF.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Opcao({ ativa, onClick, children }: {
  ativa: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        ativa
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}
