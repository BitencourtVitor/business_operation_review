"use client"

import { useRef, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useUsers, useUpdateUserPermissions } from "@/hooks/use-settings"
import type { UserWithPermissions, PermissionLevel } from "@/services/settings.service"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { isSubcontractor } from "@/components/atlas/atlas-user-dialogs"
import { cn } from "@/lib/utils"
import {
  ClipboardList, CodeXml, Compass, FolderOpen, Gauge, GripVertical, HardHat, Images, ListChecks,
  Loader2, Lock, Notebook, Ruler, ShieldCheck, SlidersHorizontal, User, UserCheck, Users,
} from "lucide-react"

// A mesma janela do BOR (Settings → Edit Permissions), com as páginas do Atlas:
// escolhe-se a página à esquerda e arrastam-se pessoas entre "sem acesso" e
// "com acesso". Editar por página, e não por pessoa, é o que responde à
// pergunta que de fato se faz — "quem enxerga isto?" — sem abrir um cadastro
// por vez.

const ROLE_RANK: Record<string, number> = { dev: 4, owner: 3, manager: 2, user: 1 }

// Cargo acima de `user` entra no Atlas por definição, e o acesso não se revoga
// aqui — é o mesmo que o RequireAtlas deixa passar sem convite.
const ALWAYS_ACCESS_ROLES = new Set(["dev", "owner", "manager"])

function canManage(myRole: string, targetRole: string) {
  return (ROLE_RANK[myRole] ?? 0) > (ROLE_RANK[targetRole] ?? 0)
}

type PermDef = { key: string; label: string; icon: React.ElementType; writeLabel?: string; upcoming?: boolean; restricted?: string }
type PermGroup = { label: string; permissions: PermDef[] }

// Só entra aqui o que é escolha de verdade.
//
// Ficam de fora **abrir o Atlas** e **Documents**: quem foi cadastrado no
// produto evidentemente pode abri-lo, e o documento é o dado principal da obra
// — é por ele que se entra. Transformar os dois em interruptor seria oferecer
// uma decisão que não existe, e criar a chance de deixar alguém dentro do
// sistema sem nada para ver.
const PERMISSION_GROUPS: PermGroup[] = [
  {
    // Reports e Takeoff ficam aqui junto com as demais, e não num grupo à
    // parte: a etiqueta dentro do próprio botão já diz que ainda não existem, e
    // repetir isso num cabeçalho é dizer duas vezes a mesma coisa. Conceder
    // desde já é de propósito — a permissão não pode ser o gargalo. No dia em
    // que a página subir, ela já nasce liberada para quem foi escolhido aqui.
    label: "Jobsite",
    permissions: [
      { key: "atlas_documents", label: "Documents", icon: FolderOpen },
      { key: "atlas_photos",  label: "Photos",  icon: Images },
      { key: "atlas_tasks",   label: "Tasks",   icon: ListChecks },
      { key: "atlas_diary",   label: "Diary",   icon: Notebook },
      { key: "atlas_reports", label: "Reports", icon: ClipboardList, upcoming: true },
      { key: "atlas_takeoff", label: "Takeoff", icon: Ruler,         upcoming: true },
      // Dizer quem entra numa obra não é tarefa de qualquer um: a permissão
      // decide quem pode conceder e revogar acesso, obra a obra.
      { key: "atlas_access", label: "Manage Access", icon: ShieldCheck, writeLabel: "Grant and revoke" },
    ],
  },
  {
    label: "Settings",
    permissions: [
      { key: "atlas_users",       label: "Manage Users",        icon: Users, writeLabel: "Manage users" },
      {
        key: "atlas_permissions", label: "Edit Permissions", icon: Lock,
        restricted: "Edit Permissions is always restricted to Dev, Owner and Manager accounts. It cannot be granted to standard users here.",
      },
      { key: "atlas_definitions", label: "Manage Categories and Subcategories", icon: SlidersHorizontal },
    ],
  },
]

export const ATLAS_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.permissions)
// Tudo que se concede conta, inclusive o que ainda vai existir: a permissão
// dada hoje é real, e some do denominador seria esconder trabalho já feito.
export const ATLAS_TOTAL = ATLAS_PERMISSIONS.filter(p => !p.restricted).length

