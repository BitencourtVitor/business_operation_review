import { getQueryClient } from "@/lib/query-client"
import { atlasService, type AtlasJobsite } from "@/services/atlas.service"
import { aquecerRotas } from "./aquecer"
import { local, type PlanoLocal } from "./db"
import { cabe, gravarArquivo, liberarObra, ultimoErroDeArquivo } from "./storage"

/**
 * O índice da obra, e o download de uma pasta.
 *
 * Duas operações que parecem a mesma e não são, e a diferença é o que faz o
 * offline ser usável.
 *
 * **O índice desce sempre.** Título, número, pasta, categoria, subcategoria,
 * versão e ponto de todos os planos, mesmo com nenhuma pasta baixada. Custa
 * poucas dezenas de MB e garante que, sem internet, a pessoa navegue, busque e
 * saiba que o plano existe. É a diferença entre "não tenho o arquivo" e "não sei
 * o que existe", e a segunda é a que faz alguém voltar ao escritório.
 *
 * **O arquivo desce por pasta.** Não existe botão de obra offline inteira: a
 * pasta corresponde a um documento anexado e a uma categoria, que é como o
 * pessoal de campo raciocina.
 */

/** Se a obra tem alguma pasta mantida neste aparelho. */
async function temPastaGuardada(obraId: string): Promise<boolean> {
  const n = await local.pastas.where("obraId").equals(obraId)
    .filter(p => p.estado !== "ausente").count()
  return n > 0
}

/**
 * Grava as obras da lista no aparelho.
 *
 * Faltava, e era por isso que a obra salva não aparecia sem rede: pastas e
 * planos iam para o banco local, a obra nunca. A lista desabilita o que não foi
 * guardado consultando esta tabela, e ela estava vazia.
 *
 * A obra é "selecionada" quando tem pasta mantida, e isso é calculado aqui e não
 * guardado no clique: assim quem baixou pasta antes desta correção também passa
 * a ter a obra reconhecida, sem precisar baixar de novo.
 */
export async function guardarObras(obras: AtlasJobsite[]): Promise<void> {
  await local.transaction("rw", local.obras, local.pastas, async () => {
    for (const j of obras) {
      const antes = await local.obras.get(j.id)
      // Obra expirada mantém a seleção. A expiração tira os bytes e deixa as
      // pastas como ausentes, e recalcular aqui desfaria a seleção que a regra
      // manda preservar.
      const selecionada = antes?.expiradaEm ? antes.selecionada : await temPastaGuardada(j.id)
      await local.obras.put({
        id: j.id,
        name: j.name,
        client: j.client ?? "",
        community: j.community ?? "",
        status: j.status ?? "",
        selecionada,
        ultimoAcesso: antes?.ultimoAcesso ?? Date.now(),
        expiradaEm: antes?.expiradaEm ?? null,
      })
    }
  })
}

/** Recalcula se a obra continua mantida, depois de baixar ou liberar pasta. */
async function recalcularSelecao(obraId: string): Promise<void> {
  await local.obras.update(obraId, { selecionada: await temPastaGuardada(obraId) })
}

/**
 * Traz o índice completo da obra para o aparelho.
 *
 * Stale-while-revalidate: quem chama já tem o que estava gravado e continua
 * tendo enquanto isto roda. A tela não espera, e se a rede falhar ela segue
 * mostrando o índice anterior em vez de esvaziar.
 *
 * O que desce também vai para o cache das telas. A página do documento lê
 * versões e folhas do cache, e sem isto só a pasta que a pessoa chegou a abrir
 * com rede abriria sem ela.
 */
