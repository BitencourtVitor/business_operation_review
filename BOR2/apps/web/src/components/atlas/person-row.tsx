"use client"

import { Eye, EyeOff, X } from "lucide-react"

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
      className={`flex w-full items-center gap-2 rounded-md border px-1.5 py-1.5 text-sm transition-colors ${
        armed
          ? hidden
            ? "border-destructive/50 bg-destructive/10"
            : "border-border bg-accent/40"
          : "border-transparent"
      } ${hidden ? "text-destructive" : ""}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        {hidden
          ? <EyeOff className="h-3.5 w-3.5 shrink-0" />
          : <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </button>

      {armed && (
        <button
          type="button"
          onClick={onAct}
          title={hidden ? "Let this person see the project again" : "Hide the project from this person"}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
            hidden
              ? "text-destructive hover:bg-destructive/20"
              : "text-muted-foreground hover:bg-muted hover:text-destructive"
          }`}
        >
          {hidden ? <X className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      )}
    </div>
  )
}
