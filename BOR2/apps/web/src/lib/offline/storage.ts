/**
 * O disco do aparelho: onde a prancha fica, e quanto cabe.
 *
 * Duas coisas separadas que costumam ser confundidas.
 *
 * **Persistência** é pedir que o sistema não descarte os dados sob pressão de
 * armazenamento. Não é permissão de acesso ao disco, e no WebKit não abre prompt
 * nenhum: é concedida por heurística, e o critério que mais pesa é o app estar
 * instalado na tela de início. É por isso que a instalação virou requisito de
 * onboarding e não sugestão.
 *
 * **Cota** é quanto cabe. O iOS parte de cerca de 1 GB por origem e pode subir,
 * mediante prompt do próprio Safari, até algo em torno de 20% do espaço livre.
 * Os 20% são teto e não passo, e os valores mudam entre versões. Por isso nada
 * aqui é constante: mede-se antes de cada download.
 */

/** O que o navegador diz sobre o espaço, agora. */
export interface Espaco {
  /** Quanto já está usado por esta origem, em bytes. */
  usado: number
  /** O teto atual. Zero quando o navegador não sabe responder. */
  cota: number
  livre: number
  /** Se o sistema prometeu não descartar. */
  persistente: boolean
  /** Se a API existe. Navegador antigo responde não e o app segue funcionando. */
  suportado: boolean
}

export async function medirEspaco(): Promise<Espaco> {
  const vazio: Espaco = { usado: 0, cota: 0, livre: 0, persistente: false, suportado: false }
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return vazio
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    const persistente = navigator.storage.persisted
      ? await navigator.storage.persisted()
      : false
    return {
      usado: usage, cota: quota,
      livre: Math.max(0, quota - usage),
      persistente, suportado: true,
    }
  } catch {
    return vazio
  }
}

/**
 * Pede persistência, e devolve se conseguiu.
 *
 * Chamar isto cedo é de graça e chamar tarde pode ser tarde demais: o navegador
 * decide por heurística, e a heurística melhora conforme o app é usado. Pedir no
 * primeiro uso e de novo depois da primeira pasta baixada cobre os dois momentos.
 */