export async function baixarIndice(obraId: string): Promise<{ planos: number }> {
  const qc = getQueryClient()
  const documentos = await atlasService.listDocuments(obraId)
  qc.setQueryData(["atlas", "documents", obraId], documentos)
  let planos = 0
  // O que o servidor ainda reconhece. O que não estiver aqui no fim da varredura
  // é resto de documento apagado ou de versão trocada, e sai do aparelho.
  const vivos = new Set<string>()
  const pastasVivas = new Set<string>()

  for (const d of documentos) {
    const versoes = await atlasService.listVersions(d.id)
    qc.setQueryData(["atlas", "versions", d.id], versoes)
    // Só a versão vigente entra no índice. As anteriores continuam no servidor e
    // são o histórico; trazê-las multiplicaria o índice por revisão para um dado
    // que o campo não consulta.
    const atual = versoes[0]
    if (!atual) continue

    pastasVivas.add(d.id)
    const folhas = await atlasService.listSheets(atual.id)
    qc.setQueryData(["atlas", "sheets", atual.id], folhas)
    // O tamanho da pasta é a soma das pranchas, que é o que de fato desce. O do
    // PDF original fica só de reserva, para versão sem recorte.
    const somaFolhas = folhas.reduce((t, s) => t + (s.byteSize ?? 0), 0)

    const pastaAntes = await local.pastas.get(d.id)
    await local.pastas.put({
      id: d.id, obraId, name: d.name,
      category: d.category ?? "", subcategory: d.subcategory ?? "",
      estado: pastaAntes?.estado ?? "ausente",
      revisaoLocal: pastaAntes?.revisaoLocal ?? 0,
      revisaoServidor: versoes.length,
      bytes: somaFolhas || (atual.byteSize ?? 0),
      baixadoEm: pastaAntes?.baixadoEm ?? null,
    })
    for (const s of folhas) {
      const antes = await local.planos.get(s.id)
      await local.planos.put({
        id: s.id, pastaId: d.id, obraId, versaoId: atual.id,
        pageIndex: s.pageIndex, sheetNumber: s.sheetNumber ?? "", title: s.title ?? "",
        // O caminho do arquivo é preservado. Reescrever o índice não pode
        // desfazer um download: a pessoa perderia a pasta que baixou no Wi-Fi
        // só porque abriu a obra de novo.
        arquivo: antes?.arquivo ?? null,
        inteiro: antes?.inteiro,
        bytes: s.byteSize ?? 0,
        thumb: antes?.thumb ?? null,
        widthPt: s.widthPt ?? 0, heightPt: s.heightPt ?? 0,
        scaleUnitsPerPt: antes?.scaleUnitsPerPt ?? null,
        scaleLabel: antes?.scaleLabel ?? "",
        desatualizado: false,
      })
      vivos.add(s.id)
      planos++
    }
  }

  await limparRestos(obraId, pastasVivas, vivos)
  return { planos }
}

/**
 * Tira do aparelho o que o servidor já não tem.
 *
 * Documento apagado, ou versão trocada por outra, deixava a folha antiga no
 * índice local para sempre. O download então tentava baixar uma folha que não
 * existe mais e o servidor respondia "folha não encontrado" para cada uma
 * delas: foi assim que um set inteiro falhou, 97 de 97, sem nada de errado com
 * o arquivo nem com a rede.
 *
 * O arquivo guardado sai junto, senão o aparelho ficaria carregando peso de
 * prancha que ninguém mais consegue abrir.
 */
async function limparRestos(
  obraId: string, pastasVivas: Set<string>, folhasVivas: Set<string>,
): Promise<void> {
  const { apagarArquivo } = await import("./storage")
  const planos = await local.planos.where("obraId").equals(obraId).toArray()
  const mortos = planos.filter(p => !folhasVivas.has(p.id))
  for (const p of mortos) {
    // O arquivo do set inteiro é o mesmo para várias folhas: só sai quando
    // nenhuma folha viva aponta para ele.
    if (p.arquivo && !planos.some(o => o.arquivo === p.arquivo && folhasVivas.has(o.id))) {
      await apagarArquivo(p.arquivo)
    }
    if (p.thumb) await apagarArquivo(p.thumb)
    await local.marcas.where("planoId").equals(p.id).delete()
  }
  if (mortos.length) await local.planos.bulkDelete(mortos.map(p => p.id))

  const pastas = await local.pastas.where("obraId").equals(obraId).toArray()
  const orfas = pastas.filter(p => !pastasVivas.has(p.id))
  if (orfas.length) {
    await local.pastas.bulkDelete(orfas.map(p => p.id))
    await recalcularSelecao(obraId)
  }
}

/**
 * As obras cujo download foi interrompido pela pessoa.
 *
 * O download roda em laço, sem tela por trás: quem cancela precisa de um lugar
 * para dizer isso, e o laço confere entre uma folha e a próxima. Cancelar não
 * apaga o que já desceu; as folhas ficam no aparelho e a próxima tentativa as
 * pula, então recomeçar é barato.
 */
const cancelados = new Set<string>()

export function cancelarDownload(obraId: string): void {
  cancelados.add(obraId)
}

