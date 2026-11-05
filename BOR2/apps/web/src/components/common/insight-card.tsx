"use client"

import { Fragment } from "react"
import { CircleHelp, Info, MousePointerClick } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// Peças dos painéis do BOR (Workforce, Inventory): card com título e ajuda, KPI e subtítulo de título.

/** Período no título, como subtítulo: linha vertical, cor apagada e peso normal. */
export function Scope({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 font-normal text-muted-foreground">
      <span className="mx-[0.4em] h-[0.9em] w-px bg-border" aria-hidden />{children}
    </span>
  )
}

/** Separador do sistema entre informações: linha vertical (no lugar de "·"). */
export function Sep() {
  return <span className="mx-1.5 inline-block h-3 w-px bg-border align-middle" aria-hidden />
}

/**
 * KPI: rótulo, número e, à direita, o secundário (partes separadas por " · " viram itens com
 * linha vertical entre eles). className permite colar KPIs vizinhos (bordas e cantos).
 */
export function Kpi({ icon: Icon, label, value, sub, tone, className = "", extra }: {
  icon: React.ElementType; label: React.ReactNode; value: string; sub?: string; tone?: "red"; className?: string
  extra?: React.ReactNode // vai depois do secundário, com a mesma linha vertical (ex.: a seta de variação)
}) {
  return (
    <div className={`rounded-xl border border-border bg-card/60 px-4 py-2 ${className}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />{label}
      </p>
      {/* O secundário fica à direita do número e só desce quando falta largura. */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <p className={`text-xl font-semibold tabular-nums ${tone === "red" ? "text-red-600 dark:text-red-400" : ""}`}>{value}</p>
        {sub && (
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {sub.split(" · ").map((part, i) => (
              <Fragment key={i}>{i > 0 && <span className="h-3 w-px bg-border" aria-hidden />}<span>{part}</span></Fragment>
            ))}
            {extra && <><span className="h-3 w-px bg-border" aria-hidden />{extra}</>}
          </p>
        )}
      </div>
    </div>
  )
}

export type HelpSpec = {
  what: React.ReactNode
  items?: { label: string; color?: string; text: React.ReactNode }[]
  note?: React.ReactNode
  action?: React.ReactNode
}

/** Explicação do ícone de dúvida: o que o bloco mostra, o que é cada dado, observação e o que dá para fazer. */
export function HelpBody({ what, items, note, action }: HelpSpec) {
  return (
    <div className="grid w-80 gap-2 text-xs leading-relaxed">
      <p>{what}</p>
      {items && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border pt-2">
          {items.map(i => (
            <Fragment key={i.label}>
              <dt className="flex items-center gap-1.5 self-start font-medium whitespace-nowrap">
                {i.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.color }} />}{i.label}
              </dt>
              <dd className="text-muted-foreground">{i.text}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {note && <p className="flex gap-1.5 border-t border-border pt-2 text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{note}</p>}
      {action && <p className="flex gap-1.5 border-t border-border pt-2 text-muted-foreground"><MousePointerClick className="mt-0.5 h-3.5 w-3.5 shrink-0" />{action}</p>}
    </div>
  )
}

/** Bloco com título, ícone de dúvida (a explicação mora no hover) e o que vai à direita. */
export function Card({ title, help, right, children, className = "" }: {
  title: React.ReactNode; help?: HelpSpec; right?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-card/60 px-4 pt-3 pb-2 max-xl:min-h-[300px] ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1 truncate text-sm font-medium">{title}</p>
        {/* Do lado oposto ao título: a legenda e, por último, a explicação no hover. */}
        <div className="flex shrink-0 items-center gap-3">
          {right}
          {help && (
            <TooltipProvider delay={150}>
              <Tooltip>
                <TooltipTrigger render={<span className="inline-flex cursor-help" />}>
                  <CircleHelp className="h-3.5 w-3.5 text-muted-foreground/70 transition-colors hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-none border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-md [&>:last-child]:hidden"><HelpBody {...help} /></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
