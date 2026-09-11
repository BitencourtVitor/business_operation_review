import { getQueryClient } from "@/lib/query-client"
import { atlasService, type AtlasJobsite } from "@/services/atlas.service"
import { aquecerRotas } from "./aquecer"
import { local } from "./db"
import { cabe, gravarArquivo, liberarObra } from "./storage"

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

  for (const d of documentos) {
    const versoes = await atlasService.listVersions(d.id)
    qc.setQueryData(["atlas", "versions", d.id], versoes)
    // Só a versão vigente entra no índice. As anteriores continuam no servidor e
    // são o histórico; trazê-las multiplicaria o índice por revisão para um dado
    // que o campo não consulta.
    const atual = versoes[0]
    if (!atual) continue

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
      planos++
    }
  }
  return { planos }
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

  let baixados = 0, falharam = 0
  // Versão que nunca foi recortada devolve o set inteiro para toda folha. Ele
  // desce uma vez e todas as folhas apontam para o mesmo arquivo: baixar de
  // novo a cada folha multiplicaria o set pelo número de páginas.
  let setInteiro: string | null = null
  for (const p of planos) {
    if (p.arquivo) { baixados++; continue }
    try {
      const fonte = await atlasService.sheetUrl(p.id)
      if (fonte.whole && setInteiro) {
        await local.planos.update(p.id, { arquivo: setInteiro, inteiro: true })
        baixados++
        continue
      }
      const res = await fetch(fonte.url)
      if (!res.ok) { falharam++; continue }
      const nome = fonte.whole ? `${p.versaoId}.pdf` : `${p.id}.pdf`
      const caminho = await gravarArquivo(pasta.obraId, nome, await res.blob())
      if (!caminho) { falharam++; continue }
      if (fonte.whole) setInteiro = caminho
      await local.planos.update(p.id, { arquivo: caminho, inteiro: fonte.whole })
      baixados++
    } catch {
      // Uma folha que não desce não derruba a pasta. O laço segue e o relatório
      // final diz quantas faltaram, para a pessoa poder tentar de novo só o
      // que faltou em vez de rebaixar tudo.
      falharam++
    }
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

  return {
    ok: falharam === 0, baixados, falharam,
    mensagem: falharam === 0 ? "" : `${falharam} ${falharam === 1 ? "folha não desceu" : "folhas não desceram"}`,
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
  await baixarIndice(obraId)
  const alvo = (await local.pastas.where("obraId").equals(obraId).toArray())
    .filter(p => p.estado !== "disponivel")
  for (const p of alvo) await local.pastas.update(p.id, { estado: "baixando" })
  aquecerRotas(["/atlas", `/atlas/${obraId}`])

  const falhas: string[] = []
  for (const p of alvo) {
    const r = await baixarPasta(p.id)
    if (r.ok) continue
    falhas.push(r.mensagem)
    // Pasta que não chegou a começar (sem espaço, por exemplo) volta ao estado
    // de antes, em vez de ficar girando para sempre.
    if (r.baixados === 0) await local.pastas.update(p.id, { estado: p.estado === "baixando" ? "ausente" : p.estado })
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
