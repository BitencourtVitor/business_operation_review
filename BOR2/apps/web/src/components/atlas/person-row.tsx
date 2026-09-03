"use client"

import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react"

/**
 * Uma pessoa na lista de quem vê a obra, em dois toques.
 *
 * O primeiro toque escolhe a pessoa e revela o botão; o segundo age. No celular
 * e no tablet não existe hover para revelar nada, e um toque só tirava alguém da
 * obra sem chance de perceber o engano. Vale também com mouse: a mesma tela se
 * comportando diferente conforme o aparelho é imprevisível.
 */
export function PersonRow({ name, hidden, armed, onSelect, onAct }: {
  name: string
  /** Verdadeiro quando esta pessoa está bloqueada hoje. */
  hidden: boolean
  armed: boolean
  onSelect: () => void
  onAct: () => void
}) {
  return (
    <div
      // Altura travada em 34: o botão só existe quando a pessoa está escolhida,
      // e sem isto a linha crescia 4px no momento do clique, empurrando a lista
      // inteira para baixo justo quando a mira precisa ficar parada.
      // A linha é a mesma nas duas metades: nome em texto normal, borda e
      // realce iguais. Quem está fora já está dito pelo bloco em que a linha
      // mora, pelo fundo dele e pelo olho cortado; pintar o nome de vermelho
      // repetia isso uma quarta vez e fazia uma pessoa bloqueada parecer um
      // erro do sistema. A única cor que sobra é a da seta, que não descreve
      // estado e sim para onde o clique leva.
      className={`flex h-[34px] w-full shrink-0 items-stretch overflow-hidden rounded-md border text-sm transition-colors ${
        armed ? "border-border bg-accent/40" : "border-transparent"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 px-1.5 text-left"
      >
        {hidden
          ? <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </button>

      {/* Conjugado, como o bloco da obra na barra lateral: uma peça ao lado da
          outra, separadas por borda, e a de ação ocupando a altura inteira. Um
          ícone de 20px solto no canto pede pontaria; uma coluna de ponta a
          ponta se acerta com o polegar sem olhar.

          A seta aponta para onde o nome vai, e já vem com a cor de lá: verde
          para descer até quem vê, vermelho para subir até quem não vê. Cor que
          só aparece no hover não existe em tablet, e é justamente ali que a
          consequência do toque precisa estar dita antes do toque. */}
      {armed && (
        <button
          type="button"
          onClick={onAct}
          title={hidden ? "Move down: let this person see the project" : "Move up: hide the project from this person"}
          className={`flex shrink-0 items-center justify-center border-l border-inherit px-2.5 transition-colors ${
            hidden
              ? "text-emerald-500 hover:bg-emerald-500/15"
              : "text-destructive hover:bg-destructive/15"
          }`}
        >
          {hidden ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  )
}
