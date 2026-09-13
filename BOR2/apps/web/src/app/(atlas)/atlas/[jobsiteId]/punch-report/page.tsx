"use client"

import { montarRelatorio } from "@/components/atlas/punch-report"
import { Button } from "@/components/ui/button"
import { useAtlasJobsite } from "@/hooks/use-atlas"
import { Printer, RefreshCw } from "lucide-react"
import { useParams, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

/**
 * O relatório do punch, na tela, do jeito que ele sai no papel.
 *
 * ── Para que serve uma tela só de olhar ──
 *
 * O relatório é um documento de impressão: margem em milímetro, cabeçalho que
 * se repete, ponto que não pode ser cortado entre páginas. Ajustar isso pela
 * emissão de verdade obriga a abrir o diálogo de impressão a cada tentativa, e
 * o que se vê ali é uma miniatura. Aqui o mesmo HTML entra num quadro da
 * largura de uma folha, com a mesma folha branca embaixo, e o ajuste se faz
 * olhando.
 *
 * O documento é o mesmo, e não uma cópia: vem de `montarRelatorio`, a mesma
 * função que a emissão usa. Duas versões do modelo divergiriam na primeira
 * semana, e a que sai na mão do cliente seria justamente a que ninguém olhou.
 *
 * Os filtros vêm da barra de endereço (`?scope=` e `?status=`), que é o que
 * deixa conferir um escopo específico sem mexer no código.
 */
export default function PunchReportPreview() {
  const { jobsiteId } = useParams<{ jobsiteId: string }>()
  const params = useSearchParams()
  const scope = params.get("scope") ?? ""
  const status = (params.get("status") as "open" | "resolved" | null) ?? undefined

  const { data: jobsite } = useAtlasJobsite(jobsiteId)
  // O documento vira endereço de blob, e não texto dentro do atributo: com as
  // fotos embutidas ele passa de oito megabytes, e um atributo desse tamanho
  // trava a página a cada remontagem.
  const [endereco, setEndereco] = useState("")
  const [estado, setEstado] = useState<"montando" | "pronto" | "vazio">("montando")

  const montar = useCallback(async () => {
    if (!jobsite) return
    setEstado("montando")
    const doc = await montarRelatorio({
      jobsiteId,
      jobsiteName: jobsite.name,
      scope: scope || undefined,
      status,
    })
    setEndereco(anterior => {
      if (anterior) URL.revokeObjectURL(anterior)
      return doc ? URL.createObjectURL(new Blob([doc], { type: "text/html" })) : ""
    })
    setEstado(doc ? "pronto" : "vazio")
  }, [jobsiteId, jobsite, scope, status])

  useEffect(() => { void montar() }, [montar])

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{jobsite?.name ?? "Jobsite"}</span>
          <span className="text-muted-foreground">
            {" · "}{scope || "Whole job"}
            {status ? ` · ${status === "open" ? "pending" : "resolved"} only` : ""}
          </span>
        </span>
        <Button variant="outline" onClick={() => void montar()} disabled={estado === "montando"}>
          <RefreshCw className={`h-3.5 w-3.5 ${estado === "montando" ? "animate-spin" : ""}`} />
          Rebuild
        </Button>
        {/* Imprimir daqui é o mesmo caminho da emissão: o quadro é um documento
            próprio, e mandar imprimir ele sai igual ao que a janela sairia. */}
        <Button
          disabled={estado !== "pronto"}
          onClick={() => {
            const q = document.querySelector<HTMLIFrameElement>("#folha")
            q?.contentWindow?.focus()
            q?.contentWindow?.print()
          }}
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>
      </div>

      {estado === "vazio" ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          No points to issue with these filters.
        </div>
      ) : (
        // A largura de uma folha carta com as margens de impressão descontadas.
        // Mais largo que isso, o bloco do ponto se estica e o layout que se vê
        // aqui não é o que sai no papel.
        <div className="flex min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-neutral-200 p-4 dark:bg-neutral-800">
          {/* Quem rola é o documento, por dentro do quadro: o relatório tem
              dezenas de folhas, e uma altura de página só mostraria a primeira.
              A largura é a da folha mais o que a barra de rolagem come, senão
              sobra uma barra horizontal por cima do papel. */}
          <iframe
            id="folha"
            title="Punch list report"
            src={endereco}
            className="mx-auto block h-full w-[calc(210mm+18px)] shrink-0"
          />
        </div>
      )}
    </div>
  )
}
