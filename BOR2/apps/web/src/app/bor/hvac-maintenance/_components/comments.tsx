"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarDays, Check, Loader2, MessageSquareText, Pencil, SendHorizontal, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { ROLE_ICON } from "@/components/features/forecast/obs-history"
import { hvacMaintenanceService, type MaintenanceComment } from "@/services/hvac-maintenance.service"
import { useAuthStore } from "@/store/auth.store"
import { Fold } from "./fold"

/** Data e hora no fuso de quem lê: "10/26/2026, 4:52 PM". */
const stamp = (ts: string) =>
  new Date(ts).toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" })

// A conversa do contrato. Quem escreve assina pela sessão (o servidor põe nome
// e cargo); a tela só manda o texto.
export function Comments({ contractId, open, onToggle }: { contractId: string; open: boolean; onToggle: () => void }) {
  const qc = useQueryClient()
  const key = ["hvac-maintenance", contractId, "comments"]
  const me = useAuthStore(s => s.user?.id)
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => hvacMaintenanceService.listComments(contractId) })
  const refresh = () => void qc.invalidateQueries({ queryKey: key })
  const [text, setText] = useState("")
  const add = useMutation({
    mutationFn: () => hvacMaintenanceService.addComment(contractId, text.trim()),
    onSuccess: () => { setText(""); refresh() },
    onError: () => toast.error("Could not post the comment"),
  })
  const send = () => { if (text.trim() && !add.isPending) add.mutate() }
  const last = data?.at(-1)

  return (
    <Fold
      title="Comments" count={data?.length ?? 0} open={open} onToggle={onToggle}
      summary={last && `${last.authorName}: ${last.body}`}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border p-3">
        <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto">
          {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {data?.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
          {data?.map(c => <Comment key={c.id} c={c} contractId={contractId} mine={!!me && c.authorId === me} onChanged={refresh} />)}
        </div>

        <InputGroup className="items-start">
          <InputGroupAddon className="pt-2.5"><MessageSquareText /></InputGroupAddon>
          <InputGroupTextarea
            rows={2} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send() }}
            placeholder="Write a comment (Ctrl+Enter to post)"
          />
          <InputGroupAddon align="inline-end" className="self-end pb-1.5">
            <InputGroupButton size="icon-xs" aria-label="Post comment" disabled={!text.trim() || add.isPending} onClick={send}>
              {add.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </Fold>
  )
}

/**
 * Um comentário. Editar e apagar só aparecem para quem escreveu, e o servidor
 * confere de novo pela sessão: esconder botão não é autorização. Apagar pede
 * confirmação no lugar do botão, sem diálogo por cima do texto.
 */
function Comment({ c, contractId, mine, onChanged }: {
  c: MaintenanceComment; contractId: string; mine: boolean; onChanged: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const role = ROLE_ICON[c.authorRole] ?? ROLE_ICON.user
  const save = useMutation({
    mutationFn: () => hvacMaintenanceService.updateComment(contractId, c.id, draft!.trim()),
    onSuccess: () => { setDraft(null); onChanged() },
    onError: () => toast.error("Could not edit the comment"),
  })
  const remove = useMutation({
    mutationFn: () => hvacMaintenanceService.removeComment(contractId, c.id),
    onSuccess: onChanged,
    onError: () => toast.error("Could not delete the comment"),
  })

  return (
    <div className="group rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <role.Icon className={`h-3.5 w-3.5 ${role.className}`} />
        <span className="font-semibold text-foreground">{c.authorName || "Unknown"}</span>
        <CalendarDays className="ml-1.5 h-3.5 w-3.5" />
        <span className="tabular-nums">{stamp(c.createdAt)}</span>
        {mine && draft === null && (
          <span className="ml-auto flex items-center gap-0.5">
            {confirming ? (
              <>
                <span className="mr-1 text-red-600 dark:text-red-400">Delete?</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-red-600 hover:text-red-600" aria-label="Confirm delete" disabled={remove.isPending} onClick={() => remove.mutate()}>
                  {remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Keep comment" onClick={() => setConfirming(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Edit comment" onClick={() => setDraft(c.body)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-red-600" aria-label="Delete comment" onClick={() => setConfirming(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </span>
        )}
      </div>

      {draft === null ? (
        <p className="mt-1 text-sm break-words whitespace-pre-wrap">{c.body}</p>
      ) : (
        <InputGroup className="mt-1.5 items-start">
          <InputGroupAddon className="pt-2.5"><Pencil /></InputGroupAddon>
          <InputGroupTextarea
            autoFocus rows={2} value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") { e.stopPropagation(); setDraft(null) }
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && draft.trim()) save.mutate()
            }}
          />
          <InputGroupAddon align="inline-end" className="self-end gap-0.5 pb-1.5">
            <InputGroupButton size="icon-xs" aria-label="Cancel edit" onClick={() => setDraft(null)}><X /></InputGroupButton>
            <InputGroupButton size="icon-xs" aria-label="Save comment" disabled={!draft.trim() || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      )}
    </div>
  )
}
