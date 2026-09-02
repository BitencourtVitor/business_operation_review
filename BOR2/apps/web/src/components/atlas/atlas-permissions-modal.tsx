"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useUpdateUserPermissions } from "@/hooks/use-settings"
import type { PermissionLevel, UserWithPermissions } from "@/services/settings.service"
import {
  Bot, CalendarDays, Check, ClipboardList, Eye, FileSpreadsheet, FolderOpen, Images,
  ListChecks, Lock, Loader2, Map, Pencil, Ruler, ScrollText, ShieldCheck, SlidersHorizontal,
  Users,
} from "lucide-react"
import { useEffect, useState } from "react"

// O mesmo modal de permissões do BOR, com as chaves do Atlas. Cartão clicado
// cicla read → write → nenhum; o cabeçalho do grupo liga o grupo inteiro.
//
// `atlas` é a chave do produto: sem ela a pessoa não entra, e é ela que o
// RequireAtlas cobra na API. As demais são por funcionalidade.
type PermDef = {
  key: string
  label: string
  icon: React.ElementType
  /** Motivo de estar travada — funcionalidade que ainda não existe. */
  locked?: string
}
type PermGroup = { label: string; permissions: PermDef[] }

const PERMISSION_GROUPS: PermGroup[] = [
  {
    label: "Access",
    permissions: [
      { key: "atlas", label: "Open the Atlas", icon: Map },
    ],
  },
  {
    label: "Jobsite",
    permissions: [
      { key: "atlas_plans",    label: "Plans",    icon: FolderOpen },
      { key: "atlas_photos",   label: "Photos",   icon: Images },
      { key: "atlas_tasks",    label: "Tasks",    icon: ListChecks },
      { key: "atlas_diary",    label: "Diary",    icon: CalendarDays },
    ],
  },
  {
    label: "Administration",
    permissions: [
      { key: "atlas_users",       label: "Manage Users",       icon: Users },
      { key: "atlas_definitions", label: "Jobsite Definitions", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Soon",
    permissions: [
      { key: "atlas_specifications", label: "Specifications", icon: ScrollText,      locked: "Not built yet" },
      { key: "atlas_forms",          label: "Forms",          icon: FileSpreadsheet, locked: "Not built yet" },
      { key: "atlas_reports",        label: "Reports",        icon: ClipboardList,   locked: "Not built yet" },
      { key: "atlas_ai",             label: "AI insights",    icon: Bot,             locked: "Not built yet" },
      { key: "atlas_takeoff",        label: "Takeoff",        icon: Ruler,           locked: "Not built yet" },
    ],
  },
]

export const ATLAS_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.permissions)
// Só o que já existe conta no denominador: mostrar "2/13" quando 5 das telas
// nem foram construídas seria contar promessa como funcionalidade.
export const ATLAS_TOTAL = ATLAS_PERMISSIONS.filter(p => !p.locked).length

function cycleLevel(current: PermissionLevel | undefined): PermissionLevel | undefined {
  if (!current) return "read"
  if (current === "read") return "write"
  return undefined
}

export function AtlasPermissionsModal({ open, onClose, user: target }: {
  open: boolean
  onClose: () => void
  user: UserWithPermissions | null
}) {
  const updatePerms = useUpdateUserPermissions()
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel>>({})

  useEffect(() => {
    setPermissions(target?.permissions ?? {})
  }, [target])

  function cycle(key: string) {
    setPermissions(prev => {
      const next = { ...prev }
      const nextLevel = cycleLevel(prev[key])
      if (nextLevel) next[key] = nextLevel
      else delete next[key]
      return next
    })
  }

  function setGroupLevel(group: PermGroup, level: PermissionLevel | undefined) {
    setPermissions(prev => {
      const next = { ...prev }
      group.permissions.filter(p => !p.locked).forEach(p => {
        if (level) next[p.key] = level
        else delete next[p.key]
      })
      return next
    })
  }

  async function save() {
    if (!target) return
    // O objeto vai inteiro, com as chaves do BOR junto: esta tela edita as do
    // Atlas e não pode apagar o que a pessoa tem do outro lado.
    await updatePerms.mutateAsync({ userId: target.id, permissions })
    onClose()
  }

  const granted = ATLAS_PERMISSIONS.filter(p => !p.locked && permissions[p.key]).length
  const writes = ATLAS_PERMISSIONS.filter(p => !p.locked && permissions[p.key] === "write").length

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="w-[min(90vw,48rem)] sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Atlas Permissions
            {target && (
              <span className="ml-1 text-sm font-normal text-muted-foreground">— {target.name}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4 rounded-lg border bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-primary" />
              Read — view the page
            </span>
            <span className="flex items-center gap-1.5">
              <Pencil className="h-3.5 w-3.5 text-emerald-500" />
              Write — edit page data
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span><span className="font-semibold text-foreground">{granted}</span>/{ATLAS_TOTAL} screens</span>
            <span className="text-border">·</span>
            <span><span className="font-semibold text-emerald-500">{writes}</span> with write</span>
          </div>
        </div>

        <ScrollArea className="max-h-[440px]">
          <div className="space-y-5 pr-2">
            {PERMISSION_GROUPS.map(group => {
              const open = group.permissions.filter(p => !p.locked)
              const levels = open.map(p => permissions[p.key])
              const allWrite = open.length > 0 && levels.every(l => l === "write")
              const allRead = open.length > 0 && levels.every(l => !!l)
              return (
                <div key={group.label}>
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                    {open.length > 0 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                            allRead && !allWrite ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-primary"
                          }`}
                          onClick={() => setGroupLevel(group, allRead && !allWrite ? undefined : "read")}
                        >
                          <Eye className="h-3 w-3" />Read
                        </button>
                        <button
                          type="button"
                          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                            allWrite ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground hover:text-emerald-500"
                          }`}
                          onClick={() => setGroupLevel(group, allWrite ? undefined : "write")}
                        >
                          <Pencil className="h-3 w-3" />Write
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {group.permissions.map(perm => {
                      const Icon = perm.icon
                      const level = permissions[perm.key]
                      const isWrite = level === "write"
                      const isRead = !!level
                      return (
                        <button
                          key={perm.key}
                          type="button"
                          disabled={!!perm.locked}
                          title={perm.locked}
                          onClick={() => cycle(perm.key)}
                          className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            isWrite
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : isRead
                                ? "border-primary/40 bg-primary/10"
                                : "border-border/60 hover:bg-muted/50"
                          }`}
                        >
                          <Icon className={`h-3.5 w-3.5 shrink-0 ${
                            isWrite ? "text-emerald-600 dark:text-emerald-400" : isRead ? "text-primary" : "text-muted-foreground"
                          }`} />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">{perm.label}</span>
                          {perm.locked
                            ? <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                            : isWrite
                              ? <Pencil className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                              : isRead
                                ? <Eye className="h-3 w-3 shrink-0 text-primary" />
                                : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-xs text-muted-foreground">
            Atlas keys only. Everything this person has in the BOR stays as it is.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={updatePerms.isPending}>
              {updatePerms.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <><Check className="h-3.5 w-3.5" />Save</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