/**
 * Para o download agora e destrava a faixa.
 *
 * Marca o cancelamento, para o laço que estiver rodando parar na folha
 * seguinte, e já devolve as pastas ao estado de repouso. Os dois passos juntos
 * são de propósito: quando o laço morreu no meio, por recarga ou por uma versão
 * nova do app entrar no lugar, não há quem responda à marca, e sem isto a pasta
 * ficaria girando para sempre sem jeito de sair.
 */
export async function pararDownload(obraId: string): Promise<void> {
  cancelados.add(obraId)
  await encerrarPendentes(obraId)
}

export function downloadCancelado(obraId: string): boolean {
  return cancelados.has(obraId)
}

/**
 * Devolve ao estado de repouso as pastas que ficaram em "baixando".
 *
 * Pasta com todas as folhas no aparelho fica disponível; a que ficou pela
 * metade volta a ausente, e não presa girando. É o que também conserta o
 * download que travou por causa de um deploy no meio do caminho: a pessoa
 * cancela, e a faixa volta a oferecer o download em vez de girar para sempre.
 */
async function encerrarPendentes(obraId: string): Promise<void> {
  const pastas = await local.pastas.where("obraId").equals(obraId).toArray()
  for (const p of pastas) {
    if (p.estado !== "baixando") continue
    const planos = await local.planos.where("pastaId").equals(p.id).toArray()
    const completa = planos.length > 0 && planos.every(x => x.arquivo)
    await local.pastas.update(p.id, { estado: completa ? "disponivel" : "ausente" })
  }
  await recalcularSelecao(obraId)
}

/**
 * Desce o arquivo de um conjunto de planos.
 *
 * Seis por vez, e com as URLs assinadas pedidas em lote por versão. Antes era
 * uma folha de cada vez, e cada uma começava perguntando ao servidor onde ela
 * estava: num set de 97 folhas são 97 idas antes do primeiro byte de cada
 * arquivo, e essa espera dominava o download inteiro. No canteiro dava 0,1 MB
 * por segundo numa rede que dá muito mais.
 *
 * Devolve também o motivo da primeira falha. Contar quantas faltaram sem dizer
 * por quê deixa a pessoa adivinhando entre rede, espaço e permissão.
 */
