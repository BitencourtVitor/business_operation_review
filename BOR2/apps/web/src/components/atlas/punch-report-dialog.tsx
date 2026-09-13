"use client"

import { CheckCircle2, FileDown, Layers, Loader2, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useIsMobile } from "@/hooks/use-mobile"
import { atlasService } from "@/services/atlas.service"
import { gerarRelatorio } from "@/components/atlas/punch-report"

/**
 * Escolher o que entra no relatório, e emitir.
 *
 * ── A mesma escolha, em duas peças ──
 *
 * No celular a escolha vem numa janela modal, porque ali não há espaço para
 * flutuar nada ao lado do botão. No tablet e no computador sobra tela: escurecer
 * a página inteira para fazer três perguntas é peso que a decisão não tem, e a
 * pessoa perde de vista a lista que ela estava olhando justamente para decidir.
 * Nesses dois a escolha sai num popover ancorado no próprio botão.
 *
 * A estrutura é uma só, e é a mesma nos dois lugares: três opções empilhadas,
 * cada uma com ícone, título e uma linha dizendo o que ela traz, e o botão de
 * emitir embaixo. Muda o invólucro, não o conteúdo.
 *
 * ── Por que o padrão é tudo ──
 *
 * O relatório não é artefato de fechamento: o uso mais frequente é levar para a
 * reunião a lista do que ainda falta. Um padrão que mostrasse só o resolvido
 * esconderia justamente isso.
 *
 * Aberto de dentro de um escopo, ele já vem com aquele escopo e não pergunta de
 * novo: quem está olhando o primeiro andar e pede o relatório quer o do primeiro
 * andar.
 */
export function PunchReportButton({ jobsiteId, jobsiteName, scope }: {
  jobsiteId: string
  jobsiteName: string
  /** Preenchido quando o relatório sai de dentro de um escopo. */
  scope?: string
}) {
  const celular = useIsMobile()
  const [open, setOpen] = useState(false)
  const [escopos, setEscopos] = useState<Array<{
    scopeValue: string; open: number; resolved: number; total: number
  }>>([])
  const [geral, setGeral] = useState({ open: 0, resolved: 0, total: 0 })
  const [escolhido, setEscolhido] = useState(scope ?? "")
  const [condicao, setCondicao] = useState<"" | "open" | "resolved">("")
  const [gerando, setGerando] = useState(false)
  const [vazio, setVazio] = useState(false)

  // Toda abertura recomeça em "tudo". A janela não desmonta entre uma emissão e
  // outra, então a escolha da vez passada ficava de pé: quem emitiu os pendentes
  // ontem abria hoje já filtrado, sem ter pedido, e o padrão do relatório é a
  // lista inteira.
  useEffect(() => {
    setEscolhido(scope ?? "")
    setCondicao("")
  }, [scope, open])

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
      setOpen(false)
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

  const corpo = (
    <div className="flex flex-col gap-3">
      {/* O escopo só se pergunta quando o relatório não nasceu dentro de um. */}
      {!scope && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Scope
          </span>
          <div className="flex flex-wrap gap-1.5">
            <Chip ativa={escolhido === ""} onClick={() => setEscolhido("")}>
              Whole job ({geral.total})
            </Chip>
            {escopos.map(p => (
              <Chip
                key={p.scopeValue}
                ativa={escolhido === p.scopeValue}
                onClick={() => setEscolhido(p.scopeValue)}
              >
                {p.scopeValue} ({p.total})
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Três opções empilhadas, e não três pastilhas numa fileira: cada uma tem
          uma consequência diferente no documento, e o rótulo sozinho não dizia
          qual. Com a linha de descrição a escolha se faz lendo, sem tentativa. */}
      <div className="flex flex-col gap-1.5">
        <Opcao
          ativa={condicao === ""}
          onClick={() => setCondicao("")}
          icone={Layers}
          tom="neutro"
          titulo="All points"
          descricao="Everything walked on this scope, pending and resolved"
          quantos={alvo?.total}
        />
        <Opcao
          ativa={condicao === "open"}
          onClick={() => setCondicao("open")}
          icone={TriangleAlert}
          tom="aberto"
          titulo="Pending points"
          descricao="Only what still has to be fixed"
          quantos={alvo?.open}
        />
        <Opcao
          ativa={condicao === "resolved"}
          onClick={() => setCondicao("resolved")}
          icone={CheckCircle2}
          tom="feito"
          titulo="Resolved points"
          descricao="Only what was fixed, with the proof of the fix"
          quantos={alvo?.resolved}
        />
      </div>

      <Button onClick={emitir} disabled={gerando} className="w-full gap-1.5">
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
    </div>
  )

  if (celular) {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5"
          onClick={() => setOpen(true)}
        >
          <FileDown className="h-3.5 w-3.5" />
          <span>Report</span>
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Punch list report</DialogTitle>
            </DialogHeader>
            {corpo}
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5" />}>
        <FileDown className="h-3.5 w-3.5" />
        <span>Report</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-3">
        <span className="mb-2 flex text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Punch list report
        </span>
        {corpo}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Uma escolha, com o que ela faz escrito embaixo do nome.
 *
 * Selecionada, ela veste o tema de seleção da casa: moldura e fundo de destaque,
 * e o ícone ganha a cor. As outras duas ficam em contorno neutro.
 */
/**
 * Uma escolha, com o que ela faz escrito embaixo do nome.
 *
 * **Cada uma tem a cor da sua condição**, a mesma que a lista e os cartões já
 * usam: âmbar para o que está pendente, verde para o que foi resolvido, e a cor
 * da casa para a lista inteira. Três opções cinzentas obrigavam a ler as três
 * para achar a que interessa; com a cor, a pessoa acha antes de ler.
 *
 * Selecionada, a opção veste moldura e fundo da própria cor.
 */
const TOM = {
  neutro: { icone: "text-primary", ativa: "border-primary/40 bg-primary/10" },
  aberto: {
    icone: "text-amber-600 dark:text-amber-400",
    ativa: "border-amber-500/40 bg-amber-500/10",
  },
  feito: {
    icone: "text-emerald-600 dark:text-emerald-400",
    ativa: "border-emerald-500/40 bg-emerald-500/10",
  },
}

function Opcao({ ativa, onClick, icone: Icone, tom, titulo, descricao, quantos }: {
  ativa: boolean
  onClick: () => void
  icone: React.ElementType
  tom: keyof typeof TOM
  titulo: string
  descricao: string
  quantos?: number
}) {
  const cor = TOM[tom]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors ${
        ativa ? cor.ativa : "border-border/60 hover:border-border hover:bg-muted/40"
      }`}
    >
      <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${cor.icone}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-none">{titulo}</span>
        <span className="text-xs leading-tight text-muted-foreground">{descricao}</span>
      </span>
      <span className={`shrink-0 text-xs font-semibold tabular-nums ${cor.icone}`}>
        {quantos ?? 0}
      </span>
    </button>
  )
}

function Chip({ ativa, onClick, children }: {
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
