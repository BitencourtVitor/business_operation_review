"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/hooks/use-auth"
import {
  useUsers, useCreateUser, useUpdateUser, useDeleteUser, useResetPassword,
  useUpdateUserPermissions,
} from "@/hooks/use-settings"
import { AtlasPermissionsModal, ATLAS_TOTAL, ATLAS_PERMISSIONS } from "@/components/atlas/atlas-permissions-modal"
import {
  ImportUserDialog, SUBCONTRACTOR_KEY, isSubcontractor,
} from "@/components/atlas/atlas-user-dialogs"
import { useAtlasUserCompanies, useSetAtlasUserCompany } from "@/hooks/use-atlas"
import { useSubDocContractors } from "@/hooks/use-subcontractor-docs"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ArrowLeft, Building2, Check, ChevronDown, ChevronUp, CodeXml, Eye, Gauge, HardHat, KeyRound, Loader2,
  Pencil, Plus, Search, Settings, ShieldAlert, ShieldCheck, Trash2, User, UserPlus, Users,
} from "lucide-react"
import type { UserWithPermissions } from "@/services/settings.service"

// A tela é a de Manage Users do BOR, com uma coluna trocada: onde lá vai a
// contagem de telas liberadas, aqui vai o acesso ao Atlas. Mesmos modais,
// mesmos atalhos, mesma hierarquia — quem administra um produto não deveria
// reaprender o outro.

const inputCls =
  "h-8 w-full rounded-lg border border-input bg-transparent px-3 py-0 text-sm outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

// Subcontratado é o quarto cargo do seletor. No banco ele é um `user`; o que
// o separa é a chave `atlas_subcontractor`, porque o enum de `role` é
// compartilhado com o BOR e mexer nele mudaria a hierarquia do outro produto.
const ROLES = ["owner", "manager", "user", "subcontractor"] as const

const ROLE_RANK: Record<string, number> = { dev: 4, owner: 3, manager: 2, user: 1 }

function canManage(myRole: string, targetRole: string): boolean {
  return (ROLE_RANK[myRole] ?? 0) > (ROLE_RANK[targetRole] ?? 0)
}

