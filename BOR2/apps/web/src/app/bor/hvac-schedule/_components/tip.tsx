"use client"

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// A dica da página, no lugar do `title` nativo do navegador, que demora a
// aparecer e quase ninguém descobre. O filho vira o próprio gatilho, então não
// entra elemento a mais no layout. Sem texto, não há dica.
export function Tip({ text, children }: { text?: string; children: React.ReactElement }) {
  if (!text) return children
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={children} />
        <TooltipContent side="top" className="max-w-[240px] text-center text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
