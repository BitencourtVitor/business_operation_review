"use client"

import { useState } from "react"
import type { RefObject } from "react"
import { Loader2, UserPen } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useSavePCGSubcontractorContact, useSubcontractorContact } from "../_lib/use-subcontractor-contact"
import type { SubcontractorContact } from "../_lib/use-subcontractor-contact"

const FIELD_LABEL = "text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60"
const INPUT = "h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring dark:bg-input/30"

// The contact the contract prints, edited from the trade. What is typed here is
// the PCG's own: it covers a gap in the Subcontractor Docs roster, or corrects
// it for the paper this module issues, and never writes back to the roster.
export function SubcontractorContactButton({
  subcontractor, canEdit, anchor,
}: {
  subcontractor: string
  canEdit: boolean
  // The field, not this icon: the popup opens the width of the field and on the
  // same side, the way the bids popup hangs off the condition.
  anchor: RefObject<HTMLDivElement | null>
}) {
  const contact = useSubcontractorContact(subcontractor)
  const [open, setOpen] = useState(false)

  if (!subcontractor) return null

  const incomplete = contact.missing.length > 0
  const missing = contact.missing.join(", ")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={incomplete ? `Contact missing: ${missing}` : "Subcontractor contact"}
        title={incomplete ? `Contact is missing: ${missing}` : "Contact used on the contract"}
        className={`-mr-1 shrink-0 rounded p-1 transition-colors ${
          incomplete
            ? "text-amber-500 hover:text-amber-400"
            : "text-muted-foreground/60 hover:text-foreground"
        }`}
      >
        <UserPen className="h-3.5 w-3.5" />
      </PopoverTrigger>

      <PopoverContent
        anchor={anchor}
        side="bottom"
        align="start"
        collisionAvoidance={{ fallbackAxisSide: "none" }}
        className="max-h-(--available-height) w-(--anchor-width) gap-0 overflow-y-auto p-0 text-foreground"
      >
        <div className="border-b border-border/50 px-3 py-2">
          <p className="text-sm font-semibold leading-none">Contact on the contract</p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Kept in Bids and Contracts only. Subcontractor Docs is not changed.
          </p>
        </div>
        {/* Keyed on what the fields are seeded with, so a save — or roster data
            that only lands after the popup is already open — starts the form over
            instead of leaving stale text on screen. */}
        <ContactForm
          key={`${contact.owner}|${contact.email}|${contact.phone}`}
          contact={contact}
          subcontractor={subcontractor}
          canEdit={canEdit}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

// The fields open filled with what the contract would print — the cadastro's own
// answer, typed in and editable, not a ghost placeholder. Correcting one here
// writes the correction to this module alone; Subcontractor Docs is untouched.
function ContactForm({
  contact, subcontractor, canEdit, onDone,
}: {
  contact: SubcontractorContact
  subcontractor: string
  canEdit: boolean
  onDone: () => void
}) {
  const save = useSavePCGSubcontractorContact()
  const [owner, setOwner] = useState(contact.owner)
  const [email, setEmail] = useState(contact.email)
  const [phone, setPhone] = useState(contact.phone)

  const commit = () => {
    save.mutate(
      {
        subcontractor,
        owner_name: owner.trim(),
        email: email.trim(),
        phone: phone.trim(),
      },
      { onSuccess: onDone },
    )
  }

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <Field label="Owner / Responsible" value={owner} onChange={setOwner} disabled={!canEdit} />
      <Field label="Email" value={email} onChange={setEmail} disabled={!canEdit} />
      <Field label="Phone" value={phone} onChange={setPhone} disabled={!canEdit} />

      {/* Um PUT que falha não pode ser indistinguível de um clique que não fez
          nada: sem isto, o popover ficava aberto e a pessoa concluía que salvar
          não funciona. */}
      {save.isError && (
        <p className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] leading-snug text-destructive">
          Não foi possível salvar: {(save.error as Error)?.message || "erro desconhecido"}
        </p>
      )}

      {canEdit && (
        <div className="flex items-center justify-end gap-2 pt-0.5">
          <button onClick={onDone}
            className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Cancel
          </button>
          <button onClick={commit} disabled={save.isPending}
            className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-50">
            {save.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Save
          </button>
        </div>
      )}
    </div>
  )
}

// Empty means the contract has nothing to print on this line, so the field
// carries the same amber the button does.
function Field({
  label, value, onChange, disabled,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className={FIELD_LABEL}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        placeholder="Not registered"
        className={`${INPUT} ${value.trim() ? "" : "border-amber-500/60"}`} />
    </div>
  )
}
