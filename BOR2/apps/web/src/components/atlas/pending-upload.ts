/**
 * O arquivo que já foi escolhido numa tela e vai subir na seguinte.
 *
 * Documento novo nasce do PDF: a sala da obra pergunta o arquivo, o nome e as
 * etiquetas, cria o documento e manda a pessoa para a página dele, que é onde
 * as folhas aparecem uma a uma enquanto sobem. Só que um `File` não atravessa
 * uma navegação, e reabrir o seletor do outro lado seria pedir o mesmo arquivo
 * duas vezes.
 *
 * A memória do módulo é o caminho curto, para o salto de uma tela à outra. Ela
 * sozinha não bastava: a navegação falhando (recarga, aba fechada, página que
 * não monta) levava junto o arquivo, a leitura dos nomes e os vínculos já
 * conferidos, e sobrava um documento criado e vazio, sem dizer o que houve.
 * Por isso o mesmo envio também é gravado no aparelho, e a página do documento
 * o retoma sozinha quando a memória não tem nada.
 */
import { apagarArquivo, gravarArquivo, lerArquivo } from "@/lib/offline/storage"
import type { VinculoConfirmado } from "@/components/atlas/autolink-step"

/**
 * Os vínculos confirmados viajam junto: eles foram decididos antes do envio,
 * sobre o arquivo local, e só podem ser gravados depois que as folhas existem.
 */
type Pending = { file: File; names?: Map<number, string>; links?: VinculoConfirmado[] }

const waiting = new Map<string, Pending>()

/** O índice do que está gravado, para achar o arquivo sem varrer o disco. */
const CHAVE = "atlas-envio-pendente"

interface Bilhete {
  obraId: string
  caminho: string
  nomeDoArquivo: string
  names?: Array<[number, string]>
  links?: VinculoConfirmado[]
}

function bilhetes(): Record<string, Bilhete> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || "{}") as Record<string, Bilhete>
  } catch {
    return {}
  }
}

function gravarBilhetes(todos: Record<string, Bilhete>) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(todos))
  } catch {
    // Sem espaço para o índice, sobra a memória do módulo. O envio da navegação
    // normal continua funcionando; só a retomada deixa de existir.
  }
}

export function stashUpload(documentId: string, payload: Pending, obraId?: string) {
  waiting.set(documentId, payload)
  if (!obraId) return
  // Grava por fora, sem segurar a navegação: o caminho curto é a memória, e o
  // disco é a rede de segurança. Um PDF grande levaria segundos para copiar, e
  // esperar isso atrasaria a tela por um caso que quase nunca acontece.
  void gravarArquivo(obraId, `pendente-${documentId}.pdf`, payload.file).then(caminho => {
    if (!caminho) return
    gravarBilhetes({
      ...bilhetes(),
      [documentId]: {
        obraId,
        caminho,
        nomeDoArquivo: payload.file.name,
        names: payload.names ? [...payload.names.entries()] : undefined,
        links: payload.links,
      },
    })
  }).catch(() => undefined)
}

/** Entrega uma vez só: quem pegou, sobe. */
export function takeUpload(documentId: string): Pending | undefined {
  const found = waiting.get(documentId)
  waiting.delete(documentId)
  return found
}

/**
 * O envio que ficou gravado no aparelho, quando a memória não tem nada.
 *
 * A cópia no disco não é apagada aqui: ela só sai quando o envio termina bem.
 * Assim uma falha no meio do caminho ainda pode ser retomada na próxima visita,
 * em vez de sumir na primeira tentativa.
 */
export async function retomarUpload(documentId: string): Promise<Pending | undefined> {
  const b = bilhetes()[documentId]
  if (!b) return undefined
  const file = await lerArquivo(b.caminho)
  if (!file) {
    await descartarUpload(documentId)
    return undefined
  }
  return {
    file: new File([file], b.nomeDoArquivo, { type: "application/pdf" }),
    names: b.names ? new Map(b.names) : undefined,
    links: b.links,
  }
}

/** Some com a cópia guardada. Chamar quando o envio termina bem. */
export async function descartarUpload(documentId: string) {
  waiting.delete(documentId)
  const todos = bilhetes()
  const b = todos[documentId]
  if (!b) return
  delete todos[documentId]
  gravarBilhetes(todos)
  await apagarArquivo(b.caminho)
}
