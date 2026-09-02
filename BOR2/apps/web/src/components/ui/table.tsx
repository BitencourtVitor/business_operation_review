"use client"

import type * as React from "react"

import { cn } from "@/lib/utils"

// Cabeçalho congelado é comportamento do componente, não de cada página.
//
// Três coisas precisam ser verdade ao mesmo tempo para `position: sticky`
// funcionar num <th>, e nenhuma delas é óbvia:
//
//   1. O sticky vai no <th>. Em <thead> não pega em todo navegador.
//   2. A tabela precisa estar em `border-separate`. O Chrome ignora sticky sob
//      `border-collapse`, que é o padrão do Tailwind. Como separate não pinta
//      borda de <tr>, a linha divisória passa a viver nas células.
//   3. Quem rola precisa ser este contêiner, o ancestral de rolagem que o
//      sticky enxerga. Rolar num <div> por fora deixa o cabeçalho preso a um
//      elemento que não rola — que é o bug que isto resolve.
//
// Quem quiser altura própria passa `containerClassName`; sem isso a tabela
// cresce e quem rola é a página, como sempre foi.
function Table({ className, containerClassName, ...props }: React.ComponentProps<"table"> & {
  containerClassName?: string
}) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-separate border-spacing-0 text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted [&_th]:border-b",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child>td]:border-b-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        // A borda mora nas células: em border-separate, borda de <tr> não pinta.
        "transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted [&>td]:border-b [&>td]:border-border",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
