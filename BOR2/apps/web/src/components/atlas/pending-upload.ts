/**
 * O arquivo que já foi escolhido numa tela e vai subir na seguinte.
 *
 * Documento novo nasce do PDF: a sala da obra pergunta o arquivo, o nome e as
 * etiquetas, cria o documento e manda a pessoa para a página dele, que é onde
 * as folhas aparecem uma a uma enquanto sobem. Só que um `File` não atravessa
 * uma navegação, e reabrir o seletor do outro lado seria pedir o mesmo arquivo
 * duas vezes.
 *
 * Fica na memória do módulo, e não em storage: um `File` não se serializa, e
 * isto vale para o salto de uma tela à outra, não para sobreviver a um reload.
 * Se a pessoa recarregar antes, o documento existe e vazio, e ela sobe por lá.
 */
type Pending = { file: File; names?: Map<number, string> }

const waiting = new Map<string, Pending>()

export function stashUpload(documentId: string, payload: Pending) {
  waiting.set(documentId, payload)
}

/** Entrega uma vez só: quem pegou, sobe. */
export function takeUpload(documentId: string): Pending | undefined {
  const found = waiting.get(documentId)
  waiting.delete(documentId)
  return found
}
