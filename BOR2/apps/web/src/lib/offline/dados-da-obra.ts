import { atlasService, type AtlasEvent, type AtlasMedia } from "@/services/atlas.service"
import { local } from "./db"
import { cabe, gravarArquivo, lerArquivo } from "./storage"

/**
 * O resto da obra no aparelho: punch, pinos, fotos, vídeos e anexos.
 *
 * Os documentos já funcionavam sem rede, porque o índice e os arquivos descem
 * para o aparelho e as telas leem de lá quando falta sinal. O punch não: a lista
 * só abria se alguém tivesse aberto a tela com rede antes, e as fotos nunca, porque
 * vinham de URL assinada. Aqui o mesmo método vale para tudo:
 *
 * 1. **Com rede, desce.** Cada resposta que a tela usa é guardada inteira
 *    (`respostas`), e cada foto e vídeo vira arquivo no OPFS (`midias`).
 * 2. **Sem rede, lê daqui.** Os hooks consultam o aparelho e filtram do mesmo
 *    jeito que o servidor filtraria.
 *
 * Só a obra que a pessoa escolheu manter desce sozinha, como os documentos. As
 * respostas das telas abertas com rede também ficam, porque são pequenas e são
 * exatamente o que a pessoa acabou de ver.
 */

export const chaves = {
  punchScopes: (obra: string) => `punch-scopes:${obra}`,
  punchPoints: (obra: string) => `punch-points:${obra}`,
  punches: (obra: string) => `punches:${obra}`,
  events: (obra: string) => `events:${obra}`,
  media: (obra: string, evento: string) => `media:${obra}:${evento}`,
}

export async function guardarResposta(chave: string, obraId: string, dados: unknown): Promise<void> {
  try {
    await local.respostas.put({ chave, obraId, salvoEm: Date.now(), dados })
  } catch {
    // Sem banco local (janela privada): a tela segue com rede, só não guarda.
  }
}

/**
 * Junta uma resposta filtrada à lista inteira guardada.
 *
 * A tela quase sempre pede um recorte (os pontos de um escopo, os pendentes), e
 * esperar a lista inteira descer para ter o que mostrar sem rede deixaria de fora
 * justamente o que a pessoa acabou de ver. O que veio substitui o que havia com o
 * mesmo id; quando o recorte é exato (`dentro`), o que sumiu dele sai também.
 */
export async function juntarResposta<T extends { id: string }>(
  chave: string, obraId: string, novos: T[], dentro?: (item: T) => boolean,
): Promise<void> {
  const antes = (await lerResposta<T[]>(chave)) ?? []
  const ids = new Set(novos.map(n => n.id))
  const ficam = antes.filter(a => !ids.has(a.id) && !(dentro && dentro(a)))
  await guardarResposta(chave, obraId, [...ficam, ...novos])
}

export async function lerResposta<T>(chave: string): Promise<T | null> {
  try {
    const r = await local.respostas.get(chave)
    return (r?.dados as T) ?? null
  } catch {
    return null
  }
}

// Endereço local de cada arquivo já aberto nesta sessão. Criar um novo a cada
// render vazaria memória e faria a imagem piscar.
const enderecos = new Map<string, string>()

/** O endereço da mídia guardada no aparelho, ou vazio se ela não desceu. */
export async function urlLocalDaMidia(id: string): Promise<string> {
  const pronto = enderecos.get(id)
  if (pronto) return pronto
  const m = await local.midias.get(id).catch(() => undefined)
  if (!m) return ""
  const arquivo = await lerArquivo(m.arquivo)
  if (!arquivo) return ""
  const url = URL.createObjectURL(arquivo)
  enderecos.set(id, url)
  return url
}

/** Troca a URL assinada pela do aparelho, peça a peça. */
export async function comUrlLocal<T extends { id: string; url: string }>(pecas: T[]): Promise<T[]> {
  return Promise.all(pecas.map(async p => {
    const url = await urlLocalDaMidia(p.id)
    return url ? { ...p, url } : p
  }))
}

function extensao(contentType: string, nome: string): string {
  const doNome = nome.includes(".") ? nome.split(".").pop() : ""
  if (doNome) return doNome.toLowerCase()
  return contentType.split("/")[1]?.split(";")[0] || "bin"
}

