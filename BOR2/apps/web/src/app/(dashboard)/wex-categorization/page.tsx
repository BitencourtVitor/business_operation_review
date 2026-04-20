"use client"

import { CreditCard } from "lucide-react"

export default function WexCategorizationPage() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">WEX Categorization</h1>
        <p className="text-sm text-muted-foreground">
          Categorize and reconcile WEX fuel card transactions
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border">
        <div className="text-center">
          <CreditCard className="mx-auto h-10 w-10 text-muted-foreground/20" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">Under construction</p>
          <p className="mt-1 text-xs text-muted-foreground/50">This page is being built.</p>
        </div>
      </div>
    </div>
  )
}