const roleMeta: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  dev:     { label: "Developer", icon: CodeXml, className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  // Vermelho da logo: é o cargo de quem não é da Premium, e essa distinção
  // merece a cor mais forte da casa em vez de mais um tom da mesma família.
  subcontractor: { label: "Subcontractor", icon: HardHat, className: "border-brand-red/40 bg-brand-red/10 text-brand-red" },
  owner:   { label: "Owner",     icon: Gauge,   className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  manager: { label: "Manager",   icon: Users,   className: "border-primary/40 bg-primary/10 text-primary" },
  user:    { label: "User",      icon: User,    className: "border-border bg-secondary text-foreground" },
}

// Os cargos que entram no Atlas por serem quem são — os mesmos que o
// RequireAtlas deixa passar sem convite.
const FULL_ACCESS_ROLES = ["dev", "owner", "admin", "manager", "gestor"]

function RoleBadge({ role, subcontractor }: { role: string; subcontractor?: boolean }) {
  const m = subcontractor ? roleMeta.subcontractor : roleMeta[role] ?? roleMeta.user
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${m.className}`}>
      <m.icon className="h-3 w-3" />
      {m.label}
    </span>
  )
}

// ─── User form modal ──────────────────────────────────────────────────────────

function UserFormModal({ open, onClose, existing, companies }: {
  open: boolean
  onClose: () => void
  existing?: UserWithPermissions
  companies: Record<string, string>
}) {
  const isEdit = !!existing
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const updatePerms = useUpdateUserPermissions()
  const setCompany = useSetAtlasUserCompany()

  const [name, setName] = useState(existing?.name ?? "")
  const [email, setEmail] = useState(existing?.email ?? "")
  const [role, setRole] = useState<string>(
    existing ? (isSubcontractor(existing) ? "subcontractor" : existing.role) : "user")
  const [company, setCompanyValue] = useState(existing ? companies[existing.id] ?? "" : "")
  const [provisional, setProvisional] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: contractors = [] } = useSubDocContractors()
  const suggestions = useMemo(() => {
    const q = company.trim().toLowerCase()
    return contractors
      .filter(c => !q || c.name.toLowerCase().includes(q))
      .filter(c => c.name.toLowerCase() !== q)
      .slice(0, 8)
  }, [contractors, company])

  useEffect(() => {
    setName(existing?.name ?? "")
    setEmail(existing?.email ?? "")
    setRole(existing ? (isSubcontractor(existing) ? "subcontractor" : existing.role) : "user")
    setCompanyValue(existing ? companies[existing.id] ?? "" : "")
    setProvisional(null)
    setError(null)
  }, [existing])

  function reset() {
    setName(""); setEmail(""); setRole("user"); setCompanyValue(""); setProvisional(null); setError(null)
  }

  async function handleSubmit() {
    setError(null)
    try {
      await submit()
    } catch (e) {
      // Sem isto a falha some como promise rejeitada e o modal apenas congela:
      // quem cadastrou não descobre que o cadastro não foi até o fim.
      setError(e instanceof Error ? e.message : "Something went wrong.")
    }
  }

  async function submit() {
    if (!name.trim() || !email.trim()) return
    // Subcontratado não existe no enum do banco: ele é um `user` marcado.
    const sub = role === "subcontractor"
    const dbRole = sub ? "user" : role

    if (isEdit) {
      await updateUser.mutateAsync({ id: existing!.id, data: { name, email, role: dbRole } })
      // Virar ou deixar de ser subcontratado é acrescentar ou tirar a marca, com
      // o resto das permissões intacto.
      const perms = { ...(existing!.permissions ?? {}) }
      if (sub) { perms.atlas = perms.atlas ?? "read"; perms[SUBCONTRACTOR_KEY] = "read" }
      else delete perms[SUBCONTRACTOR_KEY]
      await updatePerms.mutateAsync({ userId: existing!.id, permissions: perms })
      if (sub) await setCompany.mutateAsync({ userId: existing!.id, company })
      onClose()
      return
    }

    const res = await createUser.mutateAsync({ name, email, role: dbRole })
    // Quem nasce nesta tela nasce para o Atlas: a chave do produto entra junto,
    // em leitura. As demais se concedem no modal de permissões.
    if (!FULL_ACCESS_ROLES.includes(dbRole)) {
      await updatePerms.mutateAsync({
        userId: res.id,
        permissions: sub
          ? { atlas: "read", [SUBCONTRACTOR_KEY]: "read" }
          : { atlas: "read" },
      })
    }
    if (sub) await setCompany.mutateAsync({ userId: res.id, company })
    setProvisional(res.provisionalPassword)
  }

  function handleClose() { reset(); onClose() }

  const pending = createUser.isPending || updateUser.isPending || updatePerms.isPending
    || setCompany.isPending
  const canSubmit = name.trim().length > 0 && email.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Pencil className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {isEdit ? "Edit User" : "Add User"}
          </DialogTitle>
        </DialogHeader>

        {provisional ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                User created successfully!
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Share this provisional password with the user. They will be prompted to change
                it on first login. This account has Atlas access only.
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                <code className="flex-1 font-mono text-sm tracking-wide">{provisional}</code>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleClose}>
                <Check className="h-3.5 w-3.5" />
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Full Name</label>
              <input className={inputCls} placeholder="Jane Smith" value={name}
                onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input type="email" className={inputCls} placeholder="jane@example.com" value={email}
                onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <Select value={role} onValueChange={v => v && setRole(v)}>
                <SelectTrigger className="w-full">
                  <span className="flex flex-1 items-center gap-1.5 text-sm">
                    {(() => { const m = roleMeta[role]; return m ? <><m.icon className="h-3 w-3 shrink-0" />{m.label}</> : role })()}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {ROLES.map(r => {
                    const m = roleMeta[r]
                    return (
                      <SelectItem key={r} value={r}>
                        <span className="flex items-center gap-1.5">
                          {m && <m.icon className="h-3 w-3 shrink-0" />}
                          {m?.label ?? r}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            {role === "subcontractor" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Company</label>
                {/* Sugestões vêm do cadastro do Subcontractor Docs: quem entra
                    aqui já é empreiteiro conhecido da casa, e digitar o nome de
                    novo à mão só cria uma segunda grafia da mesma empresa. */}
                <div className="relative">
                  <input
                    className={inputCls}
                    placeholder="JF Drywall & Plastering LLC"
                    value={company}
                    autoComplete="off"
                    onChange={e => { setCompanyValue(e.target.value); setShowSuggestions(true) }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <ul className="absolute z-50 mt-1 max-h-44 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md">
                      {suggestions.map(s => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                            onMouseDown={e => { e.preventDefault(); setCompanyValue(s.name); setShowSuggestions(false) }}
                          >
                            <HardHat className="h-3 w-3 shrink-0 text-brand-red" />
                            <span className="min-w-0 flex-1 truncate">{s.name}</span>
                            {s.company && (
                              <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{s.company}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={pending}>Cancel</Button>
              <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || pending}>
                {pending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                  : isEdit
                    ? <><Check className="h-3.5 w-3.5" />Save Changes</>
                    : <><Plus className="h-3.5 w-3.5" />Create User</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteUserModal({ open, onClose, user: target }: {
  open: boolean
  onClose: () => void
  user: UserWithPermissions | null
}) {
  const deleteUser = useDeleteUser()
  const [typed, setTyped] = useState("")

  function handleClose() { setTyped(""); onClose() }

  async function confirm() {
    if (!target || typed !== target.name) return
    await deleteUser.mutateAsync(target.id)
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            Delete User
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          This action is <span className="font-semibold">permanent and irreversible</span>. The
          user will lose all access immediately, in the Atlas and in the BOR.
        </div>

        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">
            Type <span className="font-medium text-foreground">{target?.name}</span> to confirm.
          </p>
          <input
            className={inputCls}
            placeholder={target?.name ?? ""}
            value={typed}
            onChange={e => setTyped(e.target.value)}
            onPaste={e => e.preventDefault()}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={confirm}
            disabled={typed !== target?.name || deleteUser.isPending}
          >
            {deleteUser.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <><Trash2 className="h-3.5 w-3.5" />Delete</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Reset password modal ─────────────────────────────────────────────────────

function ResetPasswordModal({ open, onClose, user: target }: {
  open: boolean
  onClose: () => void
  user: UserWithPermissions | null
}) {
  const resetPw = useResetPassword()
  const [newPass, setNewPass] = useState<string | null>(null)

  async function confirm() {
    if (!target) return
    const res = await resetPw.mutateAsync(target.id)
    setNewPass(res.provisionalPassword)
  }

  function handleClose() { setNewPass(null); onClose() }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Reset Password
          </DialogTitle>
        </DialogHeader>

        {newPass ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Password reset!</p>
              <p className="mt-1 text-xs text-muted-foreground">Share this provisional password with the user.</p>
              <div className="mt-3 flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                <code className="flex-1 font-mono text-sm">{newPass}</code>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleClose}>
                <Check className="h-3.5 w-3.5" />
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Generate a new provisional password for{" "}
              <span className="font-medium text-foreground">{target?.name}</span>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
              <Button size="sm" onClick={confirm} disabled={resetPw.isPending}>
                {resetPw.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><KeyRound className="h-3.5 w-3.5" />Reset Password</>}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type SortKey = "name" | "role"
type SortDir = "asc" | "desc"

export default function AtlasUsersPage() {
  const { user: me } = useAuth()
  const { data: users = [], isLoading } = useUsers()
  const { data: companies = {} } = useAtlasUserCompanies()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserWithPermissions | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<UserWithPermissions | null>(null)
  const [resetTarget, setResetTarget] = useState<UserWithPermissions | null>(null)
  const [permsTarget, setPermsTarget] = useState<UserWithPermissions | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  const filtered = users
    .filter(u => {
      const q = search.toLowerCase()
      const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      const matchRole = roleFilter === "all" || u.role === roleFilter
      // A lista é do Atlas: cargo acima de `user` entra por definição, e o
      // `user` só existe aqui depois de importado ou cadastrado como
      // subcontratado. Conta do BOR sem chave nunca aparece.
      const inAtlas = FULL_ACCESS_ROLES.includes(u.role) || !!u.permissions?.atlas
      return matchSearch && matchRole && inAtlas
    })
    .sort((a, b) => {
      const va = a[sortKey].toLowerCase()
      const vb = b[sortKey].toLowerCase()
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  const allRoles = [...new Set(users.map(u => u.role))].sort()

  if (me && !["dev", "owner", "manager"].includes(me.role)) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <ShieldAlert className="h-10 w-10 text-destructive/60" />
          <p className="font-medium">Access Denied</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* A página ocupa a altura do main e não rola: quem rola é a tabela. É o
          que faz o cabeçalho congelado ter contra o que congelar. */}
      <div className="flex h-full flex-col gap-6">
        <div className="flex shrink-0 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/atlas/settings"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="h-8 w-px bg-border" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Manage Users</h1>
              <p className="text-sm text-muted-foreground">
                Create, edit and manage who works in the Atlas
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" className="shrink-0 gap-1.5" />}>
              <Plus className="h-3.5 w-3.5" />
              Add User
              <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={() => { setEditing(undefined); setFormOpen(true) }}>
                <UserPlus className="h-4 w-4" />
                <span className="flex flex-col">
                  <span>New user</span>
                  <span className="text-xs text-muted-foreground">Create a Premium account</span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <Users className="h-4 w-4" />
                <span className="flex flex-col">
                  <span>Import from the BOR</span>
                  <span className="text-xs text-muted-foreground">Somebody who already has an account</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <Select value={roleFilter} onValueChange={v => v && setRoleFilter(v)}>
            <SelectTrigger className="w-36">
              <span className="flex flex-1 items-center gap-1.5 text-sm text-muted-foreground">
                {roleFilter === "all" ? "All roles" : (() => {
                  const m = roleMeta[roleFilter]
                  return m ? <><m.icon className="h-3 w-3 shrink-0" />{m.label}</> : roleFilter
                })()}
              </span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="all">All roles</SelectItem>
              {allRoles.map(r => {
                const m = roleMeta[r]
                return (
                  <SelectItem key={r} value={r}>
                    <span className="flex items-center gap-1.5">
                      {m && <m.icon className="h-3 w-3 shrink-0" />}
                      {m?.label ?? r}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {filtered.length === 0 && search
                ? "No users match your search"
                : "Nobody in the Atlas yet"}
            </p>
          ) : (
            <Table containerClassName="h-full" className="[&_th]:py-2.5 [&_td]:py-2">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-full border-r border-border">
                    <button onClick={() => toggleSort("name")}
                      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground ${sortKey === "name" ? "text-foreground" : "text-muted-foreground"}`}>
                      User
                      {sortKey === "name"
                        ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        : <ChevronUp className="h-3 w-3 opacity-20" />}
                    </button>
                  </TableHead>
                  <TableHead className="border-r border-border text-center">
                    <button onClick={() => toggleSort("role")}
                      className={`mx-auto flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground ${sortKey === "role" ? "text-foreground" : "text-muted-foreground"}`}>
                      Role
                      {sortKey === "role"
                        ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        : <ChevronUp className="h-3 w-3 opacity-20" />}
                    </button>
                  </TableHead>
                  <TableHead className="border-r border-border text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Permissions
                  </TableHead>
                  <TableHead className="bg-muted/60 text-center text-muted-foreground">
                    <Settings className="mx-auto h-3.5 w-3.5" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(u => {
                  const byRole = FULL_ACCESS_ROLES.includes(u.role)
                  const granted = ATLAS_PERMISSIONS
                    .filter(p => !p.locked && u.permissions?.[p.key]).length
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="border-r border-border">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">{u.name}</span>
                          {/* Ícone e texto, não etiqueta: a empresa é mais um
                              dado da pessoa, do mesmo peso do e-mail. */}
                          {companies[u.id] && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" />
                              {companies[u.id]}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">{u.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="border-r border-border text-center">
                        <RoleBadge role={u.role} subcontractor={isSubcontractor(u)} />
                      </TableCell>
                      <TableCell className="border-r border-border text-center">
                        {byRole ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <ShieldCheck className="h-3 w-3" />
                            Full Access
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-xs tabular-nums text-muted-foreground">{granted}/{ATLAS_TOTAL}</span>
                            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${(granted / ATLAS_TOTAL) * 100}%` }} />
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="bg-muted/20">
                        <TooltipProvider>
                          <div className="flex items-center justify-center gap-1">
                            {canManage(me?.role ?? "", u.role) && (
                              <>
                                {!byRole && (
                                  <Tooltip>
                                    <TooltipTrigger render={
                                      <button
                                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                        onClick={() => setPermsTarget(u)}
                                      />
                                    }>
                                      <ShieldCheck className="h-3.5 w-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Atlas permissions</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger render={
                                    <button
                                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                      onClick={() => { setEditing(u); setFormOpen(true) }}
                                    />
                                  }>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Edit user</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger render={
                                    <button
                                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                      onClick={() => setResetTarget(u)}
                                    />
                                  }>
                                    <KeyRound className="h-3.5 w-3.5" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Reset password</TooltipContent>
                                </Tooltip>
                                {u.id !== me?.id && (
                                  <Tooltip>
                                    <TooltipTrigger render={
                                      <button
                                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => setDeleteTarget(u)}
                                      />
                                    }>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Delete user</TooltipContent>
                                  </Tooltip>
                                )}
                              </>
                            )}
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <UserFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(undefined) }}
        existing={editing}
        companies={companies}
      />
      <DeleteUserModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        user={deleteTarget}
      />
      <ResetPasswordModal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        user={resetTarget}
      />
      <AtlasPermissionsModal
        open={!!permsTarget}
        onClose={() => setPermsTarget(null)}
        user={permsTarget}
      />
      <ImportUserDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  )
}
