"use client"

import { loadPdf } from "@/components/atlas/pdf-page"
import { atlasService, type AtlasSheet } from "@/services/atlas.service"
import { useEffect, useState } from "react"

export interface PlanSource {
  url: string
  /** Verdadeiro quando o que veio foi o set inteiro, não o recorte da página. */
  whole: boolean
  pageIndex: number
}

// URL assinada por folha, guardada enquanto o leitor está aberto. Cada folha é
// um objeto próprio no bucket, e pedir a assinatura de novo a cada troca de
// página seria uma ida à API por virada.
const cache = new Map<string, Promise<PlanSource>>()

function resolve(sheetId: string): Promise<PlanSource> {
  const hit = cache.get(sheetId)
  if (hit) return hit
  const promise = atlasService.sheetUrl(sheetId)
  cache.set(sheetId, promise)
  return promise
}

/**
 * A folha aberta, com a anterior e a seguinte já a caminho.
 *
 * Três páginas em memória é o mínimo para virar página sem esperar: o leitor de
 * obra é usado passando adiante, e o custo de adiantar duas é baixo agora que
 * cada plano é um PDF de ~1,7 MB em vez do set de 107 MB.
 */
export function usePlanSource(sheet: AtlasSheet, neighbours: AtlasSheet[]) {
  const [source, setSource] = useState<PlanSource | null>(null)

  useEffect(() => {
    let alive = true
    setSource(null)
    resolve(sheet.id)
      .then(s => { if (alive) setSource(s) })
      .catch(() => { if (alive) setSource(null) })
    return () => { alive = false }
  }, [sheet.id])

  useEffect(() => {
    // Adianta o vizinho em silêncio: assina a URL e manda o pdf.js já baixar o
    // arquivo. Falha aqui não vira erro na tela — é adiantamento, não leitura.
    let alive = true
    for (const neighbour of neighbours) {
      if (!neighbour || neighbour.id === sheet.id) continue
      resolve(neighbour.id)
        .then(s => { if (alive && s.url) void loadPdf(s.url).catch(() => {}) })
        .catch(() => {})
    }
    return () => { alive = false }
  }, [sheet.id, neighbours])

  return source
}
