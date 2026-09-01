"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import {
  useAtlasDocumentCategories, useCreateDocumentCategory, useDeleteDocumentCategory,
} from "@/hooks/use-atlas"
import { Building2, Home, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

// Prédio e casa são os dois formatos de obra, com o vocabulário que o Forecast
// já usa: `type` Building para prédio, Lot para casa. Cliente sem tipo no
// catálogo (Toll Brothers, Private) cai em casa, que é o que eles constroem.
const SCOPES = [
  {
    key: "building" as const,
    title: "Buildings",
    icon: Building2,
    blurb: "Naming: community · Building 3. Documents required per client.",
    matches: (type: string) => type.toLowerCase() === "building",
    type: "Building",
  },
  {
    key: "house" as const,
    title: "Houses",
    icon: Home,
    blurb: "Naming: community · Lot 46. Documents required per client.",
    matches: (type: string) => type.toLowerCase() !== "building",
    type: "Lot",
  },
]

function ScopeSection({ scope }: { scope: (typeof SCOPES)[number] }) {
  const { data: catalog, isLoading } = useAtlasDocumentCategories()
  const create = useCreateDocumentCategory()
  const remove = useDeleteDocumentCategory()
  const [form, setForm] = useState({ client: "", document: "" })

  const rows = useMemo(
    () => (catalog ?? []).filter(c => scope.matches(c.type)),
    [catalog, scope],
  )

  const byClient = useMemo(() => {
    const map = new Map<string, typeof rows>()
    for (const row of rows) map.set(row.client, [...(map.get(row.client) ?? []), row])
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  const clients = useMemo(
    () => [...new Set((catalog ?? []).map(c => c.client))].filter(Boolean).sort(),
    [catalog],
  )

  const Icon = scope.icon

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold">{scope.title}</h2>
          <p className="text-xs text-muted-foreground">{scope.blurb}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {byClient.map(([client, docs]) => (
            <div key={client} className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-4">
              <p className="text-sm font-medium">{client || "No client"}</p>
              <div className="flex flex-wrap gap-1.5">
                {docs.map(d => (
                  <Badge
                    key={d.id}
                    variant="outline"
                    className="gap-1.5 py-1"
                  >
                    {d.document}
                    <button
                      onClick={() => remove.mutate(d.id)}
                      disabled={remove.isPending}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border/60 p-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-56">
          <Label htmlFor={`client-${scope.key}`}>Client</Label>
          <NativeSelect
            id={`client-${scope.key}`}
            value={form.client}
            onChange={e => setForm({ ...form, client: e.target.value })}
          >
            <option value="">Select…</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`document-${scope.key}`}>Document</Label>
          <Input
            id={`document-${scope.key}`}
            value={form.document}
            placeholder="Trusses Plans, Plot Plan…"
            onChange={e => setForm({ ...form, document: e.target.value })}
          />
        </div>
        <Button
          disabled={!form.client || !form.document.trim() || create.isPending}
          onClick={() => create.mutate(
            { client: form.client, type: scope.type, document: form.document.trim() },
            { onSuccess: () => setForm({ ...form, document: "" }) },
          )}
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </section>
  )
}

export default function DefinitionsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold">Definitions</h1>
        <p className="text-sm text-muted-foreground">
          What a jobsite is expected to carry, by client and by build type. This is the same
          list the Forecast checks for Fieldwire — one list, not two.
        </p>
      </div>

      {SCOPES.map(scope => <ScopeSection key={scope.key} scope={scope} />)}
    </div>
  )
}