async function descerMidia(obraId: string, id: string, url: string, contentType: string, nome: string) {
  if (await local.midias.get(id)) return false
  const res = await fetch(url)
  if (!res.ok) return false
  const blob = await res.blob()
  const caminho = await gravarArquivo(obraId, `m-${id}.${extensao(contentType, nome)}`, blob)
  if (!caminho) return false
  await local.midias.put({ id, obraId, arquivo: caminho, contentType })
  return true
}

let emCurso = new Set<string>()

/**
 * Desce tudo que não é documento para o aparelho.
 *
 * Roda a cada visita com rede à obra mantida, e ao fim do download de pasta ou
 * de obra. As respostas são regravadas sempre, porque pontos mudam de condição;
 * os arquivos só descem quando faltam, porque foto não muda depois de subir.
 */
export async function baixarDadosDaObra(obraId: string): Promise<{ respostas: number; midias: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { respostas: 0, midias: 0 }
  if (emCurso.has(obraId)) return { respostas: 0, midias: 0 }
  emCurso.add(obraId)
  let respostas = 0
  let midias = 0
  try {
    const [escopos, pontos, rodadas, eventos] = await Promise.all([
      atlasService.punchScopes(obraId),
      atlasService.punchList(obraId),
      atlasService.punches(obraId),
      atlasService.listEvents(obraId),
    ])
    await guardarResposta(chaves.punchScopes(obraId), obraId, escopos)
    await guardarResposta(chaves.punchPoints(obraId), obraId, pontos)
    await guardarResposta(chaves.punches(obraId), obraId, rodadas)
    await guardarResposta(chaves.events(obraId), obraId, eventos)
    respostas += 4

    // A mídia de cada evento: a lista, e o arquivo de cada foto e vídeo.
    const ids = new Set<string>([
      ...eventos.map((e: AtlasEvent) => e.id),
      ...pontos.map(p => p.id),
    ])
    const baixar: { id: string; url: string; contentType: string; nome: string; bytes: number }[] = []
    const fila = [...ids]
    async function listar() {
      for (let id = fila.shift(); id; id = fila.shift()) {
        try {
          const lista: AtlasMedia[] = await atlasService.listMedia(obraId, { eventId: id })
          await guardarResposta(chaves.media(obraId, id), obraId, lista)
          respostas++
          for (const m of lista) {
            if (!m.url || m.contentType.startsWith("audio/")) continue
            baixar.push({ id: m.id, url: m.url, contentType: m.contentType, nome: m.fileName, bytes: m.byteSize })
          }
        } catch {
          // O evento que falhar fica para a próxima visita.
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, listar))

    // Os anexos das versões de cada pasta: as fotos que justificam uma troca.
    const pastas = await local.pastas.where("obraId").equals(obraId).toArray()
    for (const pasta of pastas) {
      try {
        const versoes = await atlasService.listVersions(pasta.id)
        for (const v of versoes) {
          for (const a of v.attachments ?? []) {
            if (await local.midias.get(a.id)) continue
            const { url } = await atlasService.mediaUrl(a.id)
            baixar.push({ id: a.id, url, contentType: a.contentType, nome: a.fileName, bytes: a.byteSize })
          }
        }
      } catch {
        // Pasta sem versão acessível agora: segue.
      }
    }

    const faltam = []
    for (const b of baixar) if (!(await local.midias.get(b.id))) faltam.push(b)
    if (!faltam.length) return { respostas, midias }
    const espaco = await cabe(faltam.reduce((t, b) => t + (b.bytes || 0), 0))
    if (!espaco.cabe) return { respostas, midias }

    const arquivos = [...faltam]
    async function descer() {
      for (let b = arquivos.shift(); b; b = arquivos.shift()) {
        try {
          if (await descerMidia(obraId, b.id, b.url, b.contentType, b.nome)) midias++
        } catch {
          // Arquivo que falhar desce na próxima visita.
        }
      }
    }
    await Promise.all(Array.from({ length: 6 }, descer))
    return { respostas, midias }
  } catch {
    return { respostas, midias }
  } finally {
    emCurso = new Set([...emCurso].filter(o => o !== obraId))
  }
}

/** Tira do aparelho as respostas e a mídia de uma obra. */
export async function removerDadosDaObra(obraId: string): Promise<void> {
  try {
    await local.respostas.where("obraId").equals(obraId).delete()
    await local.midias.where("obraId").equals(obraId).delete()
  } catch {
    // Nada guardado.
  }
}
