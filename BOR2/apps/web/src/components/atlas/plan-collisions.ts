"use client"

import { sameContent, type Fingerprint } from "@/components/atlas/plan-fingerprint"

/**
 * O que fazer com cada página que está entrando.
 *
 * A gestão documental parte de uma expectativa: cada pasta tem o seu arquivo, e
 * dentro dele páginas que não se repetem. A expectativa não se sustenta
 * sozinha. O projetista reexporta o set inteiro por causa de três pranchas, a
 * mesma prancha volta com outro nome, o gabarito lê a mesma identificação em
 * duas folhas diferentes. Quem organiza documento não evita a bagunça: se
 * antevê a ela.
 *
 * O nome sozinho não resolve, porque nome é justamente o que bagunça. Cruzar
 * nome com conteúdo dá quatro respostas, e cada uma pede uma coisa diferente do
 * usuário:
 *
 *                    │ conteúdo igual        │ conteúdo diferente
 *   ─────────────────┼───────────────────────┼──────────────────────
 *    nome igual      │ duplicate: recusa     │ conflict: oferece
 *                    │ já está publicada     │ sobrescrever, desmarcado
 *   ─────────────────┼───────────────────────┼──────────────────────
 *    nome diferente  │ twin: avisa, e deixa  │ fresh: entra
 *                    │ comparar as duas      │ sem pergunta
 *
 * Nada aqui decide sozinho o que sobrescreve. A função classifica e explica; o
 * ato é sempre de quem envia, e é isso que separa "o sistema fez" de "eu fiz".
 */
export type CollisionKind = "fresh" | "duplicate" | "conflict" | "twin"

/** Com quem a página bateu. */
export interface CollisionMatch {
  /** Uma folha já publicada, ou outra página do próprio arquivo que subiu. */
  where: "published" | "incoming"
  /** A folha publicada, quando é o caso: é ela que a sobrescrita revisa. */
  sheetId?: string
  /** A página do arquivo, contando de zero. */
  pageIndex?: number
  name: string
}

export interface IncomingPage {
  pageIndex: number
  /** O nome final, já com o sufixo de desempate se houve. */
  name: string
  /** O que o gabarito leu, antes do sufixo: é por aqui que a repetição aparece. */
  read: string
  fingerprint: Fingerprint
}

export interface PublishedSheet {
  id: string
  sheetNumber: string
  fingerprint: Fingerprint
}

export interface PageVerdict {
  pageIndex: number
  name: string
  kind: CollisionKind
  /** Ausente em `fresh`. */
  match?: CollisionMatch
}

/**
 * Classifica cada página do arquivo que está entrando.
 *
 * A ordem em que os quatro casos são testados não é arbitrária, e é onde mora a
 * regra de verdade:
 *
 *   1. `duplicate` primeiro. Mesmo nome e mesmo conteúdo é a página que já está
 *      lá. Não há o que versionar, e oferecer sobrescrita seria oferecer trocar
 *      uma coisa por ela mesma.
 *   2. `twin` antes de `conflict`. Se o conteúdo já existe publicado sob outro
 *      nome, aceitar a sobrescrita criaria uma segunda cópia do mesmo desenho
 *      no mesmo documento, agora em duas folhas. O aviso precisa vir antes da
 *      oferta.
 *   3. `conflict` por último entre os avisos. Aí sim são duas pranchas de
 *      verdade disputando o mesmo nome, e a pergunta é legítima.
 *
 * O confronto é primeiro com o que está publicado, que é a autoridade, e só
 * depois com as páginas anteriores do próprio arquivo. Arquivo que se repete
 * por dentro é problema do arquivo, e aparece do mesmo jeito.
 */
export function classifyPages(
  incoming: IncomingPage[],
  published: PublishedSheet[],
): PageVerdict[] {
  const out: PageVerdict[] = []
  // As páginas já classificadas viram referência para as seguintes: a segunda
  // cópia dentro do arquivo bate na primeira, e não o contrário.
  const seen: IncomingPage[] = []

  for (const page of incoming) {
    // O desempate do gabarito só existe dentro de um arquivo. Contra o que está
    // publicado vale o nome final, que é o que está gravado na folha; entre
    // páginas do mesmo arquivo vale o que foi lido, antes do sufixo, senão a
    // repetição some justamente por ter sido desempatada.
    const byNamePublished = published.filter(s => s.sheetNumber && s.sheetNumber === page.name)
    const byNameIncoming = seen.filter(p => p.read && p.read === page.read)

    const named: (CollisionMatch & { fp: Fingerprint })[] = [
      ...byNamePublished.map(s => ({ where: "published" as const, sheetId: s.id, name: s.sheetNumber, fp: s.fingerprint })),
      ...byNameIncoming.map(p => ({ where: "incoming" as const, pageIndex: p.pageIndex, name: p.name, fp: p.fingerprint })),
    ]

    const identical = named.find(m => sameContent(m.fp, page.fingerprint))
    if (identical) {
      out.push({ pageIndex: page.pageIndex, name: page.name, kind: "duplicate", match: strip(identical) })
      seen.push(page)
      continue
    }

    const twinPublished = published.find(s =>
      s.sheetNumber !== page.name && sameContent(s.fingerprint, page.fingerprint))
    const twinIncoming = seen.find(p =>
      p.read !== page.read && sameContent(p.fingerprint, page.fingerprint))
    const twin = twinPublished
      ? { where: "published" as const, sheetId: twinPublished.id, name: twinPublished.sheetNumber }
      : twinIncoming
        ? { where: "incoming" as const, pageIndex: twinIncoming.pageIndex, name: twinIncoming.name }
        : undefined
    if (twin) {
      out.push({ pageIndex: page.pageIndex, name: page.name, kind: "twin", match: twin })
      seen.push(page)
      continue
    }

    if (named.length) {
      out.push({ pageIndex: page.pageIndex, name: page.name, kind: "conflict", match: strip(named[0]) })
      seen.push(page)
      continue
    }

    out.push({ pageIndex: page.pageIndex, name: page.name, kind: "fresh" })
    seen.push(page)
  }

  return out
}

function strip(m: CollisionMatch & { fp: Fingerprint }): CollisionMatch {
  return { where: m.where, sheetId: m.sheetId, pageIndex: m.pageIndex, name: m.name }
}

/** Quantas de cada, para o resumo dizer o tamanho do problema antes da lista. */
export function tally(verdicts: PageVerdict[]): Record<CollisionKind, number> {
  const out: Record<CollisionKind, number> = { fresh: 0, duplicate: 0, conflict: 0, twin: 0 }
  for (const v of verdicts) out[v.kind] += 1
  return out
}
