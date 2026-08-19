"use client"

import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSubDocContractors } from "@/hooks/use-subcontractor-docs"
import { pcgSubcontractorContactsService } from "@/services/pcg-projects.service"
import type { PCGSubcontractorContact } from "@/services/pcg-projects.service"

// What the paper needs to know about the sub, beyond the company name the event
// already carries.
export type SubcontractorContact = {
  name: string
  owner: string
  email: string
  phone: string
  // Which of the three the roster could not answer and nobody filled in here.
  // The field is what the button beside the sub turns amber for.
  missing: ("owner" | "email" | "phone")[]
}

const CONTACTS_KEY = ["pcg-subcontractor-contacts"]

// The overrides this module keeps for itself. Read once and shared: the trade
// screen, the document and the button all ask the same question.
export function usePCGSubcontractorContacts() {
  return useQuery({
    queryKey: CONTACTS_KEY,
    queryFn: () => pcgSubcontractorContactsService.list(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useSavePCGSubcontractorContact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (contact: PCGSubcontractorContact) => pcgSubcontractorContactsService.save(contact),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  })
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

// The cadastro's contact boxes get used as notepads — "need to request", "TBD",
// a reminder somebody left in the field. That is not an address and it cannot
// reach a contract, so anything that does not read as one is absent: the paper
// prints nothing and the amber says the contact is still missing.
export function asEmail(raw: string): string {
  const value = raw.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : ""
}

// Same for the phone, judged by the only thing every format shares: enough
// digits to dial. "(973) 474-6684" and "978.962.9247" pass; a note does not.
export function asPhone(raw: string): string {
  const value = raw.trim()
  return (value.match(/\d/g) ?? []).length >= 7 ? value : ""
}

// The event names the sub as text, because that is what the picker writes. The
// contact is read from the Subcontractor Docs roster by that same name —
// archived subs included, since a contract signed with one of them still prints
// — and whatever this module wrote for that sub takes precedence, field by
// field. Nothing written here travels back to the roster.
export function useSubcontractorContact(name: string): SubcontractorContact {
  const { data: roster } = useSubDocContractors(true)
  const { data: overrides } = usePCGSubcontractorContacts()

  return useMemo(() => {
    const key = normalize(name)
    const registered = key
      ? (roster ?? []).find(contractor => normalize(contractor.name) === key)
      : undefined
    const override = key
      ? (overrides ?? []).find(contact => normalize(contact.subcontractor) === key)
      : undefined

    const owner = (override?.owner_name || registered?.owner_name || "").trim()
    const email = asEmail(override?.email || registered?.email || "")
    const phone = asPhone(override?.phone || registered?.phone || "")

    const missing: SubcontractorContact["missing"] = []
    if (!owner) missing.push("owner")
    if (!email) missing.push("email")
    if (!phone) missing.push("phone")

    return { name, owner, email, phone, missing }
  }, [roster, overrides, name])
}
