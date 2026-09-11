"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  CategoryPicker, LINHA_VAZIA, paraEtiquetas, type LinhaCategoria,
} from "@/components/atlas/category-picker"
import { useSetDocumentTags } from "@/hooks/use-atlas"
import { ListTree } from "lucide-react"
import { useEffect, useState } from "react"

import type { AtlasDocCategory, AtlasDocument } from "@/services/atlas.service"

/**
 * As categorias de um documento.
 *
 * Mora na página do documento, e não na lista da obra: classificar é olhar para
 * o que está classificando. Na lista, o botão pedia para a pessoa decidir o que
 * um documento é sem ter aberto nenhuma prancha dele.
 *
 * Usa o mesmo seletor do envio: a categoria vem da taxonomia do tipo de obra, e
 * não de uma lista de pastas cadastradas antes na obra.
 */

/** "3rd Floor Trusses", "C Unit Cabinet Layout", ou só "Permit Set". */
export function tagLabel(t: { category?: string; name?: string; subcategory: string; axis: string }) {
  const name = t.category ?? t.name ?? ""
  if (!t.subcategory) return name
  return t.axis === "unit"
    ? `${t.subcategory} Unit ${name}`
    : `${t.subcategory} Floor ${name}`
}

export function DocumentTagsDialog({ jobsiteId, doc, categorias, open, onClose }: {
  jobsiteId: string
  doc?: AtlasDocument
  categorias: AtlasDocCategory[]
  open: boolean
  onClose: () => void
}) {
  const setTags = useSetDocumentTags(jobsiteId)
  const [linhas, setLinhas] = useState<LinhaCategoria[]>([LINHA_VAZIA])

  useEffect(() => {
    if (!open || !doc) return
    const atuais = (doc.tags ?? []).map(t => ({ categoryId: t.categoryId, subcategory: t.subcategory }))
    setLinhas(atuais.length ? atuais : [LINHA_VAZIA])
  }, [open, doc])

  const { etiquetas, incompleta } = paraEtiquetas(linhas, categorias)

  function save() {
    if (!doc || incompleta) return
    setTags.mutate({ documentId: doc.id, tags: etiquetas }, { onSuccess: onClose })
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Categories of this document</DialogTitle></DialogHeader>
        <CategoryPicker categorias={categorias} linhas={linhas} onChange={setLinhas} />
        <DialogFooter>
          {/* Mesmo lugar do envio: o aviso à esquerda dos botões, com quebra de linha. */}
          {incompleta && (
            <p className="order-last flex min-w-0 max-w-[13rem] items-start gap-1.5 text-left text-xs text-amber-600 dark:text-amber-400 sm:order-first sm:mr-auto sm:self-center">
              {/* O mesmo ícone da metade da subcategoria: aponta para o campo que falta. */}
              <ListTree className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Pick the subcategory for every category that has one.</span>
            </p>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={setTags.isPending || incompleta} onClick={save}>
            {setTags.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
