"use client"

import { Camera, ChevronDown, ChevronUp, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Label } from "@/components/ui/label"

/** O respiro entre os ladrilhos, em pixels. */
const VAO = 8
/** O menor ladrilho que ainda se toca com o dedo. */
const MINIMO = 64
/** Quantas fileiras a grade mostra aberta, antes de rolar por dentro. */
const FILEIRAS_ABERTA = 3

/**
 * As fotos do ponto, em ladrilhos quadrados.
 *
 * ── Por que a medida é calculada, e não escrita ──
 *
 * Ladrilho de medida fixa sobra espaço na direita de uma tela estreita: cabem
 * três de setenta e dois numa largura de duzentos e noventa, e os catorze que
 * restam viram um vão sem uso. Coluna elástica resolve a largura, mas não a
 * altura: o ladrilho é quadrado, então a altura da fileira depende da largura
 * da coluna, e nenhuma altura escrita à mão acerta as duas coisas em todas as
 * telas.
 *
 * Então a largura da grade é medida e o resto sai dela: quantas colunas cabem,
 * de que tamanho é o lado, e qual é a altura de uma e de três fileiras. Fechada,
 * a grade tem a altura de uma fileira exata; aberta, três, e dali em diante rola
 * por dentro em vez de empurrar o botão de salvar para fora da janela.
 */
export function PhotoGrid({ fotos, onAdd, onRemove }: {
  fotos: File[]
  onAdd: () => void
  onRemove: (i: number) => void
}) {
  const caixa = useRef<HTMLDivElement | null>(null)
  const [lado, setLado] = useState(0)
  const [colunas, setColunas] = useState(0)
  const [aberta, setAberta] = useState(false)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => {
      const largura = el.clientWidth
      if (!largura) return
      const cabem = Math.max(3, Math.floor((largura + VAO) / (MINIMO + VAO)))
      setColunas(cabem)
      setLado(Math.floor((largura - VAO * (cabem - 1)) / cabem))
    }
    medir()
    const olho = new ResizeObserver(medir)
    olho.observe(el)
    return () => olho.disconnect()
  }, [])

  // O ladrilho da câmera ocupa a primeira vaga, então a primeira fileira tem
  // uma foto a menos que o número de colunas.
  const naPrimeira = Math.max(0, colunas - 1)
  const escondidas = aberta ? 0 : Math.max(0, fotos.length - naPrimeira)

  return (
    <div className="flex flex-col gap-1.5">
      {/* Abrir e fechar fica do lado oposto ao rótulo, que é onde a linha tem
          espaço sobrando e onde o olho procura o comando de um bloco. */}
      <div className="flex items-center justify-between gap-2">
        <Label className="gap-1.5">
          Photos
          {fotos.length > 0 && (
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {fotos.length}
            </span>
          )}
        </Label>
        {fotos.length > naPrimeira && (
          <button
            type="button"
            onClick={() => setAberta(v => !v)}
            className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
          >
            {aberta
              ? <ChevronUp className="h-3 w-3 shrink-0" />
              : <ChevronDown className="h-3 w-3 shrink-0" />}
            {aberta ? "Less" : "More"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2">
        {/* A fila inteira está sempre desenhada, e é a altura que anda: tirar e
            pôr ladrilho no meio da animação faz a grade saltar. */}
        <div
          ref={caixa}
          data-hide-scrollbar
          style={lado
            ? {
              gridTemplateColumns: `repeat(${colunas}, ${lado}px)`,
              gridAutoRows: `${lado}px`,
              maxHeight: aberta
                ? lado * FILEIRAS_ABERTA + VAO * (FILEIRAS_ABERTA - 1)
                : lado,
            }
            : undefined}
          className={`grid gap-2 overscroll-contain transition-[max-height] duration-200 ease-out motion-reduce:transition-none ${
            aberta ? "overflow-y-auto" : "overflow-hidden"
          }`}
        >
          <button
            type="button"
            onClick={onAdd}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-ring hover:bg-muted/40 hover:text-foreground"
          >
            <Camera className="h-5 w-5" />
            <span className="text-[11px] font-medium leading-none">
              {fotos.length ? "More" : "Photo"}
            </span>
          </button>

          {fotos.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              className="group/foto relative overflow-hidden rounded-lg border border-border/60"
              title={f.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover" />

              {/* O último ladrilho visível diz que a fila continua. Sem isto,
                  fechada, a grade parecia ter só as da primeira fileira. */}
              {escondidas > 0 && i === naPrimeira - 1 && (
                <button
                  type="button"
                  onClick={() => setAberta(true)}
                  className="absolute inset-0 flex items-center justify-center bg-black/65 text-sm font-semibold text-white"
                >
                  +{escondidas}
                </button>
              )}

              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-neutral-900/70 text-white opacity-0 backdrop-blur transition-opacity group-hover/foto:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {!fotos.length && (
          <span className="text-center text-[11px] leading-tight text-muted-foreground">
            Opens the camera, and it stays open while you shoot.
          </span>
        )}
      </div>
    </div>
  )
}
