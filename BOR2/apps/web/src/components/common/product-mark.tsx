"use client"

import type { ProductId } from "@/lib/products"
import { cn } from "@/lib/utils"
import { useId } from "react"

/**
 * A marca dos dois produtos, no azul e no vermelho da logo da Premium.
 *
 * O desenho é o mesmo glifo do lucide que a interface usa em botão e etiqueta
 * (`drafting-compass` no Atlas, `circle-gauge` no BOR); o que muda aqui é a
 * cor. O SVG é escrito à mão porque o componente do lucide pinta tudo com
 * `currentColor`, e aqui o traço inteiro corre num gradiente do azul ao
 * vermelho, da esquerda para a direita — uma cor só atravessando o glifo, não
 * um vetor de cada cor.
 *
 * As cores saíram do PNG da logo: azul #1E5B9A e vermelho #DA202E.
 */

const AZUL = "#1E5B9A"
const VERMELHO = "#DA202E"

const TRACOS: Record<ProductId, { d?: string; c?: [number, number, number] }[]> = {
  atlas: [
    { d: "M19.136 12a10 10 0 0 1-14.271 0" },
    { c: [12, 5, 2] },
    { d: "m3 21 8.02-14.26" },
    { d: "m12.99 6.74 1.93 3.44" },
    { d: "m21 21-2.16-3.84" },
  ],
  bor: [
    { d: "M15.6 2.7a10 10 0 1 0 5.7 5.7" },
    { d: "M13.4 10.6 19 5" },
    { c: [12, 12, 2] },
  ],
}

export function ProductMark({ product, className }: { product: ProductId; className?: string }) {
  // Id próprio por instância: dois cabeçalhos na mesma página com o mesmo id de
  // gradiente fariam o segundo herdar o primeiro.
  const id = `marca-${useId().replace(/:/g, "")}`
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={`url(#${id})`}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        {/* A mesma diagonal da logo da Premium: o vermelho sai de baixo, à
            esquerda, o azul desce do alto, à direita, e os dois se encontram no
            meio. O gradiente acompanha a caixa do desenho, e não os cantos do
            quadro, senão a maior parte do traço cai de um lado só e a marca
            parece de uma cor com um canto da outra. */}
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={VERMELHO} />
          <stop offset="100%" stopColor={AZUL} />
        </linearGradient>
      </defs>
      {TRACOS[product].map((t, i) =>
        t.c
          ? <circle key={i} cx={t.c[0]} cy={t.c[1]} r={t.c[2]} />
          : <path   key={i} d={t.d} />
      )}
    </svg>
  )
}