const roleMeta: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  dev:           { label: "Developer",     icon: CodeXml, className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  owner:         { label: "Owner",         icon: Compass, className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  manager:       { label: "Manager",       icon: Users,   className: "border-primary/40 bg-primary/10 text-primary" },
  subcontractor: { label: "Subcontractor", icon: HardHat, className: "border-brand-red/40 bg-brand-red/10 text-brand-red" },
  user:          { label: "User",          icon: User,    className: "border-border bg-secondary text-foreground" },
}

function metaFor(user: UserWithPermissions) {
  if (isSubcontractor(user)) return roleMeta.subcontractor
  return roleMeta[user.role] ?? roleMeta.user
}

function UserCard({
  user, level, isDraggable, isFixed, onDragStart, onLevelChange, writeLabel = "Edit data",
}: {
  user: UserWithPermissions
  level: PermissionLevel | null
  isDraggable: boolean
  isFixed: boolean
  onDragStart: () => void
  onLevelChange: ((l: PermissionLevel) => void) | null
  writeLabel?: string
}) {
  const meta = metaFor(user)
  const Icon = meta.icon

  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? onDragStart : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border border-border bg-card px-2 py-2 select-none transition-shadow",
        isDraggable && "cursor-grab active:cursor-grabbing active:opacity-50 active:shadow-md",
        !isDraggable && !isFixed && "opacity-40",
        isFixed && "opacity-70",
      )}
    >
      {!isFixed && <GripVertical className={cn("h-3.5 w-3.5 shrink-0", isDraggable ? "text-muted-foreground/40" : "invisible")} />}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{user.name}</span>
      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", meta.className)}>
        <Icon className="h-2.5 w-2.5" />
        {meta.label}
      </span>
      {level !== null && onLevelChange && (
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={level === "write"}
            onChange={e => onLevelChange(e.target.checked ? "write" : "read")}
            className="h-3.5 w-3.5 cursor-pointer accent-primary"
          />
          <span className="text-[10px] font-medium text-muted-foreground">{writeLabel}</span>
        </label>
      )}
    </div>
  )
}

