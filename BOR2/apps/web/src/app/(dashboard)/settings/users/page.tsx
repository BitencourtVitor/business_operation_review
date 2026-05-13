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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip"
import {
  Activity, ArrowLeft, BarChart2, Banknote, Bell,
  CalendarCheck, Check, ChevronDown, ChevronUp, ClipboardCheck, ClipboardList,
  Eye, FileCheck, Fuel, Gauge,
  Gem, KeyRound, Loader2,
  Package, Pencil, Plus, Ruler, Search,
  Settings, ShieldAlert, ShieldCheck, Trash2,
  User, UserCheck, UserCog, UserPlus, Users, Wrench,
} from "lucide-react"
import type { UserWithPermissions, PermissionLevel } from "@/services/settings.service"

// ─── Shared input class ───────────────────────────────────────────────────────

const inputCls =
  "h-8 w-full rounded-lg border border-input bg-transparent px-3 py-0 text-sm outline-none dark:bg-input/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

// ─── Role metadata ────────────────────────────────────────────────────────────

// Roles available in the "Add / Edit User" form
const ROLES = ["owner", "manager", "user"] as const

// Role hierarchy — higher number = more authority
const ROLE_RANK: Record<string, number> = {
  dev: 4, owner: 3, manager: 2, user: 1,
}

function canManage(myRole: string, targetRole: string): boolean {
  return (ROLE_RANK[myRole] ?? 0) > (ROLE_RANK[targetRole] ?? 0)
}

