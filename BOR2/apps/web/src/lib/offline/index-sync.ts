import { atlasService } from "@/services/atlas.service"
import { local } from "./db"
import { cabe, gravarArquivo } from "./storage"

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

/**
 * Traz o índice completo da obra para o aparelho.
 *
 * Stale-while-revalidate: quem chama já tem o que estava gravado e continua
 * tendo enquanto isto roda. A tela não espera, e se a rede falhar ela segue
 * mostrando o índice anterior em vez de esvaziar.
 */
export async function baixarIndice(obraId: string): Promise<{ planos: number }> {
  const documentos = await atlasService.listDocuments(obraId)
  let planos = 0

  for (const d of documentos) {
    const versoes = await atlasService.listVersions(d.id)
    // Só a versão vigente entra no índice. As anteriores continuam no servidor e
    // são o histórico; trazê-las multiplicaria o índice por revisão para um dado
    // que o campo não consulta.
    const atual = versoes[0]
    if (!atual) continue

    await local.pastas.put({
      id: d.id, obraId, name: d.name,
      category: d.category ?? "", subcategory: d.subcategory ?? "",
      estado: (await local.pastas.get(d.id))?.estado ?? "ausente",
      revisaoLocal: (await local.pastas.get(d.id))?.revisaoLocal ?? 0,
      revisaoServidor: versoes.length,
      bytes: atual.byteSize ?? 0,
      baixadoEm: (await local.pastas.get(d.id))?.baixadoEm ?? null,
    })

    const folhas = await atlasService.listSheets(atual.id)
    for (const s of folhas) {
      const antes = await local.planos.get(s.id)
      await local.planos.put({
        id: s.id, pastaId: d.id, obraId, versaoId: atual.id,
        pageIndex: s.pageIndex, sheetNumber: s.sheetNumber ?? "", title: s.title ?? "",
        // O caminho do arquivo é preservado. Reescrever o índice não pode
        // desfazer um download: a pessoa perderia a pasta que baixou no Wi-Fi
        // só porque abriu a obra de novo.
        arquivo: antes?.arquivo ?? null,
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

  let baixados = 0, falharam = 0
  for (const p of planos) {
    if (p.arquivo) { baixados++; continue }
    try {
      const { url } = await atlasService.sheetUrl(p.id)
      const res = await fetch(url)
      if (!res.ok) { falharam++; continue }
      const caminho = await gravarArquivo(pasta.obraId, `${p.id}.pdf`, await res.blob())
      if (!caminho) { falharam++; continue }
      await local.planos.update(p.id, { arquivo: caminho })
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

/** Devolve os bytes de uma pasta, preservando índice e miniatura. */
export async function liberarPasta(pastaId: string): Promise<void> {
  const { apagarArquivo } = await import("./storage")
  const planos = await local.planos.where("pastaId").equals(pastaId).toArray()
  for (const p of planos) {
    if (p.arquivo) await apagarArquivo(p.arquivo)
    await local.planos.update(p.id, { arquivo: null })
  }
  await local.pastas.update(pastaId, { estado: "ausente", baixadoEm: null })
  try { await atlasService.unsetOfflineFolder(pastaId) } catch { /* reconcilia depois */ }
}
