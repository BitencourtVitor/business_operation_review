"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useSetDocumentTags } from "@/hooks/use-atlas"
import { useEffect, useState } from "react"

import type { AtlasDocument, AtlasJobsiteCategory } from "@/services/atlas.service"

/**
 * As categorias de um documento.
 *
 * Mora na página do documento, e não na lista da obra: classificar é olhar para
 * o que está classificando. Na lista, o botão pedia para a pessoa decidir o que
 * um documento é sem ter aberto nenhuma prancha dele.
 */

/** "3rd Floor Trusses", "C Unit Cabinet Layout", ou só "Permit Set". */
export function tagLabel(t: { category?: string; name?: string; subcategory: string; axis: string }) {
  const name = t.category ?? t.name ?? ""
  if (!t.subcategory) return name
  return t.axis === "unit"
    ? `${t.subcategory} Unit ${name}`
    : `${t.subcategory} Floor ${name}`
}

export function DocumentTagsDialog({ jobsiteId, doc, slots, open, onClose }: {
  jobsiteId: string
  doc?: AtlasDocument
  slots: AtlasJobsiteCategory[]
  open: boolean
  onClose: () => void
}) {
  const setTags = useSetDocumentTags(jobsiteId)
  const [picked, setPicked] = useState<string[]>([])

  useEffect(() => {
    if (open && doc) setPicked((doc.tags ?? []).map(t => `${t.categoryId}:${t.subcategory}`))
  }, [open, doc])

  function save() {
    if (!doc) return
    setTags.mutate({
      documentId: doc.id,
      tags: picked.map(k => {
        const [id, sub] = k.split(":")
        return { categoryId: Number(id), subcategory: sub ?? "" }
      }),
    }, { onSuccess: onClose })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Categories of this document</DialogTitle></DialogHeader>
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This jobsite has no category yet. Add one from the jobsite room first.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {slots.map(sl => {
                const key = `${sl.categoryId}:${sl.subcategory}`
                const on = picked.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPicked(prev =>
                      on ? prev.filter(k => k !== key) : [...prev, key])}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      on
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {tagLabel(sl)}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              A document can carry more than one. A set covering the 3rd and the 4th floor is
              one document with two.
            </p>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={setTags.isPending} onClick={save}>
            {setTags.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
