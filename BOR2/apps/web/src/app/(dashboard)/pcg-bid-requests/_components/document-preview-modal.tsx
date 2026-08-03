"use client"

import { Printer, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { BidRequestDocument } from "./bid-request-document"
import type { Project, ProjectTrade, Trade } from "../_lib/types"

export function DocumentPreviewModal({
  project, projectTrade, trade, onClose,
}: {
  project: Project
  projectTrade: ProjectTrade
  trade: Trade
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[92vh] w-[min(96vw,9.6in)] max-w-none! flex-col gap-0 p-0"
      >
        <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3 print:hidden">
          <DialogTitle className="min-w-0 flex-1 truncate text-base">
            {trade.name} Bid Request
          </DialogTitle>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" />
            Print / Save as PDF
          </Button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-200 p-6 dark:bg-neutral-800">
          <div className="mx-auto w-fit shadow-lg">
            <BidRequestDocument project={project} projectTrade={projectTrade} trade={trade} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
