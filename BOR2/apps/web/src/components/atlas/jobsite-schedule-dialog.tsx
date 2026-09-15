"use client"

import { ScheduleBoard } from "@/app/bor/building-schedule/_components/schedule-board"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useAtlasJobsiteSchedule } from "@/hooks/use-atlas"
import { usePermission } from "@/hooks/use-permission"
import { GanttChartSquare } from "lucide-react"
import { useState } from "react"

/**
 * O cronograma do projeto sem sair do Atlas.
 *
 * Abre numa janela o mesmo quadro do Building Schedule do BOR, preso ao prédio
 * ligado a este projeto: Gantt, datas, eventos e comentários gravam nas mesmas
 * tabelas, então o que se anota aqui aparece lá. O botão só existe quando há
 * cronograma ligado e para quem vê o Building Schedule; para os outros, um botão
 * que abre um vazio seria porta falsa.
 */
export function JobsiteScheduleButton({ jobsiteId }: { jobsiteId: string }) {
  const { canView } = usePermission()
  const pode = canView("building_schedule")
  const { data: link } = useAtlasJobsiteSchedule(jobsiteId, pode)
  const [aberto, setAberto] = useState(false)

  if (!pode || !link) return null

  return (
    <>
      {/* No celular fica só o ícone, como o Archive: por extenso, os três botões
          empurravam o nome da seção para fora da linha. */}
      <Button variant="outline" className="gap-1.5" onClick={() => setAberto(true)} title="See Building Schedule">
        <GanttChartSquare className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">See Building Schedule</span>
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        {/* Quase a tela inteira: o Gantt precisa de largura para ser lido, e uma
            janela estreita obrigava a rolar para os lados a cada fase. */}
        <DialogContent showCloseButton={false} className="flex h-[92dvh] w-[96vw] max-w-[96vw] flex-col gap-0 p-5 sm:max-w-[96vw]">
          <DialogTitle className="sr-only">Building Schedule · {link.name}</DialogTitle>
          <div className="min-h-0 flex-1">
            <ScheduleBoard
              buildingId={link.buildingId}
              title="Building Schedule"
              subtitle={link.name}
              onClose={() => setAberto(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
