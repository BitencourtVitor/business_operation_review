import { atlasService } from "@/services/atlas.service"
import { deviceId, local, proximaSeq, type EventoFila } from "./db"
import { apagarArquivo, lerArquivo } from "./storage"

/**
 * A fila de campo.
 *
 * Tudo primeiro offline, depois online. Não é um modo de contingência que liga
 * quando a rede cai: é o caminho único. O outro desenho, "online manda direto,
 * offline enfileira", produz dois caminhos de código, e o de offline só é
 * exercitado quando a rede cai, ou seja, quebra no canteiro e nunca em teste.
 *
 * O que entra aqui é fato, não estado. Criar o ponto, comentar, mudar a
 * condição, anexar foto. É a mesma forma que o servidor recebe, e carregá-la
 * desde a origem evita uma tradução no momento do envio, que é o momento em que
 * menos se quer lógica.
 */

/** Minutos a leste de UTC, agora, neste aparelho. */
function fusoAgora(): number {
  return -new Date().getTimezoneOffset()
}

/**
 * Enfileira um fato.
 *
 * Devolve o id, que é gerado aqui e não no servidor. É o que torna o envio
 * idempotente: o sinal cai depois de o servidor aplicar e antes de a resposta
 * chegar, o aparelho reenvia, e o servidor reconhece em vez de duplicar. Sem id
 * de origem, cada queda de sinal viraria um ponto repetido.
 */
export async function enfileirar(
  obraId: string,
  kind: EventoFila["kind"],
  targetId: string,
  payload: Record<string, unknown>,
  arquivoLocal: string | null = null,
): Promise<string> {
  const id = crypto.randomUUID()
  await local.fila.add({
    id, obraId, kind, targetId, payload,
    deviceSeq: await proximaSeq(),
    occurredAt: new Date().toISOString(),
    occurredOffsetMinutes: fusoAgora(),
    estado: "pendente", motivo: "", bloqueadoPor: null,
    tentativas: 0, arquivoLocal,
  })
  return id
}

/** O teto de tentativas. Vem do servidor; este é o valor de partida. */
let maxTentativas = 5

export function definirMaxTentativas(n: number) {
  if (n > 0) maxTentativas = n
}

/**
 * Sobe o que está pendente.
 *
 * Envia o lote inteiro numa requisição, e não um por um. A ordem importa e o
 * servidor precisa vê-la junta: mandar em separado faria o comentário chegar
 * antes do ponto num aparelho com mais de uma conexão, e o servidor recusaria um
 * fato que era válido.
 *
 * Foto é caso à parte e sobe antes. O byte vai direto para o bucket por URL
 * assinada, como todo o resto do Atlas; o que entra no lote é só o vínculo, e é
 * por isso que um lote com dez fotos continua sendo uma requisição pequena.
 */