const roleMeta: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  dev:     { label: "Developer", icon: Gem,   className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  owner:   { label: "Owner",     icon: Gauge, className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  manager: { label: "Manager",   icon: Users, className: "border-primary/40 bg-primary/10 text-primary" },
  user:    { label: "User",      icon: User,  className: "border-border bg-secondary text-foreground" },
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

type PermDef = { key: string; label: string; icon?: React.ElementType; image?: string }
type PermGroup = { label: string; permissions: PermDef[] }

const PERMISSION_GROUPS: PermGroup[] = [
  {
    label: "Settings",
    permissions: [
      { key: "settings",               label: "Settings",            icon: Settings },
      { key: "settings_users",         label: "Manage Users",        icon: UserCog  },
      { key: "settings_notifications", label: "Manage Notifications", icon: Bell    },
    ],
  },
  {
    label: "Operations",
    permissions: [
      { key: "monthly_execution", label: "Monthly Execution",        icon: CalendarCheck  },
      { key: "workforce",         label: "Workforce Productivity",    icon: Users          },
      { key: "subcontractors",    label: "Subcontractor Performance", icon: ClipboardCheck },
      { key: "inventory",         label: "Inventory Control",         icon: Package        },
    ],
  },
  {
    label: "Finance & Analytics",
    permissions: [
      { key: "forecast",   label: "Framing Forecast",  image: "/images/sublogo_framing.png" },
      { key: "ofi",        label: "Operational Index", icon: BarChart2 },
      { key: "accounting", label: "Accounting",        icon: Banknote  },
      { key: "fuel",       label: "Fuel Control",      icon: Fuel      },
    ],
  },
  {
    label: "Data Management",
    permissions: [
      { key: "autolog",          label: "Quickbooks Time Auto Log", icon: Activity   },
      { key: "whos_working",     label: "Who's Working Report",  icon: UserCheck    },
      { key: "data_control",     label: "Forecast Data Control", icon: ClipboardList },
      { key: "permits",          label: "Permit Control",        icon: FileCheck     },
      { key: "project_monitoring", label: "HVAC Project Monitoring", image: "/images/sublogo_hvac.png" },
      { key: "service_requests", label: "Service Requests",      icon: Wrench        },
      { key: "takeoff",          label: "Takeoff Works",         icon: Ruler         },
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
  const [role,        setRole]        = useState<string>(existing?.role ?? "user")
  const [provisional, setProvisional] = useState<string | null>(null)

  useEffect(() => {
    setName(existing?.name  ?? "")
    setEmail(existing?.email ?? "")
    setRole(existing?.role  ?? "user")
    setProvisional(null)
  }, [existing])

  function reset() {
    setName(""); setEmail(""); setRole("user"); setProvisional(null)
  }

  async function handleSubmit() {
    if (!name.trim() || !email.trim()) return
    if (isEdit) {
      await updateUser.mutateAsync({ id: existing?.id, data: { name, email, role } })
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
                  <span className="flex items-center gap-1.5 flex-1 text-sm">
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
  const [typed, setTyped] = useState("")

  function handleClose() { setTyped(""); onClose() }

  async function confirm() {
    if (!target || typed !== target.name) return
    await deleteUser.mutateAsync(target.id)
    handleClose()
  }

  const confirmed = typed === target?.name

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
          This action is <span className="font-semibold">permanent and irreversible</span>. The user will lose all access immediately.
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
            disabled={!confirmed || deleteUser.isPending}
          >
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

function cycleLevel(current: PermissionLevel | undefined): PermissionLevel | undefined {
  if (!current)          return "read"
  if (current === "read") return "write"
  return undefined
}

function PermissionsModal({
  open, onClose, user: target,
}: {
  open:    boolean
  onClose: () => void
  user:    UserWithPermissions | null
}) {
  const updatePerms = useUpdateUserPermissions()
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel>>(target?.permissions ?? {})

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
      group.permissions.forEach(p => {
        if (level) next[p.key] = level
        else delete next[p.key]
      })
      return next
    })
  }

  async function save() {
    if (!target) return
    await updatePerms.mutateAsync({ userId: target.id, permissions })
    onClose()
  }

  const grantedCount = Object.keys(permissions).length
  const writeCount   = Object.values(permissions).filter(v => v === "write").length

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-none w-[min(90vw,60rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Screen Permissions
            {target && (
              <span className="ml-1 text-sm font-normal text-muted-foreground">— {target.name}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Legend + counter */}
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
            <span><span className="font-semibold text-foreground">{grantedCount}</span>/{TOTAL_PERMISSIONS} screens</span>
            <span className="text-border">·</span>
            <span><span className="font-semibold text-emerald-500">{writeCount}</span> with write</span>
          </div>
        </div>

        <ScrollArea className="max-h-[520px]">
          <div className="space-y-5 pr-2">
            {PERMISSION_GROUPS.map(group => {
              const levels    = group.permissions.map(p => permissions[p.key])
              const allWrite  = levels.every(l => l === "write")
              const allRead   = levels.every(l => !!l)
              return (
                <div key={group.label}>
                  {/* Group header */}
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                    <div className="flex items-center gap-1">
                      <button type="button"
                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${allRead && !allWrite ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-primary"}`}
                        onClick={() => setGroupLevel(group, allRead && !allWrite ? undefined : "read")}>
                        <Eye className="h-3 w-3" />Read
                      </button>
                      <button type="button"
                        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${allWrite ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground hover:text-emerald-500"}`}
                        onClick={() => setGroupLevel(group, allWrite ? undefined : "write")}>
                        <Pencil className="h-3 w-3" />Write
                      </button>
                    </div>
                  </div>

                  {/* Permission cards */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {group.permissions.map(perm => {
                      const Icon  = perm.icon ?? null
                      const level = permissions[perm.key]
                      const isRead  = !!level
                      const isWrite = level === "write"
                      return (
                        <div
                          key={perm.key}
                          onClick={() => cycle(perm.key)}
                          className={`flex min-w-0 cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 py-2 transition-all ${
                            isWrite ? "border-emerald-500/30 bg-emerald-500/5"
                            : isRead ? "border-primary/30 bg-primary/5"
                            : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            isWrite ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : isRead ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground"
                          }`}>
                            {perm.image
                              ? <img src={perm.image} alt={perm.label} className="h-3 w-3 object-contain" />
                              : Icon && <Icon className="h-3 w-3" />
                            }
                          </div>
                          <span className={`min-w-0 flex-1 line-clamp-2 text-xs font-medium leading-tight ${
                            isRead ? "text-foreground" : "text-muted-foreground"
                          }`} title={perm.label}>
                            {perm.label}
                          </span>
                          <div className="flex shrink-0 flex-col items-center gap-0.5">
                            <Eye    className={`h-2.5 w-2.5 ${isRead  ? "text-primary"     : "text-muted-foreground/20"}`} />
                            <Pencil className={`h-2.5 w-2.5 ${isWrite ? "text-emerald-500" : "text-muted-foreground/20"}`} />
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
              <span className="flex items-center gap-1.5 flex-1 text-sm text-muted-foreground">
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

        {/* Table */}
        <div className="overflow-y-auto rounded-xl border bg-card" style={{ maxHeight: "calc(100vh - 16rem)" }}>
          {ul ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {users.length === 0 ? "No users yet" : "No users match your search"}
            </p>
          ) : (
              <Table className="[&_th]:py-2.5 [&_td]:py-2">
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-full border-r border-border">
                      <button onClick={() => toggleSort("name")}
                        className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground ${sortKey === "name" ? "text-foreground" : "text-muted-foreground"}`}>
                        User
                        {sortKey === "name" ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3 opacity-20" />}
                      </button>
                    </TableHead>
                    <TableHead className="border-r border-border text-center">
                      <button onClick={() => toggleSort("role")}
                        className={`mx-auto flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground ${sortKey === "role" ? "text-foreground" : "text-muted-foreground"}`}>
                        Role
                        {sortKey === "role" ? sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3 opacity-20" />}
                      </button>
                    </TableHead>
                    <TableHead className="border-r border-border text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Permissions
                    </TableHead>
                    <TableHead className="bg-muted/60 text-center text-muted-foreground">
                      <Settings className="mx-auto h-3.5 w-3.5" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(u => {
                    const granted = Object.values(u.permissions).filter(Boolean).length
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="border-r border-border">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">{u.name}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </div>
                        </TableCell>
                        <TableCell className="border-r border-border text-center">
                          <RoleBadge role={u.role} />
                        </TableCell>
                        <TableCell className="border-r border-border text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs tabular-nums text-muted-foreground">{granted}/{TOTAL_PERMISSIONS}</span>
                            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(granted / TOTAL_PERMISSIONS) * 100}%` }} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="bg-muted/20">
                          <TooltipProvider>
                            <div className="flex items-center justify-center gap-1">
                              {canManage(me?.role ?? "", u.role) && (<>
                                <Tooltip>
                                  <TooltipTrigger render={<button className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={() => { setEditing(u); setFormOpen(true) }} />}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Edit user</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger render={<button className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={() => setResetTarget(u)} />}>
                                    <KeyRound className="h-3.5 w-3.5" />
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Reset password</TooltipContent>
                                </Tooltip>
                                {u.id !== me?.id && (
                                  <Tooltip>
                                    <TooltipTrigger render={<button className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteTarget(u)} />}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </TooltipTrigger>
                                    <TooltipContent side="top">Delete user</TooltipContent>
                                  </Tooltip>
                                )}
                              </>)}
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