export function AtlasPermissionsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user: me } = useAuth()
  const { data: allUsers = [], isLoading } = useUsers()
  const updatePerms = useUpdateUserPermissions()

  // Só quem é do Atlas. A lista inteira da Premium aqui daria a entender que
  // arrastar alguém para "com acesso" o coloca no produto — e coloca no BOR.
  const users = allUsers.filter(u => ALWAYS_ACCESS_ROLES.has(u.role) || !!u.permissions?.atlas)

  // A seleção da esquerda pode ser uma página do produto ou uma obra. As duas
  // respondem à mesma pergunta — "quem entra aqui?" —, e por isso dividem a
  // mesma janela em vez de virarem duas telas parecidas.
  const [selectedKey, setSelectedKey] = useState<string>(ATLAS_PERMISSIONS[0].key)

  const [overrides, setOverrides] = useState<Record<string, Record<string, PermissionLevel | null>>>({})

  const dragUserId = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState<"access" | "no-access" | null>(null)

  function getEffective(user: UserWithPermissions): Record<string, PermissionLevel> {
    const local = overrides[user.id] ?? {}
    const merged = { ...user.permissions }
    for (const [k, v] of Object.entries(local)) {
      if (v === null) delete merged[k]
      else merged[k] = v
    }
    return merged
  }

  function applyChange(userId: string, key: string, level: PermissionLevel | null) {
    const user = users.find(u => u.id === userId)
    if (!user || ALWAYS_ACCESS_ROLES.has(user.role)) return
    if (!canManage(me?.role ?? "", user.role)) return
    setOverrides(prev => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [key]: level },
    }))
    const next = { ...getEffective(user) }
    if (level === null) delete next[key]
    else next[key] = level
    // O objeto vai inteiro, com as chaves do BOR junto: esta tela mexe nas do
    // Atlas e não pode apagar o que a pessoa tem do outro lado.
    updatePerms.mutate({ userId, permissions: next as Record<string, PermissionLevel> })
  }

  function handleDrop(target: "access" | "no-access") {
    const uid = dragUserId.current
    dragUserId.current = null
    setDragOver(null)
    if (!uid) return
    const user = users.find(u => u.id === uid)
    if (!user || ALWAYS_ACCESS_ROLES.has(user.role)) return

    const current = getEffective(user)[selectedKey]
    if (target === "access" && !current) applyChange(uid, selectedKey, "read")
    if (target === "no-access" && current) applyChange(uid, selectedKey, null)
  }

  const byName = (a: UserWithPermissions, b: UserWithPermissions) => a.name.localeCompare(b.name)
  const byRoleZA = (a: UserWithPermissions, b: UserWithPermissions) =>
    (roleMeta[b.role]?.label ?? b.role).localeCompare(roleMeta[a.role]?.label ?? a.role)

  const hasIt = (u: UserWithPermissions) => !!getEffective(u)[selectedKey]

  const fixedAccess = users.filter(u => ALWAYS_ACCESS_ROLES.has(u.role)).sort(byRoleZA)
  const withAccess = users.filter(u => !ALWAYS_ACCESS_ROLES.has(u.role) && hasIt(u)).sort(byName)
  const withoutAccess = users.filter(u => !ALWAYS_ACCESS_ROLES.has(u.role) && !hasIt(u)).sort(byName)

  const selectedPerm = ATLAS_PERMISSIONS.find(p => p.key === selectedKey)
  const writeLabel = selectedPerm?.writeLabel ?? "Edit data"
  const restricted = selectedPerm?.restricted

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-5 py-4">
          <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <DialogTitle className="flex-1 text-base">Edit Permissions</DialogTitle>
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </DialogHeader>

        {!restricted && (
          <div className="flex shrink-0 border-b border-border">
            <div className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/20 px-3 py-2.5">
              <span className="text-xs font-semibold">Page</span>
              <span className="text-[11px] text-muted-foreground">Select a page to manage access</span>
            </div>
            <div className="flex w-64 shrink-0 flex-col border-r border-border px-3 py-2.5">
              <span className="text-xs font-semibold">No Access</span>
              <span className="text-[11px] text-muted-foreground">Drag to grant access to this page</span>
            </div>
            <div className="flex flex-1 flex-col px-3 py-2.5">
              <span className="text-xs font-semibold">Has Access</span>
              <span className="text-[11px] text-muted-foreground">Drag to revoke · toggle read / write</span>
            </div>
          </div>
          )}

        <div className="flex flex-1 overflow-hidden">
          <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-muted/20 p-2">
            {PERMISSION_GROUPS.map(group => (
              <div key={group.label} className="mb-3">
                <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40">
                  {group.label}
                </p>
                {group.permissions.map(perm => (
                  <button
                    key={perm.key}
                    onClick={() => setSelectedKey(perm.key)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      selectedKey === perm.key
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                    )}
                  >
                    <perm.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{perm.label}</span>
                    {/* Marca que a página ainda não existe, sem impedir a
                        concessão: quando ela subir, o acesso já está dado. */}
                    {perm.restricted && <Lock className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/40" />}
                    {perm.upcoming && (
                      <span className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">
                        Soon
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}

          </aside>

          {restricted ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <Lock className="h-6 w-6 text-muted-foreground/40" />
              <p className="max-w-sm text-sm text-muted-foreground">{restricted}</p>
            </div>
          ) : (
          <div className="flex flex-1 overflow-hidden">
              <div
                className={cn(
                  "flex w-64 shrink-0 flex-col overflow-hidden border-r border-border p-3 transition-colors",
                  dragOver === "no-access" && "bg-muted/60",
                )}
                onDragOver={e => { e.preventDefault(); setDragOver("no-access") }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop("no-access")}
              >
                <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
                  {withoutAccess.map(u => (
                    <UserCard
                      key={u.id}
                      user={u}
                      level={null}
                      isFixed={false}
                      isDraggable={canManage(me?.role ?? "", u.role)}
                      onDragStart={() => { dragUserId.current = u.id }}
                      onLevelChange={null}
                    />
                  ))}
                  {withoutAccess.length === 0 && (
                    <div className="flex flex-1 flex-col items-center justify-center gap-1.5">
                      <UserCheck className="h-4 w-4 text-muted-foreground/30" />
                      <p className="text-center text-xs text-muted-foreground/40">Everybody in the Atlas has access</p>
                    </div>
                  )}
                </div>
              </div>

              <div
                className={cn(
                  "flex flex-1 flex-col overflow-hidden transition-colors",
                  dragOver === "access" && "bg-primary/5",
                )}
                onDragOver={e => { e.preventDefault(); setDragOver("access") }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop("access")}
              >
                <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3">
                  {withAccess.map(u => (
                    <UserCard
                      key={u.id}
                      user={u}
                      level={getEffective(u)[selectedKey] ?? null}
                      isFixed={false}
                      isDraggable={canManage(me?.role ?? "", u.role)}
                      onDragStart={() => { dragUserId.current = u.id }}
                      onLevelChange={
                        canManage(me?.role ?? "", u.role)
                          ? l => applyChange(u.id, selectedKey, l)
                          : null
                      }
                      writeLabel={writeLabel}
                    />
                  ))}
                  {withAccess.length === 0 && (
                    <div className={cn(
                      "flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors",
                      dragOver === "access" ? "border-primary/40 bg-primary/5" : "border-border/30",
                    )}>
                      <Users className={cn("h-5 w-5 transition-colors", dragOver === "access" ? "text-primary/40" : "text-muted-foreground/25")} />
                      <p className={cn("text-xs transition-colors", dragOver === "access" ? "text-primary/60" : "text-muted-foreground/40")}>
                        Drag users here
                      </p>
                    </div>
                  )}
                </div>

                {fixedAccess.length > 0 && (
                  <div className="flex shrink-0 flex-col gap-1.5 border-t border-border/50 bg-muted/20 px-3 pb-3 pt-2.5">
                    <p className="px-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40">
                      Always have access
                    </p>
                    {fixedAccess.map(u => (
                      <UserCard
                        key={u.id}
                        user={u}
                        level="write"
                        isFixed={true}
                        isDraggable={false}
                        onDragStart={() => {}}
                        onLevelChange={null}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
