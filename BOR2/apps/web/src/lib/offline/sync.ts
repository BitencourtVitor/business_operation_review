import { atlasService } from "@/services/atlas.service"
import { local } from "./db"
import { definirMaxTentativas, sincronizar } from "./queue"
import { liberarObra, pedirPersistencia } from "./storage"

/**
 * O que acontece quando a rede volta.
 *
 * Três coisas, e nesta ordem: subir o que está esperando, descobrir o que ficou
 * velho, e liberar o que ninguém abre há tempo demais. A ordem importa. Subir
 * primeiro porque é o que a pessoa fez e ainda não está a salvo; descobrir
 * depois porque é leitura e pode esperar; expirar por último porque apaga, e
 * nada que apaga deve rodar antes do que grava.
 */

/**
 * A detecção de revisão nova.
 *
 * O usuário não deve precisar verificar se há atualização. A comparação é entre
 * inteiros, então é barata o suficiente para rodar sempre, e roda em dois
 * gatilhos: o evento `online` e o retorno do app ao primeiro plano. São os dois
 * momentos em que a pessoa saiu de um lugar sem sinal e voltou.
 *
 * O que **não** existe é sync com o app fechado: `Background Sync` e
 * `Periodic Background Sync` não existem no Safari, e fingir que existem
 * produziria um app que promete atualizar sozinho e não atualiza. Web Push em
 * PWA instalado avisa; a atualização roda quando o app abre.
 */
export async function detectarRevisoes(): Promise<{ desatualizadas: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { desatualizadas: 0 }
  try {
    const pastas = await atlasService.offlineFolders()
    let n = 0
    for (const p of pastas) {
      if (!p.stale) continue
      n++
      await local.pastas.update(p.documentId, {
        estado: "desatualizada",
        revisaoServidor: p.serverRevision,
      })
      // Os planos daquela pasta ficam marcados um a um, e não só a pasta.
      //
      // É preferível a pessoa saber que está vendo conteúdo vencido do que
      // descobrir depois de executar. A tarja tem de aparecer sobre o desenho
      // que ela está olhando, e para isso o plano precisa saber de si.
      await local.planos.where("pastaId").equals(p.documentId)
        .modify({ desatualizado: true })
    }
    return { desatualizadas: n }
  } catch {
    return { desatualizadas: 0 }
  }
}

/**
 * A expiração por inatividade.
 *
 * Obra sem acesso há mais de N dias tem os arquivos pesados liberados. Três
 * regras acompanham, e as três importam:
 *
 *   - **A expiração remove os bytes e preserva a seleção**, o metadado e as
 *     miniaturas. Reativar é um toque, não reconfigurar tudo.
 *   - **O relógio conta do último acesso local**, não do servidor. A pessoa
 *     passa semanas abrindo a obra offline sem sincronizar nenhuma vez, e contar
 *     do sync marcaria como abandonada justamente a obra mais usada.
 *   - **Não há aviso prévio.** A pessoa descobre ao tentar abrir, e encontra o
 *     estado próprio de obra expirada, que é clicável e explica.
 */
export async function expirarInativas(): Promise<{ obras: number; bytes: number }> {
  let dias = 60
  try {
    const p = await atlasService.policy()
    const v = p["offline.expire_days"]
    if (typeof v === "number" && v > 0) dias = v
    const t = p["sync.max_attempts"]
    if (typeof t === "number") definirMaxTentativas(t)
  } catch {
    // Sem rede, vale o padrão. A expiração é local e não pode depender de
    // conseguir perguntar: seria justamente no aparelho isolado que ela pararia
    // de rodar, e é o que mais precisa dela.
  }

  const limite = Date.now() - dias * 24 * 60 * 60 * 1000
  const candidatas = await local.obras
    .filter(o => o.selecionada && o.expiradaEm === null && o.ultimoAcesso < limite)
    .toArray()

  let bytes = 0
  for (const o of candidatas) {
    bytes += await liberarObra(o.id)
    await local.obras.update(o.id, { expiradaEm: Date.now() })
    await local.pastas.where("obraId").equals(o.id).modify({ estado: "ausente" })
    // O arquivo some, a miniatura fica. É ela que permite o link que atravessa
    // pasta não baixada continuar abrindo alguma coisa em vez de dar em nada.
    await local.planos.where("obraId").equals(o.id).modify({ arquivo: null })
  }
  return { obras: candidatas.length, bytes }
}

/** Carimba o acesso local. É o relógio da expiração. */
export async function marcarAcesso(obraId: string) {
  await local.obras.update(obraId, { ultimoAcesso: Date.now(), expiradaEm: null })
}

/**
 * O ciclo completo, disparado pelos gatilhos certos.
 *
 * Instalado uma vez, no cliente. Os dois gatilhos são o `online` e o
 * `visibilitychange` para visível, que é o retorno ao primeiro plano.
 */
export function instalarSincronizacao(): () => void {
  if (typeof window === "undefined") return () => {}

  let rodando = false
  async function ciclo() {
    if (rodando) return
    rodando = true
    try {
      await sincronizar()
      await detectarRevisoes()
      await expirarInativas()
    } finally {
      rodando = false
    }
  }

  const aoVoltar = () => { if (document.visibilityState === "visible") void ciclo() }
  window.addEventListener("online", ciclo)
  document.addEventListener("visibilitychange", aoVoltar)
  void pedirPersistencia()
  void ciclo()

  return () => {
    window.removeEventListener("online", ciclo)
    document.removeEventListener("visibilitychange", aoVoltar)
  }
}
