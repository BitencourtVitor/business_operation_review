"use client"

import { SheetViewer } from "@/components/atlas/sheet-viewer"
import { useAtlasSheets, useAtlasVersions } from "@/hooks/use-atlas"
import { useState } from "react"

/**
 * A prancha aberta por cima da verificação.
 *
 * Ver documento e conduzir a verificação são duas coisas, e a navegação entre
 * elas é da barra lateral. Antes, tocar em "abrir no desenho" dentro do punch
 * empurrava a pessoa para a página do documento: ela saía da lista que estava
 * percorrendo, caía noutra tela, e para voltar precisava refazer o caminho pela
 * lateral e achar o escopo de novo.
 *
 * Agora o leitor abre sobre o punch. Fechar devolve a lista exatamente onde ela
 * estava, com o mesmo filtro e o mesmo ponto expandido, porque nada foi
 * desmontado: o que mudou foi só o que está por cima.
 *
 * ── O vínculo entre pastas também fica aqui dentro ──
 *
 * Seguir um vínculo para folha de outra pasta trocava de endereço pelo mesmo
 * motivo. Aqui a troca é de estado: a pasta de destino é carregada e o leitor
 * continua aberto. A pessoa segue no punch o tempo todo.
 */
export function PunchSheet({ jobsiteId, documentId, sheetId, noteId, canAnnotate, canManage, onClose }: {
  jobsiteId: string
  documentId: string
  sheetId: string
  /** O ponto que trouxe a pessoa até aqui: a prancha se aproxima dele. */
  noteId?: string
  canAnnotate: boolean
  canManage: boolean
  onClose: () => void
}) {
  // Onde o leitor está agora. Começa no ponto que foi tocado e muda quando um
  // vínculo leva para outra pasta, sem que o leitor feche em nenhum momento.
  const [destino, setDestino] = useState({ documentId, sheetId })
  // A folha escolhida virando página dentro da mesma pasta. Vazio é "a que o
  // destino pede", que é o estado logo depois de chegar.
  const [folhaAberta, setFolhaAberta] = useState("")

  const { data: versions } = useAtlasVersions(destino.documentId)
  const versionId = versions?.[0]?.id ?? ""
  const { data: sheets } = useAtlasSheets(versionId)

  // Derivado, e não guardado: guardar a folha num estado à parte obrigaria a
  // sincronizar por efeito toda vez que a lista chegasse, e efeito que escreve
  // estado logo na chegada é render em cascata.
  //
  // Não achando a folha pedida, abre a primeira da pasta. Abrir vazio seria
  // pior: quem tocou no ponto quer ver o desenho, e uma tela preta não diz se o
  // problema é a folha ou a rede.
  const aberta = (sheets ?? []).find(s => s.id === (folhaAberta || destino.sheetId))
    ?? sheets?.[0]
    ?? null

  if (!aberta) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  return (
    <SheetViewer
      sheet={aberta}
      sheets={sheets ?? []}
      jobsiteId={jobsiteId}
      canAnnotate={canAnnotate}
      canManage={canManage}
      // O destaque vale só na folha em que o ponto está: seguindo um vínculo
      // adiante, piscar um ponto que não está mais ali confundiria.
      spotlightNote={aberta.id === sheetId ? noteId : undefined}
      onClose={onClose}
      onNavigate={folha => setFolhaAberta(folha.id)}
      onFollowOutside={target => {
        setDestino({ documentId: target.documentId, sheetId: target.sheetId })
        setFolhaAberta("")
      }}
    />
  )
}
