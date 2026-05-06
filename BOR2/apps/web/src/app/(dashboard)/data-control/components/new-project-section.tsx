"use client"

import { NewProjectCard } from "@/components/features/data-control/project-card"
import { useCreateForecast } from "@/hooks/use-forecast"
import { useClients, useJobSites } from "@/hooks/use-clients"
import { useMemo } from "react"

interface NewProjectSectionProps {
  onCreated: () => void
}

export function NewProjectSection({ onCreated }: NewProjectSectionProps) {
  const createMutation = useCreateForecast()
  const { data: catalogClients  = [] } = useClients()
  const { data: catalogJobSites = [] } = useJobSites()
  const availableClients  = useMemo(() => catalogClients.map(c => c.name).sort(),  [catalogClients])
  const availableJobSites = useMemo(() => catalogJobSites.map(s => s.name).sort(), [catalogJobSites])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New Project</h1>
        <p className="text-sm text-muted-foreground">Fill in the fields below and click Create</p>
      </div>
      <NewProjectCard
        availableClients={availableClients}
        availableJobSites={availableJobSites}
        saving={createMutation.isPending}
        onSave={async data => {
          await createMutation.mutateAsync({
            ...data,
            company: "framing",
            name: "",
            contractValue: 0,
            team: "",
            machineProvider: "",
            previousBeamsDate: data.previousBeamsDate || null,
            previousStartDate: data.previousStartDate || null,
            previousEndDate:   data.previousEndDate   || null,
          })
        }}
      />
    </div>
  )
}
