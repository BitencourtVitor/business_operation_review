"use client"

import { useState } from "react"
import { Check, Copy, Link2, Loader2, Power, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDateTime } from "../_lib/format"
import type { Project, ProjectTrade, Trade } from "../_lib/types"
import { formLink, pcgFormsService, type PCGBidForm } from "@/services/pcg-forms.service"

// Links de formulário deste trade nesta obra.
//
// O link é mandado no WhatsApp e responde sem login, então o que ele carrega é
// uma cópia congelada das perguntas, tirada no momento da criação. O mesmo
// trade pode ter vários: cada envio fecha o seu, e quem precisa de outra rodada
// cria outro link em vez de reabrir o que já foi respondido.
//
// O que volta nunca cai sozinho sobre as respostas do trade. Aplicar é um
// clique separado, dado por quem abriu e leu.
export function FormLinksPopover({
  project, trade, canEdit, onApply,
}: {
  project: Project
  trade: Trade
  canEdit: boolean
  onApply: (answers: ProjectTrade["answers"]) => void
}) {
  const [open, setOpen] = useState(false)
  const [forms, setForms] = useState<PCGBidForm[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState("")

  async function toggle(next: boolean) {
    setOpen(next)
    if (!next) return
    setLoading(true)
    try {
      const all = await pcgFormsService.list(project.id)
      setForms(all.filter(f => f.tradeId === trade.id))
    } finally {
      setLoading(false)
    }
  }

  async function copy(id: string) {
    await navigator.clipboard.writeText(formLink(id))
    setCopied(id)
    setTimeout(() => setCopied(c => (c === id ? "" : c)), 1500)
  }

  async function create() {
    setCreating(true)
    try {
      const form = await pcgFormsService.create(project.id, trade.id, {
        projectName: project.name,
        projectAddress: project.address,
        tradeName: trade.name,
        icon: trade.icon,
        questions: trade.questions,
      })
      setForms(fs => [form, ...fs])
      await copy(form.id)
    } finally {
      setCreating(false)
    }
  }

  async function setAvailable(form: PCGBidForm, available: boolean) {
    const saved = await pcgFormsService.setAvailable(form.id, available)
    setForms(fs => fs.map(f => (f.id === form.id ? saved : f)))
  }

  async function remove(id: string) {
    await pcgFormsService.remove(id)
    setForms(fs => fs.filter(f => f.id !== id))
  }

  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger
        render={
          <Button size="sm" variant="outline">
            <Link2 className="h-3.5 w-3.5" />
            Form link
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[22rem] p-3">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-medium">Form links</p>
          {canEdit && (
            <Button size="sm" onClick={create} disabled={creating}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              New link
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Opens without login. Answering closes the link.
        </p>

        <div className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
          {loading && <Loader2 className="mx-auto my-4 h-4 w-4 animate-spin text-muted-foreground" />}

          {!loading && forms.length === 0 && (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              No link for this trade yet.
            </p>
          )}

          {forms.map(form => {
            const answered = !!form.submittedAt
            return (
              <div key={form.id} className="rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    answered ? "bg-emerald-500" : form.available ? "bg-primary" : "bg-muted-foreground/40"
                  }`} />
                  <span className="flex-1 text-xs font-medium">
                    {answered ? "Answered" : form.available ? "Open" : "Turned off"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDateTime(form.submittedAt ?? form.createdAt)}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  {answered ? (
                    canEdit && (
                      <Button size="sm" variant="outline" onClick={() => onApply(form.answers ?? {})}>
                        <Check className="h-3.5 w-3.5" />
                        Apply answers
                      </Button>
                    )
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => copy(form.id)}>
                        {copied === form.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied === form.id ? "Copied" : "Copy link"}
                      </Button>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAvailable(form, !form.available)}
                          title={form.available ? "Turn the link off" : "Turn the link back on"}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {form.available ? "Turn off" : "Turn on"}
                        </Button>
                      )}
                    </>
                  )}
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() => remove(form.id)}
                      aria-label="Delete this form"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