async function descerPlanos(obraId: string, planos: PlanoLocal[]): Promise<{
  baixados: number; falharam: number; motivo: string
}> {
  const faltam = planos.filter(p => !p.arquivo)
  let baixados = planos.length - faltam.length
  let falharam = 0
  let motivo = ""
  const anotar = (m: string) => { if (!motivo) motivo = m }
  if (!faltam.length) return { baixados, falharam, motivo }

  const fontes = new Map<string, { url: string; whole: boolean }>()
  for (const versao of new Set(faltam.map(p => p.versaoId))) {
    try {
      for (const f of await atlasService.versionSheetUrls(versao)) {
        fontes.set(f.sheetId, { url: f.url, whole: f.whole })
      }
    } catch {
      // Servidor antigo não conhece a rota em lote. Cada folha volta a
      // perguntar por si, mais devagar mas funcionando.
    }
  }

  // Versão que nunca foi recortada devolve o set inteiro para toda folha. Ele
  // desce uma vez e todas apontam para o mesmo arquivo: baixar de novo a cada
  // folha multiplicaria o set pelo número de páginas. Com várias descidas ao
  // mesmo tempo, quem chega primeiro busca e as outras esperam a mesma promessa.
  const inteiros = new Map<string, Promise<string | null>>()

  async function descer(p: PlanoLocal) {
    const fonte = fontes.get(p.id) ?? await atlasService.sheetUrl(p.id)
    if (fonte.whole) {
      let pendente = inteiros.get(p.versaoId)
      if (!pendente) {
        pendente = fetch(fonte.url)
          .then(res => res.ok ? res.blob() : Promise.reject(new Error(`storage answered ${res.status}`)))
          .then(blob => gravarArquivo(obraId, `${p.versaoId}.pdf`, blob))
        inteiros.set(p.versaoId, pendente)
      }
      const caminho = await pendente
      if (!caminho) { falharam++; anotar(ultimoErroDeArquivo() || "no room on this device"); return }
      await local.planos.update(p.id, { arquivo: caminho, inteiro: true })
      baixados++
      return
    }
    const res = await fetch(fonte.url)
    if (!res.ok) { falharam++; anotar(`storage answered ${res.status}`); return }
    const caminho = await gravarArquivo(obraId, `${p.id}.pdf`, await res.blob())
    if (!caminho) { falharam++; anotar(ultimoErroDeArquivo() || "no room on this device"); return }
    await local.planos.update(p.id, { arquivo: caminho, inteiro: false })
    baixados++
  }

  // Seis por vez, a mesma largura das miniaturas: uma a uma a rede fica ociosa
  // entre um arquivo e o seguinte; todas juntas o celular abre 97 conexões.
  const fila = [...faltam]
  async function trabalhar() {
    for (let p = fila.shift(); p; p = fila.shift()) {
      if (cancelados.has(obraId)) { fila.length = 0; return }
      try {
        await descer(p)
      } catch (e) {
        // Uma folha que não desce não derruba a pasta. A fila segue e o
        // relatório final diz quantas faltaram e por quê, para a pessoa tentar
        // de novo só o que faltou em vez de rebaixar tudo.
        falharam++
        anotar(e instanceof Error ? e.message : "network failed")
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, trabalhar))
  return { baixados, falharam, motivo }
}

/**
 * Guarda as marcações da pasta e desce o alvo de cada vínculo.
 *
 * Duas coisas que andam juntas de propósito. A marcação precisa estar no
 * aparelho, senão o vínculo desaparece sem rede: ele vem da API a cada abertura
 * de folha. E o destino precisa estar no aparelho também, senão o toque leva a
 * lugar nenhum, o que é pior que não ter link, porque parece defeito.
 *
 * O alvo pode morar em outra pasta, e desce mesmo assim. Não é desperdício: no
 * dia em que essa outra pasta for baixada, as folhas que já vieram por aqui são
 * puladas, e o download dela sai mais curto.
 */
async function guardarMarcasEAlvos(obraId: string, planos: PlanoLocal[]): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0
  const daPasta = new Set(planos.map(p => p.id))
  const destinos = new Set<string>()

  for (const versao of new Set(planos.map(p => p.versaoId))) {
    let marcas
    try {
      marcas = await atlasService.versionAnnotations(versao)
    } catch {
      // Servidor sem a rota em lote, ou rede caindo agora. A pasta continua
      // válida: o que falta é o vínculo sem rede, e ele volta na próxima visita.
      continue
    }
    await local.marcas.bulkPut(marcas.map(m => {
      const alvo = (m.geometry?.target?.sheetId ?? "")
      if (alvo && !daPasta.has(alvo)) destinos.add(alvo)
      return {
        id: m.id,
        planoId: m.sheetId,
        obraId,
        pastaId: planos.find(p => p.id === m.sheetId)?.pastaId ?? "",
        tool: m.tool,
        color: m.color,
        width: m.width,
        opacity: m.opacity,
        shared: m.shared,
        geometry: m.geometry as unknown as Record<string, unknown>,
        createdAt: m.createdAt,
        destinoPlanoId: alvo,
      }
    }))
  }

  if (!destinos.size) return 0
  const conhecidos = (await local.planos.bulkGet([...destinos]))
    .filter((p): p is PlanoLocal => !!p)
  // A página da pasta vizinha vai para o cache junto com a prancha de destino.
  // Sem ela o vínculo entre pastas tinha o arquivo no aparelho e não tinha a
  // tela que o abre: sem rede, o toque devolvia a lista de obras.
  aquecerRotas([...new Set(conhecidos.map(p => `/atlas/${obraId}/documents/${p.pastaId}`))])
  const alvos = conhecidos.filter(p => !p.arquivo)
  if (!alvos.length) return 0

  // O espaço do alvo é conferido à parte: a pasta já coube, e o que vem por
  // vínculo é acréscimo. Não cabendo, a pasta segue baixada e só o atalho fica
  // para depois, em vez de o download inteiro falhar por causa do extra.
  const espaco = await cabe(alvos.reduce((t, p) => t + (p.bytes ?? 0), 0))
  if (!espaco.cabe) return 0

  const { baixados } = await descerPlanos(obraId, alvos)
  return baixados
}

/**
 * Põe em dia as marcações de uma pasta já baixada.
 *
 * O download guarda as marcações no caminho, mas quem baixou antes disso
 * existir, ou baixou e depois recebeu vínculo novo, ficaria sem elas para
 * sempre. Roda a cada visita com rede, junto das miniaturas, pelo mesmo motivo
 * delas: é metadado, custa pouco, e é o que faz o link existir sem sinal.
 */
