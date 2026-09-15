"use client"

import { useEffect, useRef, useState } from "react"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  resColor,
  resIcon,
  resCategory,
  toTitleCase,
  CATEGORY_ORDER,
} from "../_lib/trade-config"

export function TradesLegend({ displayResources }: { displayResources: string[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Tocar fora fecha. Sem isso, no celular a legenda ficava aberta por cima do
  // cronograma até alguém achar o botão de novo.
  useEffect(() => {
    if (!open) return
    const fora = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", fora)
    return () => document.removeEventListener("pointerdown", fora)
  }, [open])

  // Passar o mouse abre só com mouse de verdade. No toque o navegador simula
  // mouseenter antes do clique, e o clique fechava na hora o que tinha acabado
  // de abrir.
  return (
    <div
      ref={ref}
      className="relative max-sm:static"
      onPointerEnter={e => { if (e.pointerType === "mouse") setOpen(true) }}
      onPointerLeave={e => { if (e.pointerType === "mouse") setOpen(false) }}
    >
      {/* Toque também abre: no celular não existe passar o mouse. */}
      <button onPointerUp={e => { if (e.pointerType !== "mouse") setOpen(o => !o) }} aria-label="Legend" className="flex items-center justify-center w-7 h-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors">
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && displayResources.length > 0 && (() => {
        const groupMap = new Map<string, string[]>()
        for (const r of displayResources) {
          const cat = resCategory(r)
          if (!groupMap.has(cat)) groupMap.set(cat, [])
          groupMap.get(cat)?.push(r)
        }
        const groups = CATEGORY_ORDER
          .filter(l => groupMap.has(l))
          .map(l => ({ label: l, items: groupMap.get(l)! }))
        return (
          // No celular o quadro se prende à largura da linha de controles (o
          // wrapper vira static), e não ao botão: preso ao botão, passava da
          // borda da janela. No computador segue ancorado à direita do botão.
          // No celular são duas listas verticais lado a lado, Chart e Trades,
          // um item embaixo do outro: em grade, os nomes eram cortados.
          <div className="absolute top-full z-50 mt-1.5 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover p-3 shadow-xl max-sm:inset-x-0 max-sm:grid max-sm:grid-cols-2 max-sm:gap-3 sm:right-0 sm:w-[520px]">
            <div className="min-w-0">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Chart</div>
            <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-4">
              {[
                { label: "Project start", line: "#10b981" },
                { label: "Project end",   line: "#f43f5e" },
                { label: "Today",         line: "rgba(148,163,184,0.7)" },
                { label: "Current month", bg: true },
              ].map(({ label, line, bg }) => (
                <div key={label} className="flex min-w-0 items-center gap-2 py-1 text-[11px] text-foreground/80">
                  {bg
                    ? <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-primary/40 bg-primary/20" />
                    : <span className="flex h-3.5 w-3.5 shrink-0 justify-center"><span className="h-full" style={{ borderLeft: `2px dashed ${line}` }} /></span>}
                  <span className="truncate">{label}</span>
                </div>
              ))}
            </div>
            </div>

            <div className="min-w-0 max-sm:border-l max-sm:border-border/50 max-sm:pl-3">
            {groups.map(({ label, items }, gi) => (
              <div key={label} className={cn("sm:mt-3 sm:border-t sm:border-border/50 sm:pt-2.5", gi > 0 && "max-sm:mt-2.5")}>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-3">
                  {items.map(r => {
                    const Icon = resIcon(r)
                    return (
                      <div key={r} className="flex min-w-0 items-center gap-2 py-1 text-[11px] text-foreground/80">
                        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded", resColor(r))}>
                          {Icon ? <Icon className="h-3 w-3" /> : <span className="text-[8px] font-bold">{toTitleCase(r).slice(0, 2)}</span>}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{toTitleCase(r)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
