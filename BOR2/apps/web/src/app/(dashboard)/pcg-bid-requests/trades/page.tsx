"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, FileText, Plus, Search, SearchX, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useCatalogStore, emptyTrade } from "../_lib/catalog-store"
import { useCanEditBidRequests } from "../_lib/use-can-edit"
import type { Trade } from "../_lib/types"
import { TradeCard } from "../_components/trade-card"
import { TradeEditorModal } from "../_components/trade-editor-modal"
import { DocumentBlocksModal } from "../_components/document-blocks-modal"

type Filter = "all" | "bid_form" | "direct"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "bid_form", label: "Bid form" },
  { value: "direct",   label: "Direct contract" },
]

export default function TradeCatalogPage() {
  const { trades, documentBlocks, addTrade, updateTrade, deleteTrade, setDocumentBlocks } = useCatalogStore()
  const canEdit = useCanEditBidRequests()

  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [editing, setEditing] = useState<Trade | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Trade | null>(null)
  const [editingBlocks, setEditingBlocks] = useState(false)

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return trades.filter(t => {
      if (filter === "bid_form" && !t.hasBidForm) return false
      if (filter === "direct" && t.hasBidForm) return false
      if (!term) return true
      return t.name.toLowerCase().includes(term) || (t.code ?? "").toLowerCase().includes(term)
    })
  }, [trades, search, filter])

  function saveTrade(trade: Trade) {
    if (isNew) addTrade(trade)
    else updateTrade(trade.id, trade)
    setEditing(null)
    setIsNew(false)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 flex flex-wrap items-center gap-3 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/pcg-bid-requests"
            aria-label="Back to projects"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-8 w-px bg-border" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Trade Catalog</h1>
            <p className="text-sm text-muted-foreground">
              Questionnaire and standard scope
            </p>
          </div>
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search trades"
            className="h-8 w-[200px] pl-8 pr-8 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex h-8 items-center rounded-lg border border-input bg-transparent p-0.5 dark:bg-input/30">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`flex h-7 items-center rounded-md px-2.5 text-xs font-medium transition-colors ${
                filter === f.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {canEdit && (
          <>
            <Button variant="outline" onClick={() => setEditingBlocks(true)}>
              <FileText className="h-4 w-4" />
              Document defaults
            </Button>

            <Button onClick={() => { setEditing(emptyTrade()); setIsNew(true) }}>
              <Plus className="h-4 w-4" />
              New trade
            </Button>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-3">
          <span className="flex items-center text-sm font-semibold leading-none">Trade List</span>
          <span className="flex items-center text-xs leading-none text-muted-foreground">
            {visible.length === trades.length ? trades.length : `${visible.length} of ${trades.length}`}
          </span>
        </div>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
          {visible.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <SearchX className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No trade matches this filter.</p>
            </div>
          ) : (
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {visible.map(trade => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  onEdit={canEdit ? () => { setEditing(trade); setIsNew(false) } : undefined}
                  onDelete={canEdit ? () => setPendingDelete(trade) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <TradeEditorModal
        trade={editing}
        isNew={isNew}
        onSave={saveTrade}
        onClose={() => { setEditing(null); setIsNew(false) }}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={v => { if (!v) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its questionnaire and standard scope go with it. Projects already using this trade keep what they have.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (pendingDelete) deleteTrade(pendingDelete.id); setPendingDelete(null) }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingBlocks && (
        <DocumentBlocksModal
          blocks={documentBlocks}
          onSave={blocks => { setDocumentBlocks(blocks); setEditingBlocks(false) }}
          onClose={() => setEditingBlocks(false)}
        />
      )}
    </div>
  )
}