export async function atualizarMarcas(pastaId: string): Promise<number> {
  const pasta = await local.pastas.get(pastaId)
  if (!pasta) return 0
  const planos = await local.planos.where("pastaId").equals(pastaId).toArray()
  if (!planos.length) return 0
  return guardarMarcasEAlvos(pasta.obraId, planos)
}

/**
 * Baixa uma pasta para o aparelho.
 *
 * Confere o espaço **antes** de começar, porque falhar no meio no canteiro é o
 * pior resultado possível: a pessoa fica com a pasta pela metade e sem saber
 * quais folhas tem, e descobre isso na frente do problema que veio resolver.
 */
export async function baixarPasta(pastaId: string): Promise<{
  ok: boolean; baixados: number; falharam: number; mensagem: string
}> {
  const pasta = await local.pastas.get(pastaId)
  if (!pasta) return { ok: false, baixados: 0, falharam: 0, mensagem: "pasta desconhecida" }

  const espaco = await cabe(pasta.bytes)
  if (!espaco.cabe) {
    return { ok: false, baixados: 0, falharam: 0, mensagem: espaco.mensagem }
  }

  await local.pastas.update(pastaId, { estado: "baixando" })
  const planos = await local.planos.where("pastaId").equals(pastaId).toArray()

  // A página do documento e o pdf.js vão para o cache do worker junto com a
  // pasta. Sem eles o arquivo estaria no aparelho e a tela que o abre, não.
  aquecerRotas(["/atlas", `/atlas/${pasta.obraId}`, `/atlas/${pasta.obraId}/documents/${pastaId}`])
  void import("@/components/atlas/pdf-page").then(m => m.aquecerPdf()).catch(() => undefined)

  const { baixados, falharam, motivo } = await descerPlanos(pasta.obraId, planos)

  // Os vínculos e seus alvos. Obra mapeada automaticamente tem link em quase
  // toda folha, e link que aponta para folha ausente é pior que link nenhum:
  // ele some sem rede e parece defeito do sistema. Por isso a marcação desce
  // junto com a pasta, e o alvo que mora em outra pasta desce com ela.
  await guardarMarcasEAlvos(pasta.obraId, planos)

  if (cancelados.has(pasta.obraId)) {
    await encerrarPendentes(pasta.obraId)
    // Cancelar foi decisão de quem está olhando a tela: avisar de volta o que
    // a pessoa acabou de mandar fazer é ruído, e pior, com cara de erro.
    return { ok: false, baixados, falharam, mensagem: "" }
  }

  await local.pastas.update(pastaId, {
    estado: falharam === 0 ? "disponivel" : "baixando",
    revisaoLocal: pasta.revisaoServidor,
    baixadoEm: Date.now(),
  })
  await recalcularSelecao(pasta.obraId)
  // As miniaturas descem depois, em segundo plano: são o que desenha a grade de
  // folhas, e sem elas a pasta abre sem rede com um cartão girando por folha.
  void baixarMiniaturas(pastaId).catch(() => 0)
  // O servidor precisa saber quem mantém esta pasta, para poder avisar quando
  // uma sobrescrita atingi-la. É o cenário perigoso: gente no canteiro com
  // revisão vencida sem saber que venceu.
  try {
    await atlasService.setOfflineFolder(pastaId, { localRevision: pasta.revisaoServidor })
  } catch {
    // Sem rede o registro central espera. O download local vale de qualquer
    // jeito, e o próximo ciclo de sincronização reconcilia.
  }

  // A mensagem é de interface, e a interface é em inglês. Além disso ela diz o
  // motivo da primeira falha: "97 sheets did not come down" manda a pessoa
  // adivinhar se foi rede, espaço ou permissão, e no canteiro não há como
  // adivinhar.
  return {
    ok: falharam === 0, baixados, falharam,
    mensagem: falharam === 0
      ? ""
      : `${falharam} ${falharam === 1 ? "sheet" : "sheets"} did not come down${motivo ? `: ${motivo}` : ""}`,
  }
}

/**
 * Baixa a obra inteira: o índice e, depois, cada pasta que ainda não está em dia
 * no aparelho.
 *
 * É a decisão por obra que a faixa Data Details oferece. Todas as pastas a
 * baixar ficam marcadas como "baixando" antes do primeiro arquivo descer, para
 * o progresso somar a obra inteira e não só a pasta da vez.
 */