export async function sincronizar(): Promise<{
  enviados: number; recusados: number; bloqueados: number; erro: string
}> {
  const vazio = { enviados: 0, recusados: 0, bloqueados: 0, erro: "" }
  if (typeof navigator !== "undefined" && !navigator.onLine) return vazio

  const pendentes = await local.fila
    .where("estado").equals("pendente")
    .sortBy("deviceSeq")
  if (!pendentes.length) return vazio

  // As fotos primeiro, uma por uma.
  //
  // Cada foto é uma unidade da fila, com estado enviado ou não enviado, sem
  // retomada parcial. Se dez estão na fila e a conexão cai depois da terceira,
  // as três estão firmes e as sete continuam esperando. É o comportamento certo
  // para arquivo pequeno em rede ruim, e o custo é uma imagem grande poder nunca
  // completar, que é o que o teto de tentativas cobre.
  for (const ev of pendentes) {
    if (ev.kind !== "point.photo_attached" || !ev.arquivoLocal) continue
    if (ev.tentativas >= maxTentativas) {
      await local.fila.update(ev.id, {
        estado: "recusado",
        motivo: `a foto não subiu depois de ${maxTentativas} tentativas`,
      })
      continue
    }
    const arquivo = await lerArquivo(ev.arquivoLocal)
    if (!arquivo) {
      await local.fila.update(ev.id, {
        estado: "recusado", motivo: "o arquivo da foto não está mais no aparelho",
      })
      continue
    }
    try {
      const t = await atlasService.openMedia(ev.obraId, {
        eventId: ev.targetId, kind: "photo",
        fileName: arquivo.name, contentType: arquivo.type || "image/jpeg",
        byteSize: arquivo.size,
        phase: (ev.payload.phase as "before" | "after") ?? "before",
      })
      await fetch(t.uploadUrl, {
        method: "PUT", body: arquivo,
        headers: { "Content-Type": arquivo.type || "image/jpeg" },
      })
      await atlasService.confirmMedia(t.mediaId)
      await local.fila.update(ev.id, { payload: { ...ev.payload, mediaId: t.mediaId } })
      ev.payload = { ...ev.payload, mediaId: t.mediaId }
    } catch {
      await local.fila.update(ev.id, { tentativas: ev.tentativas + 1 })
    }
  }

  // O lote. Só entra o que tem tudo de que precisa: foto sem `mediaId` é foto
  // que não subiu, e mandá-la faria o servidor recusar um fato correto.
  const prontos = (await local.fila.where("estado").equals("pendente").sortBy("deviceSeq"))
    .filter(e => e.kind !== "point.photo_attached" || e.payload.mediaId)
  if (!prontos.length) return vazio

  const device = deviceId()
  let resposta: Array<{ id: string; status: string; reason?: string; blockedBy?: string }>
  try {
    resposta = await atlasService.sync(prontos.map(e => ({
      id: e.id, jobsiteId: e.obraId, kind: e.kind, targetId: e.targetId,
      payload: e.payload, deviceId: device, deviceSeq: e.deviceSeq,
      occurredAt: e.occurredAt, occurredOffsetMinutes: e.occurredOffsetMinutes,
    })))
  } catch (err) {
    // Falha de rede não muda o estado de nada. O item continua pendente e sobe
    // na próxima; marcar como recusado aqui transformaria uma queda de sinal em
    // erro que a pessoa precisa resolver à mão.
    return { ...vazio, erro: err instanceof Error ? err.message : "falha ao sincronizar" }
  }

  let enviados = 0, recusados = 0, bloqueados = 0
  for (const r of resposta) {
    if (r.status === "applied") {
      enviados++
      const ev = prontos.find(e => e.id === r.id)
      // O arquivo local sai depois de o servidor confirmar, e não antes. O
      // bucket passa a ser o dono; manter cópia seria pagar duas vezes pelo
      // mesmo byte no aparelho com menos espaço.
      if (ev?.arquivoLocal) await apagarArquivo(ev.arquivoLocal)
      await local.fila.delete(r.id)
    } else if (r.status === "rejected") {
      recusados++
      await local.fila.update(r.id, { estado: "recusado", motivo: r.reason ?? "" })
    } else if (r.status === "blocked") {
      bloqueados++
      await local.fila.update(r.id, {
        estado: "bloqueado", motivo: r.reason ?? "", bloqueadoPor: r.blockedBy ?? null,
      })
    }
  }
  return { enviados, recusados, bloqueados, erro: "" }
}

/**
 * O estado da fila por obra, que é o que o indicador mostra.
 *
 * A fila é global e o status é por obra: cada obra vê a sua fatia, e o cabeçalho
 * vê o total. É a divisão certa porque a pessoa pensa por obra ao decidir se
 * pode sair do canteiro, e pensa no total ao decidir se pode fechar o app.
 */
export interface EstadoFila {
  pendentes: number
  recusados: number
  bloqueados: number
  total: number
}

export async function estadoDaFila(obraId?: string): Promise<EstadoFila> {
  const itens = obraId
    ? await local.fila.where("obraId").equals(obraId).toArray()
    : await local.fila.toArray()
  return {
    pendentes:  itens.filter(i => i.estado === "pendente").length,
    recusados:  itens.filter(i => i.estado === "recusado").length,
    bloqueados: itens.filter(i => i.estado === "bloqueado").length,
    total: itens.length,
  }
}

/**
 * Destrava um recusado para tentar de novo.
 *
 * O que estava bloqueado por depender dele volta junto, e na ordem original. É o
 * que faz a pessoa ver um problema em vez de quatro: resolvido o primeiro, os
 * outros reprocessam sozinhos.
 */
export async function tentarDeNovo(id: string): Promise<number> {
  const ev = await local.fila.get(id)
  if (!ev) return 0
  await local.fila.update(id, { estado: "pendente", motivo: "", tentativas: 0 })
  const presos = await local.fila
    .where("estado").equals("bloqueado")
    .filter(e => e.bloqueadoPor === id || e.targetId === ev.targetId)
    .toArray()
  for (const p of presos) {
    await local.fila.update(p.id, { estado: "pendente", motivo: "", bloqueadoPor: null })
  }
  return presos.length
}
