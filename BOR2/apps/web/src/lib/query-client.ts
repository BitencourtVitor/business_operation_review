"use client"

import {
  QueryClient, dehydrate, hydrate, type DehydratedState, type Query,
} from "@tanstack/react-query"
import Dexie, { type Table } from "dexie"

/**
 * O QueryClient da aplicação, e o que dele sobrevive a fechar o app.
 *
 * No servidor cada chamada ganha um cliente novo: um cliente de módulo seria
 * compartilhado entre requisições de pessoas diferentes. No navegador é um só,
 * para o offline conseguir semear e guardar o mesmo cache que as telas leem.
 */
let cliente: QueryClient | null = null

function novo() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
    },
  })
}

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return novo()
  if (!cliente) {
    cliente = novo()
    // Consulta do Atlas não é descartada da memória. O descarte padrão tira do
    // cache o que ficou cinco minutos sem tela, e o que sai do cache sai também
    // do retrato guardado no aparelho: a obra aberta de manhã não estaria mais
    // lá quando o sinal caísse à tarde.
    cliente.setQueryDefaults(["atlas"], { gcTime: Infinity })
  }
  return cliente
}

/**
 * As consultas que valem guardar.
 *
 * Lista fechada e não "tudo do Atlas" por dois motivos. Miniatura e mídia vêm
 * com URL assinada, que vence e não abre sem rede de qualquer jeito. E a
 * consulta de miniaturas devolve um `Map`, que não atravessa a gravação.
 */
const GUARDADAS = new Set([
  "jobsites", "jobsite", "documents", "jobsite-categories", "versions", "sheets",
  "doc-categories", "user-companies", "events", "annotations", "replies",
  // A verificação também: sem ela a aba do punch list abria vazia no canteiro,
  // que é exatamente onde ela é consultada. Fica de fora a mídia do punch, que
  // é URL assinada e não abre sem rede de qualquer jeito.
  "punch-scopes", "punch-points", "punches",
])

function guardavel(q: Query) {
  return q.queryKey[0] === "atlas"
    && GUARDADAS.has(String(q.queryKey[1]))
    && q.state.status === "success"
}

class Consultas extends Dexie {
  retratos!: Table<{ id: string; salvoEm: number; estado: DehydratedState }, string>
  constructor() {
    super("atlas-consultas")
    this.version(1).stores({ retratos: "id" })
  }
}

let banco: Consultas | null = null
function abrir(): Consultas | null {
  if (typeof indexedDB === "undefined") return null
  return (banco ??= new Consultas())
}

const RETRATO = "atlas"
let restauracao: Promise<void> | null = null

/**
 * Devolve ao cache o que o aparelho guardou da última vez.
 *
 * Roda uma vez por carga da página. Voltar do BOR para o Atlas não restaura de
 * novo: o cache em memória já é mais novo que o retrato.
 */
export function restaurarConsultas(qc: QueryClient): Promise<void> {
  restauracao ??= (async () => {
    const b = abrir()
    if (!b) return
    try {
      const r = await b.retratos.get(RETRATO)
      if (r) hydrate(qc, r.estado)
    } catch {
      // Banco indisponível (janela privada, armazenamento bloqueado). O app segue
      // com rede como sempre seguiu; só não terá o que mostrar sem ela.
    }
  })()
  return restauracao
}

/**
 * Grava o cache no aparelho sempre que uma consulta guardável muda.
 *
 * A gravação espera um segundo e junta o que chegou nesse meio tempo: abrir uma
 * obra dispara uma dúzia de consultas, e gravar o retrato inteiro a cada uma
 * seria escrever doze vezes a mesma coisa. Quando o app vai para o fundo grava na
 * hora, porque no iPhone é ali que o sistema pode encerrá-lo sem aviso.
 */
export function persistirConsultas(qc: QueryClient): () => void {
  const b = abrir()
  if (!b) return () => {}

  let timer: ReturnType<typeof setTimeout> | null = null
  const gravar = () => {
    timer = null
    const estado = dehydrate(qc, {
      shouldDehydrateQuery: guardavel,
      shouldDehydrateMutation: () => false,
    })
    void b.retratos.put({ id: RETRATO, salvoEm: Date.now(), estado }).catch(() => undefined)
  }
  const agendar = () => { if (!timer) timer = setTimeout(gravar, 1000) }
  const agora = () => {
    if (!timer) return
    clearTimeout(timer)
    gravar()
  }

  const cancelar = qc.getQueryCache().subscribe(e => {
    if (e.type === "removed" || (e.type === "updated" && e.action.type === "success")) agendar()
  })
  const aoEsconder = () => { if (document.visibilityState === "hidden") agora() }
  document.addEventListener("visibilitychange", aoEsconder)

  return () => {
    cancelar()
    document.removeEventListener("visibilitychange", aoEsconder)
    agora()
  }
}

/** Apaga o retrato. Quem sai da conta não deixa dado para o próximo. */
export async function apagarConsultas(): Promise<void> {
  try {
    await abrir()?.retratos.delete(RETRATO)
  } catch {
    // Nada a apagar, ou banco indisponível: o resultado desejado é o mesmo.
  }
}