export async function baixarObra(obraId: string): Promise<{ ok: boolean; mensagem: string }> {
  // Começar limpa a marca: cancelar valia para aquele download, não para sempre.
  cancelados.delete(obraId)
  await baixarIndice(obraId)
  const alvo = (await local.pastas.where("obraId").equals(obraId).toArray())
    .filter(p => p.estado !== "disponivel")
  for (const p of alvo) await local.pastas.update(p.id, { estado: "baixando" })
  aquecerRotas(["/atlas", `/atlas/${obraId}`])

  const falhas: string[] = []
  for (const p of alvo) {
    if (cancelados.has(obraId)) break
    const r = await baixarPasta(p.id)
    if (r.ok) continue
    falhas.push(r.mensagem)
    // Pasta que não chegou a começar (sem espaço, por exemplo) volta ao estado
    // de antes, em vez de ficar girando para sempre.
    if (r.baixados === 0) await local.pastas.update(p.id, { estado: p.estado === "baixando" ? "ausente" : p.estado })
  }
  if (cancelados.has(obraId)) {
    cancelados.delete(obraId)
    await encerrarPendentes(obraId)
    return { ok: false, mensagem: "" }
  }
  await recalcularSelecao(obraId)
  return { ok: falhas.length === 0, mensagem: falhas[0] ?? "" }
}

/**
 * Tira a obra inteira do aparelho: pranchas, miniaturas e o registro de quem a
 * mantém. O índice fica, que é pequeno e não pesa; a obra volta a "nada salvo".
 */
export async function removerObra(obraId: string): Promise<void> {
  const pastas = await local.pastas.where("obraId").equals(obraId).toArray()
  for (const p of pastas) {
    if (p.estado !== "ausente") await liberarPasta(p.id)
  }
  await liberarObra(obraId)
  await local.planos.where("obraId").equals(obraId)
    .modify({ arquivo: null, thumb: null, inteiro: undefined })
  await recalcularSelecao(obraId)
}

/** Devolve os bytes de uma pasta, preservando índice e miniatura. */
export async function liberarPasta(pastaId: string): Promise<void> {
  const { apagarArquivo } = await import("./storage")
  const pasta = await local.pastas.get(pastaId)
  const planos = await local.planos.where("pastaId").equals(pastaId).toArray()
  for (const p of planos) {
    if (p.arquivo) await apagarArquivo(p.arquivo)
    await local.planos.update(p.id, { arquivo: null, inteiro: undefined })
  }
  await local.pastas.update(pastaId, { estado: "ausente", baixadoEm: null })
  if (pasta) await recalcularSelecao(pasta.obraId)
  try { await atlasService.unsetOfflineFolder(pastaId) } catch { /* reconcilia depois */ }
}

/**
 * Traz as miniaturas das folhas de uma pasta para o aparelho.
 *
 * A miniatura vem do bucket por URL assinada, que vence e não abre sem rede.
 * Guardada no OPFS ela é o que desenha a grade de folhas sem sinal. Pesa pouco
 * perto da prancha, e só desce a que falta: chamar de novo não baixa nada.
 */
export async function baixarMiniaturas(pastaId: string): Promise<number> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0
  const faltam = (await local.planos.where("pastaId").equals(pastaId).toArray())
    .filter(p => !p.thumb)
  if (!faltam.length) return 0

  const urls = new Map<string, string>()
  for (const versao of new Set(faltam.map(p => p.versaoId))) {
    for (const t of await atlasService.versionThumbs(versao)) urls.set(t.sheetId, t.url)
  }

  let gravadas = 0
  // Seis por vez: uma a uma, 97 miniaturas levariam o tempo de uma pasta
  // inteira; todas juntas, o celular abre 97 conexões de uma vez.
  const fila = [...faltam]
  async function trabalhar() {
    for (let p = fila.shift(); p; p = fila.shift()) {
      const url = urls.get(p.id)
      if (!url) continue
      // A pasta pode ter sido limpa enquanto a fila andava. Sem conferir, a
      // miniatura seguinte seria gravada de novo num aparelho que acabou de
      // apagar tudo, e ficaria ali ocupando espaço sem pasta nenhuma.
      if ((await local.pastas.get(pastaId))?.estado === "ausente") { fila.length = 0; return }
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const caminho = await gravarArquivo(p.obraId, `${p.id}.thumb`, await res.blob())
        if (!caminho) continue
        await local.planos.update(p.id, { thumb: caminho })
        gravadas++
      } catch {
        // A que falhar fica para a próxima visita com rede.
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, trabalhar))
  return gravadas
}
