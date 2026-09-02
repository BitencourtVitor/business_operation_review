"use client"

import { useState } from "react"
import { Building2, Loader2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useBuildings, useCreateBuilding } from "@/hooks/use-buildings"
import { BuildingCard } from "./_components/building-card"
import { BuildingForm } from "./_components/building-form"

export default function BuildingScheduleManagePage() {
  const { data: buildings = [], isLoading } = useBuildings()
  const createMut = useCreateBuilding()
  const [showAdd, setShowAdd] = useState(false)

  async function handleCreate(name: string, address: string) {
    await createMut.mutateAsync({ name, address })
    setShowAdd(false)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between pb-4 shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Schedule Data Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage buildings and upload MS Project PDF schedules</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Add Building
        </Button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-sm">New Building</h2>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <BuildingForm onSave={handleCreate} onCancel={() => setShowAdd(false)} />
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && buildings.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Building2 className="h-12 w-12 opacity-20" />
          <p className="text-sm">No buildings yet. Click &ldquo;Add Building&rdquo; to get started.</p>
        </div>
      )}

      {!isLoading && buildings.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-4 pb-4">
            {buildings.map(b => (
              <BuildingCard key={b.id} building={b} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
