"use client"

import { FileStack, FileText, Files } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

/**
 * O escopo da sobrescrita, escolhido antes de qualquer coisa acontecer.
 *
 * Antes disto, sobrescrever era uma coisa só: subir o set inteiro. É o certo
 * quando o projetista reemite as 51 pranchas, e é desproporcional no caso comum,
 * que é uma folha ter sido corrigida. Reemitir 51 para trocar uma faz o campo
 * rebaixar 107 MB por causa de 2 MB, e apaga o histórico das 50 que não mudaram.
 *
 * **Nenhuma das três opções escreve por cima da folha antiga.** As três criam
 * uma versão nova; o que muda é quantas folhas dela são novas e quantas são
 * herdadas da anterior. A prancha que estava valendo quando alguém executou a
 * partir dela continua existindo, e é justamente isso que a revisão preserva.
 */

export type EscopoSobrescrita =
  | { scope: "full" }
  | { scope: "range"; pages: number[] }
  | { scope: "single"; pages: number[] }

export function OverwriteScopeDialog({ totalPaginas, open, onOpenChange, onConfirmar }: {
  totalPaginas: number
  open: boolean
  onOpenChange: (v: boolean) => void
  onConfirmar: (escopo: EscopoSobrescrita) => void
}) {
  const [modo, setModo] = useState<"full" | "range" | "single">("full")
  const [de, setDe] = useState("1")
  const [ate, setAte] = useState(String(totalPaginas))
  const [pagina, setPagina] = useState("1")

  // As páginas viram índice de zero aqui e não no servidor, porque é aqui que a
  // pessoa digitou "1" pensando na primeira folha. Converter só na borda evita
  // que os dois lados discordem sobre o que "página 1" quer dizer.
  function paginas(): number[] {
    if (modo === "single") {
      const n = Number(pagina) - 1
      return Number.isFinite(n) && n >= 0 ? [n] : []
    }
    const a = Number(de) - 1
    const b = Number(ate) - 1
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < a) return []
    return Array.from({ length: b - a + 1 }, (_, i) => a + i)
  }

  const escolhidas = modo === "full" ? totalPaginas : paginas().length
  const valido = modo === "full" || escolhidas > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What is this revision replacing?</DialogTitle>
          <DialogDescription>
            Uma versão nova é criada em qualquer caso. As folhas que você não
            trocar são herdadas da revisão anterior, e continuam apontando para o
            mesmo arquivo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Escolha
            ativa={modo === "full"} onClick={() => setModo("full")}
            icone={Files} titulo="The whole folder"
            texto={`Todas as ${totalPaginas} folhas são reemitidas.`}
          />
          <Escolha
            ativa={modo === "range"} onClick={() => setModo("range")}
            icone={FileStack} titulo="A range of pages"
            texto="O intervalo é trocado; o resto é herdado."
          />
          {modo === "range" && (
            <div className="flex items-center gap-2 pl-9">
              <Input value={de} onChange={e => setDe(e.target.value)} className="w-20" inputMode="numeric" />
              <span className="text-sm text-muted-foreground">até</span>
              <Input value={ate} onChange={e => setAte(e.target.value)} className="w-20" inputMode="numeric" />
            </div>
          )}
          <Escolha
            ativa={modo === "single"} onClick={() => setModo("single")}
            icone={FileText} titulo="A single page"
            texto="Uma folha é trocada; as outras são herdadas."
          />
          {modo === "single" && (
            <div className="flex items-center gap-2 pl-9">
              <span className="text-sm text-muted-foreground">página</span>
              <Input value={pagina} onChange={e => setPagina(e.target.value)} className="w-20" inputMode="numeric" />
            </div>
          )}
        </div>

        <Button
          disabled={!valido}
          onClick={() => {
            onConfirmar(modo === "full"
              ? { scope: "full" }
              : { scope: modo, pages: paginas() })
            onOpenChange(false)
          }}
        >
          {modo === "full"
            ? `Reemitir as ${totalPaginas} folhas`
            : `Trocar ${escolhidas} folha(s), herdar ${Math.max(0, totalPaginas - escolhidas)}`}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function Escolha({ ativa, onClick, icone: Icone, titulo, texto }: {
  ativa: boolean; onClick: () => void
  icone: React.ComponentType<{ className?: string }>
  titulo: string; texto: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
        ativa ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/40"
      }`}
    >
      <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{titulo}</span>
        <span className="text-xs text-muted-foreground">{texto}</span>
      </span>
    </button>
  )
}
