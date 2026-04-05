"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/hooks/use-auth"
import {
  useUsers,
  useCreateUser, useUpdateUser, useDeleteUser,
  useResetPassword, useUpdateUserPermissions,
} from "@/hooks/use-settings"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Activity, ArrowLeft, Award, BarChart2, Banknote,
  CalendarCheck, Check, ChevronDown, ChevronUp, ClipboardCheck, ClipboardList,
  Compass, Database, FileCheck, Fuel, Gauge,
  Gem, KeyRound, LayoutDashboard, Loader2,
  Package, Pencil, Plus, Ruler, Search,
  Settings, ShieldAlert, ShieldCheck, Trash2,
  Upload, User, UserCog, UserPlus, Users, Watch, Wrench,
} from "lucide-react"
import type { UserWithPermissions } from "@/services/settings.service"

// ─── Shared input class ───────────────────────────────────────────────────────

const inputCls =
  "h-8 w-full rounded-lg border border-input bg-transparent px-3 py-0 text-sm outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

// ─── Role metadata ────────────────────────────────────────────────────────────

const ROLES = ["admin", "manager", "user", "viewer"] as const

const roleMeta: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  dev:     { label: "Developer", icon: Gem,     className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  admin:   { label: "Admin",     icon: Award,   className: "border-primary/40 bg-primary/10 text-primary" },
  owner:   { label: "Owner",     icon: Compass, className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  manager: { label: "Manager",   icon: Gauge,   className: "border-primary/40 bg-primary/10 text-primary" },
  user:    { label: "User",      icon: User,    className: "border-border bg-secondary text-foreground" },
  viewer:  { label: "Viewer",    icon: User,    className: "border-border bg-secondary text-foreground" },
}

function RoleBadge({ role }: { role: string }) {
  const m = roleMeta[role] ?? roleMeta.viewer
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${m.className}`}>
      <m.icon className="h-3 w-3" />
      {m.label}
    </span>
  )
}

// ─── Permission groups ────────────────────────────────────────────────────────

type PermDef = { key: string; label: string; icon: React.ElementType }
type PermGroup = { label: string; permissions: PermDef[] }

const PERMISSION_GROUPS: PermGroup[] = [
  {
    label: "System",
    permissions: [
      { key: "dashboard", label: "Dashboard",  icon: LayoutDashboard },
      { key: "autolog",   label: "AutoLog",    icon: Activity        },
      { key: "settings",  label: "Settings",   icon: Settings        },
    ],
  },
  {
    label: "Operations",
    permissions: [
      { key: "monthly_execution",  label: "Monthly Execution",        icon: CalendarCheck  },
      { key: "workforce",          label: "Workforce Productivity",    icon: Users          },
      { key: "subcontractors",     label: "Subcontractor Performance", icon: ClipboardCheck },
      { key: "inventory",          label: "Inventory Control",         icon: Package        },
      { key: "permits",            label: "Permit Control",            icon: FileCheck      },
      { key: "service_requests",   label: "Service Requests",          icon: Wrench         },
      { key: "project_monitoring", label: "HVAC Project Monitoring",   icon: Gauge          },
    ],
  },
  {
    label: "Finance & Analytics",
    permissions: [
      { key: "forecast",   label: "Framing Forecast",  icon: BarChart2  },
      { key: "ofi",        label: "Operational Index", icon: BarChart2  },
      { key: "accounting", label: "Accounting",        icon: Banknote   },
      { key: "fuel",       label: "Fuel Control",      icon: Fuel       },
      { key: "timesheet",  label: "Timesheet",         icon: Watch      },
      { key: "takeoff",    label: "Takeoff Works",     icon: Ruler      },
    ],
  },
  {
    label: "Data Management",
    permissions: [
      { key: "data_control",     label: "Data Control",     icon: ClipboardList },
      { key: "bor1_explorer",    label: "BOR1 Explorer",    icon: Database      },
      { key: "upload_timesheet", label: "Upload Timesheet", icon: Upload        },
    ],
  },
]

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.permissions)
const TOTAL_PERMISSIONS = ALL_PERMISSIONS.length

// ─── User form modal ──────────────────────────────────────────────────────────

function UserFormModal({
  open, onClose, existing,
}: {
  open:      boolean
  onClose:   () => void
  existing?: UserWithPermissions
}) {
  const isEdit     = !!existing
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()

  const [name,        setName]        = useState(existing?.name  ?? "")
  const [email,       setEmail]       = useState(existing?.email ?? "")
  const [role,        setRole]        = useState<string>(existing?.role ?? "viewer")
  const [provisional, setProvisional] = useState<string | null>(null)

  useEffect(() => {
    setName(existing?.name  ?? "")
    setEmail(existing?.email ?? "")
    setRole(existing?.role  ?? "viewer")
    setProvisional(null)
  }, [existing])

  function reset() {
    setName(""); setEmail(""); setRole("viewer"); setProvisional(null)
  }

  async function handleSubmit() {
    if (!name.trim() || !email.trim()) return
    if (isEdit) {
      await updateUser.mutateAsync({ id: existing!.id, data: { name, email, role } })
      onClose()
    } else {
      const res = await createUser.mutateAsync({ name, email, role })
      setProvisional(res.provisionalPassword)
    }
  }

  function handleClose() { reset(); onClose() }

  const pending   = createUser.isPending || updateUser.isPending
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
                Share this provisional password with the user. They will be prompted to change it on first login.
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
              <input
                className={inputCls}
                placeholder="Jane Smith"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                className={inputCls}
                placeholder="jane@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Role</label>
              <Select value={role} onValueChange={v => v && setRole(v)}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm">
                    {roleMeta[role]?.label ?? role}
                  </span>
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {ROLES.map(r => (
                    <SelectItem key={r} value={r}>
                      {roleMeta[r]?.label ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={pending}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || pending}>
                {pending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
                  : isEdit
                    ? <><Check className="h-3.5 w-3.5" />Save Changes</>
                    : <><Plus className="h-3.5 w-3.5" />Create User</>
                }
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteUserModal({
  open, onClose, user: target,
}: {
  open:    boolean
  onClose: () => void
  user:    UserWithPermissions | null
}) {
  const deleteUser = useDeleteUser()

  async function confirm() {
    if (!target) return
    await deleteUser.mutateAsync(target.id)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            Delete User
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete{" "}
          <span className="font-medium text-foreground">{target?.name}</span>?
          This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={confirm} disabled={deleteUser.isPending}>
            {deleteUser.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <><Trash2 className="h-3.5 w-3.5" />Delete</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Reset password modal ─────────────────────────────────────────────────────

function ResetPasswordModal({
  open, onClose, user: target,
}: {
  open:    boolean
  onClose: () => void
  user:    UserWithPermissions | null
}) {
  const resetPw  = useResetPassword()
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
                  : <><KeyRound className="h-3.5 w-3.5" />Reset Password</>
                }
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Permissions modal ────────────────────────────────────────────────────────

function PermissionsModal({
  open, onClose, user: target,
}: {
  open:    boolean
  onClose: () => void
  user:    UserWithPermissions | null
}) {
  const updatePerms = useUpdateUserPermissions()
  const [permissions, setPermissions] = useState<Record<string, boolean>>(target?.permissions ?? {})

  useEffect(() => {
    setPermissions(target?.permissions ?? {})
  }, [target])

  function toggle(key: string) {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleGroup(group: PermGroup, value: boolean) {
    setPermissions(prev => {
      const next = { ...prev }
      group.permissions.forEach(p => { next[p.key] = value })
      return next
    })
  }

  async function save() {
    if (!target) return
    await updatePerms.mutateAsync({ userId: target.id, permissions })
    onClose()
  }

  const grantedCount = Object.values(permissions).filter(Boolean).length

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Screen Permissions
            {target && (
              <span className="ml-1 text-sm font-normal text-muted-foreground">— {target.name}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Counter */}
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{grantedCount}</span> of{" "}
            <span className="font-semibold text-foreground">{TOTAL_PERMISSIONS}</span> screens granted
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(grantedCount / TOTAL_PERMISSIONS) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <ScrollArea className="max-h-[420px]">
          <div className="space-y-5 pr-1">
            {PERMISSION_GROUPS.map(group => {
              const allChecked = group.permissions.every(p => permissions[p.key])
              return (
                <div key={group.label}>
                  {/* Group header */}
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground transition-colors hover:text-primary"
                      onClick={() => toggleGroup(group, !allChecked)}
                    >
                      {allChecked ? "Deselect all" : "Select all"}
                    </button>
                  </div>

                  {/* Permission cards */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {group.permissions.map(perm => {
                      const Icon  = perm.icon
                      const on    = permissions[perm.key] ?? false
                      return (
                        <div
                          key={perm.key}
                          onClick={() => toggle(perm.key)}
                          className={`flex cursor-pointer select-none items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-all ${
                            on
                              ? "border-primary/30 bg-primary/5"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            on
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground"
                          }`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <span className={`flex-1 text-xs font-medium leading-tight ${
                            on ? "text-foreground" : "text-muted-foreground"
                          }`}>
                            {perm.label}
                          </span>
                          {/* custom checkbox indicator */}
                          <div className={`h-4 w-4 shrink-0 rounded border-2 transition-colors ${
                            on ? "border-primary bg-primary" : "border-input"
                          }`}>
                            {on && <Check className="h-full w-full p-[1px] text-primary-foreground" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={updatePerms.isPending}>
            {updatePerms.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</>
              : <><Check className="h-3.5 w-3.5" />Save Permissions</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type SortKey = "name" | "email" | "role"
type SortDir = "asc" | "desc"

export default function UsersPage() {
  const { user: me }                          = useAuth()
  const { data: users   = [], isLoading: ul } = useUsers()

  const [formOpen,     setFormOpen]     = useState(false)
  const [editing,      setEditing]      = useState<UserWithPermissions | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<UserWithPermissions | null>(null)
  const [resetTarget,  setResetTarget]  = useState<UserWithPermissions | null>(null)
  const [permsTarget,  setPermsTarget]  = useState<UserWithPermissions | null>(null)

  const [search,     setSearch]     = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [sortKey,    setSortKey]    = useState<SortKey>("name")
  const [sortDir,    setSortDir]    = useState<SortDir>("asc")

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  const filtered = users
    .filter(u => {
      const q = search.toLowerCase()
      const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      const matchRole   = roleFilter === "all" || u.role === roleFilter
      return matchSearch && matchRole
    })
    .sort((a, b) => {
      const va = a[sortKey].toLowerCase()
      const vb = b[sortKey].toLowerCase()
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  const allRoles = [...new Set(users.map(u => u.role))].sort()

  if (me && !["admin", "dev", "owner"].includes(me.role)) {
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
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="h-8 w-px bg-border" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Manage Users</h1>
              <p className="text-sm text-muted-foreground">
                Create, edit and manage user accounts and permissions
              </p>
            </div>
          </div>
          <Button size="sm" className="shrink-0 gap-1.5" onClick={() => { setEditing(undefined); setFormOpen(true) }}>
            <Plus className="h-3.5 w-3.5" />
            Add User
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-8 w-full rounded-lg border border-input bg-transparent pl-8 pr-3 text-sm outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Role filter */}
          <Select value={roleFilter} onValueChange={v => v && setRoleFilter(v)}>
            <SelectTrigger className="w-36">
              <span className="flex-1 text-left text-sm text-muted-foreground">
                {roleFilter === "all" ? "All roles" : (roleMeta[roleFilter]?.label ?? roleFilter)}
              </span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="all">All roles</SelectItem>
              {allRoles.map(r => (
                <SelectItem key={r} value={r}>{roleMeta[r]?.label ?? r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b bg-muted/40 px-4 py-2.5">
            {([["name","User"],["role","Role"]] as [SortKey,string][]).map(([col, label]) => (
              <button key={col} onClick={() => toggleSort(col)}
                className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground ${sortKey === col ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
                {sortKey === col
                  ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  : <ChevronUp className="h-3 w-3 opacity-20" />}
              </button>
            ))}
            <span className="w-28 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Permissions</span>
            <span className="w-24 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actions</span>
          </div>

          {ul ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {users.length === 0 ? "No users yet" : "No users match your search"}
            </p>
          ) : (
            <div>
              {filtered.map((u, i) => {
                const granted = Object.values(u.permissions).filter(Boolean).length
                return (
                  <div
                    key={u.id}
                    className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30 ${i < filtered.length - 1 ? "border-b border-border/50" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>

                    <RoleBadge role={u.role} />

                    <div className="flex w-28 items-center justify-end gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {granted}/{TOTAL_PERMISSIONS}
                      </span>
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${(granted / TOTAL_PERMISSIONS) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex w-24 items-center justify-end gap-1">
                      <button
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Edit permissions"
                        onClick={() => setPermsTarget(u)}
                      >
                        <UserCog className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Edit user"
                        onClick={() => { setEditing(u); setFormOpen(true) }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Reset password"
                        onClick={() => setResetTarget(u)}
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      {u.id !== me?.id && (
                        <button
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Delete user"
                          onClick={() => setDeleteTarget(u)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <UserFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(undefined) }}
        existing={editing}
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
      <PermissionsModal
        open={!!permsTarget}
        onClose={() => setPermsTarget(null)}
        user={permsTarget}
      />
    </>
  )
}
