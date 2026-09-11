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
 * alguém emite: qual pavimento, e o que mostrar.
 *
 * O padrão é a obra inteira com tudo, resolvido ou não, porque o relatório **não
 * é artefato de fechamento**: o uso mais frequente é levar para a reunião a
 * lista do que ainda falta, e um padrão que só mostra o que foi resolvido
 * esconderia justamente isso.
 */
export function PunchReportDialog({ jobsiteId, jobsiteName, open, onOpenChange }: {
  jobsiteId: string
  jobsiteName: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [pavimentos, setPavimentos] = useState<Array<{
    subcategory: string; open: number; resolved: number; total: number
  }>>([])
  const [geral, setGeral] = useState({ open: 0, resolved: 0, total: 0 })
  const [escopo, setEscopo] = useState("")
  const [condicao, setCondicao] = useState<"" | "open" | "resolved">("")
  const [gerando, setGerando] = useState(false)

  useEffect(() => {
    if (!open) return
    // A contagem vem junto da lista de pavimentos porque quem escolhe o escopo
    // quer saber o tamanho do que vai emitir. "Primeiro andar" sem número não
    // diz se são três pontos ou sessenta.
    void atlasService.punchSummary(jobsiteId).then(r => {
      setPavimentos(r.bySubcategory.filter(b => b.subcategory))
      setGeral(r.jobsite)
    }).catch(() => undefined)
  }, [jobsiteId, open])

  async function emitir() {
    setGerando(true)
    try {
      await gerarRelatorio({
        jobsiteId, jobsiteName,
        subcategory: escopo || undefined,
        status: condicao || undefined,
      })
      onOpenChange(false)
    } finally {
      setGerando(false)
    }
  }

  const alvo = escopo
    ? pavimentos.find(p => p.subcategory === escopo)
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
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Scope
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Opcao ativa={escopo === ""} onClick={() => setEscopo("")}>
                Whole job ({geral.total})
              </Opcao>
              {pavimentos.map(p => (
                <Opcao
                  key={p.subcategory}
                  ativa={escopo === p.subcategory}
                  onClick={() => setEscopo(p.subcategory)}
                >
                  {p.subcategory} ({p.total})
                </Opcao>
              ))}
            </div>
            {/* A taxonomia vazia é um estado real e frequente hoje, e calar sobre
                ele faria a pessoa achar que a obra não tem pavimento nenhum. */}
            {pavimentos.length === 0 && (
              <span className="text-xs text-muted-foreground">
                Nenhum pavimento definido nas pastas desta obra.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Show
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Opcao ativa={condicao === ""} onClick={() => setCondicao("")}>Everything</Opcao>
              <Opcao ativa={condicao === "open"} onClick={() => setCondicao("open")}>Open only</Opcao>
              <Opcao ativa={condicao === "resolved"} onClick={() => setCondicao("resolved")}>Done only</Opcao>
            </div>
          </div>

          <Button onClick={emitir} disabled={gerando || !quantos} className="gap-1.5">
            {gerando
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <FileDown className="h-3.5 w-3.5" />}
            {gerando ? "Montando…" : `Emitir ${quantos ?? 0} ponto(s)`}
          </Button>
          <p className="text-xs text-muted-foreground">
            Abre a caixa de impressão do navegador, que salva em PDF.
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
