"use client"

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { KIND_META, placeLabel } from "@/components/atlas/jobsite-form-dialog"
import type { AtlasJobsite } from "@/services/atlas.service"
import { MapPin } from "lucide-react"
import { useEffect, useState } from "react"

export function ArchiveConfirm({ jobsite, onClose, onConfirm }: {
  jobsite: AtlasJobsite | null
  onClose: () => void
  onConfirm: (id: string) => void
}) {
  const [left, setLeft] = useState(3)

  useEffect(() => {
    if (!jobsite) return
    setLeft(3)
    const timer = setInterval(() => setLeft(v => (v <= 1 ? 0 : v - 1)), 1000)
    return () => clearInterval(timer)
  }, [jobsite])

  return (
    <AlertDialog open={!!jobsite} onOpenChange={o => { if (!o) onClose() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this project?</AlertDialogTitle>
          {/* A obra se identifica aqui do mesmo jeito que no cartão: lugar em
              cima, identificação embaixo e em negrito. Quem confirma precisa
              reconhecer qual obra está saindo, e um nome corrido no meio do
              parágrafo não se reconhece. */}
          <div className="flex w-full flex-col gap-0.5 text-left">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {jobsite ? placeLabel(jobsite.community || jobsite.address || jobsite.name) : ""}
            </span>
            <span className="flex items-center gap-1.5 text-base font-semibold text-foreground">
              {jobsite && (() => {
                const K = (KIND_META[jobsite.kind] ?? KIND_META.house).icon
                return <K className="h-4 w-4 shrink-0 text-muted-foreground" />
              })()}
              {jobsite
                ? [(KIND_META[jobsite.kind] ?? KIND_META.house).label, jobsite.unit || jobsite.code]
                    .filter(Boolean).join(" ")
                : ""}
            </span>
          </div>
          <AlertDialogDescription>
            It leaves the list for everyone. Documents, photos and diary stay on file.
            Nothing is deleted, and the project can be reactivated later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={left > 0}
            onClick={() => jobsite && onConfirm(jobsite.id)}
          >
            {left > 0 ? `Yes, archive (${left})` : "Yes, archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