export async function pedirPersistencia(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false
  try {
    if (navigator.storage.persisted && await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/**
 * Se um lote cabe, e o que dizer quando não cabe.
 *
 * A verificação existe para o download **não falhar no meio**. Falhar no meio no
 * canteiro é o pior resultado possível: a pessoa fica com a pasta pela metade e
 * sem saber quais folhas tem, e descobre isso na frente do problema que veio
 * resolver.
 *
 * A folga de 10% não é superstição: o navegador contabiliza mais coisa do que os
 * arquivos que o app grava, e encostar no teto exato faz a escrita falhar antes
 * do número bater.
 */
export interface Cabimento {
  cabe: boolean
  precisa: number
  livre: number
  faltam: number
  mensagem: string
}

export async function cabe(bytes: number): Promise<Cabimento> {
  const e = await medirEspaco()
  if (!e.suportado || e.cota === 0) {
    // Sem API não há como saber. Deixar seguir é melhor que bloquear por
    // ignorância: o pior caso vira um erro de escrita, que é tratável, e o caso
    // comum é um navegador que simplesmente não implementa a medição.
    return { cabe: true, precisa: bytes, livre: 0, faltam: 0, mensagem: "" }
  }
  const util = e.livre * 0.9
  const faltam = Math.max(0, bytes - util)
  return {
    cabe: faltam === 0,
    precisa: bytes, livre: e.livre, faltam,
    mensagem: faltam === 0
      ? ""
      : `Faltam ${mb(faltam)} para esta pasta caber. Libere outra pasta ou conecte no Wi-Fi para ampliar o espaço.`,
  }
}

export function mb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

// ── OPFS ────────────────────────────────────────────────────────────────────
//
// O Origin Private File System é um sistema de arquivos privado do domínio,
// gravado no disco do aparelho. É o lugar certo para a prancha: mais rápido que
// o IndexedDB para arquivo grande, e com leitura parcial, que é o que permite
// abrir uma página de um PDF sem carregar os 112 MB na memória.
//
// A hierarquia é rasa de propósito, `obras/<obraId>/<planoId>.pdf`. Um diretório
// por pasta pareceria organizado e criaria um nível a mais para percorrer em
// toda leitura, num sistema de arquivos que não tem índice.

async function raiz(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return null
  try {
    return await navigator.storage.getDirectory()
  } catch {
    return null
  }
}

async function pastaDaObra(obraId: string, criar: boolean) {
  const r = await raiz()
  if (!r) return null
  try {
    const obras = await r.getDirectoryHandle("obras", { create: criar })
    return await obras.getDirectoryHandle(obraId, { create: criar })
  } catch {
    return null
  }
}

export async function gravarArquivo(
  obraId: string, nome: string, dados: Blob,
): Promise<string | null> {
  const dir = await pastaDaObra(obraId, true)
  if (!dir) return null
  try {
    const h = await dir.getFileHandle(nome, { create: true })
    const w = await h.createWritable()
    await w.write(dados)
    await w.close()
    return `obras/${obraId}/${nome}`
  } catch {
    // Quase sempre cota estourada. Devolver nulo em vez de lançar deixa o
    // chamador decidir: um download em lote continua com os próximos e reporta
    // o que faltou, em vez de morrer na primeira folha.
    return null
  }
}

export async function lerArquivo(caminho: string): Promise<File | null> {
  const partes = caminho.split("/")
  if (partes.length !== 3) return null
  const dir = await pastaDaObra(partes[1], false)
  if (!dir) return null
  try {
    const h = await dir.getFileHandle(partes[2])
    return await h.getFile()
  } catch {
    return null
  }
}

export async function apagarArquivo(caminho: string): Promise<void> {
  const partes = caminho.split("/")
  if (partes.length !== 3) return
  const dir = await pastaDaObra(partes[1], false)
  if (!dir) return
  try {
    await dir.removeEntry(partes[2])
  } catch {
    // Já não existe. Não é erro: apagar o que não está lá é o resultado
    // desejado, e tratar como falha faria a expiração parar no meio.
  }
}

/**
 * Quanto cada arquivo de uma obra ocupa no aparelho, medido no disco.
 *
 * Só lê: pede o tamanho de cada arquivo sem abrir o conteúdo. É o número real,
 * e não a estimativa do servidor, que conta o PDF original e não os recortes e
 * miniaturas que de fato ficaram guardados.
 */
export async function tamanhosDaObra(obraId: string): Promise<{
  total: number
  /** Tamanho por caminho, no mesmo formato gravado no plano (`obras/<obra>/<arquivo>`). */
  porArquivo: Map<string, number>
}> {
  const porArquivo = new Map<string, number>()
  const dir = await pastaDaObra(obraId, false)
  if (!dir) return { total: 0, porArquivo }
  let total = 0
  try {
    // @ts-expect-error a iteração de diretório ainda não está no lib.dom padrão
    for await (const [nome, h] of dir.entries()) {
      if (h.kind !== "file") continue
      const tamanho = (await h.getFile()).size
      porArquivo.set(`obras/${obraId}/${nome}`, tamanho)
      total += tamanho
    }
  } catch {
    // Diretório sumiu no meio da leitura: vale o que foi medido até ali.
  }
  return { total, porArquivo }
}

/**
 * Libera os bytes de uma obra inteira, preservando o resto.
 *
 * É o que a expiração por inatividade faz. Os arquivos saem; a seleção, o
 * metadado e as miniaturas ficam no IndexedDB, e é isso que permite reativar com
 * um toque em vez de reconfigurar tudo de novo.
 */
export async function liberarObra(obraId: string): Promise<number> {
  const r = await raiz()
  if (!r) return 0
  try {
    const obras = await r.getDirectoryHandle("obras", { create: false })
    let bytes = 0
    const dir = await obras.getDirectoryHandle(obraId, { create: false })
    // @ts-expect-error a iteração de diretório ainda não está no lib.dom padrão
    for await (const [, h] of dir.entries()) {
      if (h.kind === "file") bytes += (await h.getFile()).size
    }
    await obras.removeEntry(obraId, { recursive: true })
    return bytes
  } catch {
    return 0
  }
}
