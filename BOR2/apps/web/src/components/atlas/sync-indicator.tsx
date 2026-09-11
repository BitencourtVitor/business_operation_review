"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { AlertTriangle, Check, CloudOff, Loader2, RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"

import { local } from "@/lib/offline/db"
import { sincronizar, tentarDeNovo } from "@/lib/offline/queue"

/**
 * O estado da fila, onde a pessoa precisa vê-lo.
 *
 * Quatro estados, e cada um responde a uma pergunta diferente que se faz no
 * canteiro: está tudo salvo? quanto falta? está subindo? o que deu errado?
 *
 * Ele aparece **inclusive sem rede**, e é aí que ele mais serve: é o que diz à
 * pessoa que os quinze pontos que ela levantou de manhã estão guardados e vão
 * subir, em vez de deixá-la no escuro achando que perdeu o trabalho.
 *
 * O número vem do banco local por `useLiveQuery`, então ele se atualiza sozinho
 * a cada item que entra ou sai da fila. Sem isso, cada escrita precisaria
 * lembrar de avisar este componente, e é assim que um indicador passa a mostrar
 * "3 pendentes" depois de tudo ter subido.
 */
export function SyncIndicator({ jobsiteId }: { jobsiteId?: string }) {
  const [online, setOnline] = useState(true)
  const [subindo, setSubindo] = useState(false)

  useEffect(() => {
    const marcar = () => setOnline(navigator.onLine)
    marcar()
    window.addEventListener("online", marcar)
    window.addEventListener("offline", marcar)
    return () => {
      window.removeEventListener("online", marcar)
      window.removeEventListener("offline", marcar)
    }
  }, [])

  const itens = useLiveQuery(
    () => jobsiteId
      ? local.fila.where("obraId").equals(jobsiteId).toArray()
      : local.fila.toArray(),
    [jobsiteId],
  )

  if (!itens) return null

  const pendentes = itens.filter(i => i.estado === "pendente").length
  const problemas = itens.filter(i => i.estado === "recusado" || i.estado === "bloqueado")

  // Nada na fila e com rede é o estado normal, e estado normal não merece
  // espaço permanente na tela. Some.
  if (!itens.length && online) return null

  async function subir() {
    setSubindo(true)
    try { await sincronizar() } finally { setSubindo(false) }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-3">
      <div className="flex items-center gap-2">
        {!online ? (
          <>
            <CloudOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-sm">
              {pendentes > 0
                ? `${pendentes} ${pendentes === 1 ? "item guardado" : "itens guardados"} no aparelho`
                : "Sem conexão"}
            </span>
            {/* A frase existe porque a dúvida existe. Sem ela, quem levantou
                quinze pontos numa obra sem sinal fica sem saber se o trabalho
                está a salvo. */}
            <span className="text-xs text-muted-foreground">
              {pendentes > 0 && "· sobe quando a rede voltar"}
            </span>
          </>
        ) : subindo ? (
          <>
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            <span className="text-sm">Enviando…</span>
          </>
        ) : pendentes > 0 ? (
          <>
            <Loader2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-sm">{pendentes} para enviar</span>
            <button
              type="button"
              onClick={subir}
              className="ml-auto rounded-md px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-accent"
            >
              Enviar agora
            </button>
          </>
        ) : problemas.length === 0 ? (
          <>
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm">Tudo sincronizado</span>
          </>
        ) : null}
      </div>

      {/* O que deu errado, com o motivo e o caminho de volta.
          Um contador de falhas sem o motivo transfere o problema para a pessoa
          sem lhe dar como resolvê-lo. */}
      {problemas.map(p => (
        <div
          key={p.id}
          className="flex items-start gap-2 rounded-md bg-muted/60 p-2 text-xs"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1">
            {p.motivo || "não foi possível enviar"}
            {p.estado === "bloqueado" && (
              <span className="text-muted-foreground"> · esperando outro item</span>
            )}
          </span>
          {p.estado === "recusado" && (
            <button
              type="button"
              title="Tentar de novo"
              onClick={() => tentarDeNovo(p.id)}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
