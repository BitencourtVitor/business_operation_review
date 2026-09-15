"use client"

import { ScheduleBoard } from "@/app/bor/building-schedule/_components/schedule-board"
import { useAtlasJobsite, useAtlasJobsiteSchedule } from "@/hooks/use-atlas"
import { usePermission } from "@/hooks/use-permission"
import { GanttChartSquare } from "lucide-react"
import { useParams } from "next/navigation"

/**
 * O cronograma do projeto, dentro do Atlas.
 *
 * É o mesmo quadro do Building Schedule do BOR, preso ao prédio ligado a este
 * projeto no Manage de lá. Eventos, comentários e datas reais gravam no mesmo
 * lugar: o que se anota aqui aparece no BOR, e o contrário.
 */
export default function JobsiteSchedulePage() {
  const { jobsiteId } = useParams<{ jobsiteId: string }>()
  const { canView } = usePermission()
  const pode = canView("building_schedule")
  const { data: jobsite } = useAtlasJobsite(jobsiteId)
  const { data: link, isLoading } = useAtlasJobsiteSchedule(jobsiteId, pode)

  if (!pode || (!isLoading && !link)) {
    return (
      <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <GanttChartSquare className="h-10 w-10 opacity-20" />
        <p className="text-sm">
          {pode
            ? "No building schedule is linked to this project. Link one in BOR, Schedule Data Management."
            : "You don't have access to the building schedule."}
        </p>
      </div>
    )
  }

  if (!link) return null

  return (
    <div className="h-full min-h-[32rem]">
      <ScheduleBoard
        buildingId={link.buildingId}
        title="Schedule"
        subtitle={jobsite ? `${link.name} · ${jobsite.name}` : link.name}
      />
    </div>
  )
}
