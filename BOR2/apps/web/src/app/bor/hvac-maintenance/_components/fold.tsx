"use client"

import { ChevronDown } from "lucide-react"

/**
 * Um bloco sanfona do modal. Aberto, cresce até ocupar o espaço da coluna e o
 * conteúdo rola por dentro; fechado, vira só o cabeçalho com a contagem e um
 * resumo. Abre e fecha deslizando, para quem olha entender o que mudou.
 */
export function Fold({ title, count, summary, open, onToggle, children }: {
  title: string; count: number; summary?: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <section className={`flex min-h-0 flex-col border-t pt-3 transition-[flex-grow] duration-300 ease-out ${open ? "grow" : "grow-0"}`}>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex items-center gap-2 text-left">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
        <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground tabular-nums">{count}</span>
        <span className={`min-w-0 flex-1 truncate text-xs text-muted-foreground transition-opacity duration-300 ${open ? "opacity-0" : "opacity-100"}`}>
          {summary}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {/* A linha da grade vai de 0 à altura do conteúdo: é o que faz deslizar. */}
      <div
        inert={!open}
        className={`grid min-h-0 flex-1 transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      </div>
    </section>
  )
}
