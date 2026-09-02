"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ForecastProject } from "@bor2/shared"

interface DeleteDialogProps {
  project:   ForecastProject | null
  onClose:   () => void
  onConfirm: () => void
  deleting:  boolean
}

export function DeleteDialog({ project, onClose, onConfirm, deleting }: DeleteDialogProps) {
  return (
    <Dialog open={!!project} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete project?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will permanently delete{" "}
          <span className="font-medium text-foreground">{project?.name}</span>.{" "}
          This action cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
