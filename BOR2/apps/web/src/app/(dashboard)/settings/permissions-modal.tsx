"use client"

import { useRef, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useUsers, useUpdateUserPermissions } from "@/hooks/use-settings"
import type { UserWithPermissions, PermissionLevel } from "@/services/settings.service"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  BarChart2, Banknote, Bell, Building2, CalendarCheck, CalendarClock,
  ClipboardCheck, ClipboardList, CreditCard, FileCheck, FileText, Fuel,
  Gauge, Gem, GripVertical, HandCoins, ImageIcon, Loader2, Lock, Network, Package, Settings,
  ShieldCheck, User, UserCheck, Users, Wrench,
} from "lucide-react"

// ─── Role hierarchy ────────────────────────────────────────────────────────────

const ROLE_RANK: Record<string, number> = { dev: 4, owner: 3, manager: 2, user: 1 }

// dev, owner, manager always have full access — cannot be revoked
const ALWAYS_ACCESS_ROLES = new Set(["dev", "owner", "manager"])

function canManage(myRole: string, targetRole: string) {
  return (ROLE_RANK[myRole] ?? 0) > (ROLE_RANK[targetRole] ?? 0)
}

// ─── Permission pages — mirrors app-sidebar structure ─────────────────────────

type PermDef   = { key?: string; label: string; icon?: React.ElementType; image?: string; imageDark?: string; writeLabel?: string; children?: PermDef[]; locked?: string }
type PermGroup = { label: string; permissions: PermDef[] }

const PERMISSION_GROUPS: PermGroup[] = [
  {
    label: "",
    permissions: [
      { key: "ofi",               label: "Operational Forecast Index", icon: BarChart2     },
      { key: "monthly_execution", label: "Monthly Execution",          icon: CalendarCheck },
      { key: "workforce",         label: "Workforce Productivity",     icon: Users         },
      { key: "inventory",         label: "Inventory Control",          icon: Package       },
      { key: "permits",           label: "Permit Control",             icon: FileCheck     },
      { key: "forecast",          label: "Framing Forecast",           image: "/images/sublogo_framing.png" },
      { key: "service_requests",  label: "Service Requests",           icon: Wrench        },
      { key: "accounting",        label: "Accounting",                 icon: Banknote,     writeLabel: "Ask Aria" },
      { key: "budget_control",    label: "Budget Control",             icon: HandCoins,    writeLabel: "Edit budget config" },
      { key: "building_schedule", label: "Building Schedule",          icon: Building2     },
      { key: "subcontractor_docs", label: "Subcontractor Docs",        icon: FileText      },
    ],
  },
  {
    label: "Coming Soon",
    permissions: [
      { key: "project_monitoring", label: "HVAC Project Monitoring", image: "/images/sublogo_hvac.png" },
      { key: "fuel",               label: "Fuel Control",            icon: Fuel           },
    ],
  },
  {
    label: "Data Management",
    permissions: [
      { key: "data_control",       label: "Forecast Data Control", icon: ClipboardList },
      { key: "wex_categorization", label: "WEX Categorization",    icon: CreditCard    },
      {
        label: "QBTime Reports",
        image: "/images/icon_qbtime.png", imageDark: "/images/icon_qbtime_dark.png",
        children: [
          { key: "autolog",        label: "Auto Log",             icon: ImageIcon     },
          { key: "weekly_hours",  label: "Weekly Hours Control", icon: CalendarClock },
          { key: "whos_working",  label: "Who's Working",        icon: UserCheck     },
          { key: "period_reports", label: "Period Reports",      icon: Banknote      },
        ],
      },
    ],
  },
  {
    label: "Settings",
    permissions: [
      { key: "settings", label: "Settings", icon: Settings },
      {
        label: "Settings Pages",
        icon: Settings,
        children: [
          { key: "settings_users",         label: "Manage Users",   icon: Users   },
          { key: "settings_teams",         label: "Teams",          icon: Network, writeLabel: "Manage teams" },
          { key: "settings_notifications", label: "Notifications",  icon: Bell    },
          {
            key: "settings_permissions", label: "Edit Permissions", icon: Lock,
            locked: "Edit Permissions is always restricted to Dev, Owner and Manager accounts. It can't be granted to standard users here.",
          },
        ],
      },
    ],
  },
]

const ALL_PERMS = PERMISSION_GROUPS.flatMap(g =>
  g.permissions.flatMap(p => p.children ? p.children : [p])
).filter((p): p is PermDef & { key: string } => !!p.key)

// ─── Role meta ────────────────────────────────────────────────────────────────

const roleMeta: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  dev:     { label: "Developer", icon: Gem,      className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
  owner:   { label: "Owner",     icon: Gauge,    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  manager: { label: "Manager",   icon: Users,    className: "border-primary/40 bg-primary/10 text-primary" },
  user:    { label: "User",      icon: User,        className: "border-border bg-secondary text-foreground" },
}

// ─── User card ────────────────────────────────────────────────────────────────

function UserCard({
  user, level, isDraggable, isFixed, onDragStart, onLevelChange, writeLabel = "Edit data",
}: {
  user:          UserWithPermissions
  level:         PermissionLevel | null
  isDraggable:   boolean
  isFixed:       boolean
  onDragStart:   () => void
  onLevelChange: ((l: PermissionLevel) => void) | null
  writeLabel?:   string
}) {
  const meta = roleMeta[user.role] ?? roleMeta.user
  const Icon = meta.icon

  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? onDragStart : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border border-border bg-card px-2 py-2 select-none transition-shadow",
        isDraggable  && "cursor-grab active:cursor-grabbing active:opacity-50 active:shadow-md",
        !isDraggable && !isFixed && "opacity-40",
        isFixed      && "opacity-70",
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

// ─── Modal ────────────────────────────────────────────────────────────────────

export function PermissionsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user: me }                    = useAuth()
  const { data: users = [], isLoading } = useUsers()
  const updatePerms                     = useUpdateUserPermissions()

  const [selectedKey, setSelectedKey] = useState<string>(ALL_PERMS[0].key)
  const [overrides, setOverrides]     = useState<Record<string, Record<string, PermissionLevel | null>>>({})

  const dragUserId = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState<"access" | "no-access" | null>(null)

  function getEffective(user: UserWithPermissions): Record<string, PermissionLevel> {
    const local  = overrides[user.id] ?? {}
    const merged = { ...user.permissions }
    for (const [k, v] of Object.entries(local)) {
      if (v === null) delete merged[k]
      else            merged[k] = v
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
    else                next[key] = level
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
    if (target === "access"    && !current) applyChange(uid, selectedKey, "read")
    if (target === "no-access" &&  current) applyChange(uid, selectedKey, null)
  }

  const byName = (a: UserWithPermissions, b: UserWithPermissions) => a.name.localeCompare(b.name)
  const byRoleZA = (a: UserWithPermissions, b: UserWithPermissions) =>
    (roleMeta[b.role]?.label ?? b.role).localeCompare(roleMeta[a.role]?.label ?? a.role)

  // Users with always-access roles always appear in Has Access, fixed
  const fixedAccess   = users.filter(u =>  ALWAYS_ACCESS_ROLES.has(u.role)).sort(byRoleZA)
  const withAccess    = users.filter(u => !ALWAYS_ACCESS_ROLES.has(u.role) &&  !!getEffective(u)[selectedKey]).sort(byName)
  const withoutAccess = users.filter(u => !ALWAYS_ACCESS_ROLES.has(u.role) && !getEffective(u)[selectedKey]).sort(byName)

  const selectedPerm  = ALL_PERMS.find(p => p.key === selectedKey)
  const writeLabel    = selectedPerm?.writeLabel ?? "Edit data"
  const lockedMessage = selectedPerm?.locked

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="flex max-h-[85vh] sm:max-w-[960px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-5 py-4">
          <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <DialogTitle className="flex-1 text-base">Edit Permissions</DialogTitle>
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </DialogHeader>

        {/* ── Column headers ── */}
        {!lockedMessage && (
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

          {/* ── Sidebar: pages ── */}
          <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-muted/20 p-2">
            {PERMISSION_GROUPS.map(group => (
              <div key={group.label} className="mb-3">
                {group.label && (
                  <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40">
                    {group.label}
                  </p>
                )}
                {group.permissions.map(perm =>
                  perm.children ? (
                    /* ── Parent grouper (e.g. QBTime Reports) ── */
                    <div key={perm.label} className="mb-0.5">
                      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground/40">
                        {perm.image
                          ? <>
                              <img src={perm.image} className={cn("h-3 w-3 shrink-0 object-contain", perm.imageDark && "dark:hidden")} alt="" />
                              {perm.imageDark && <img src={perm.imageDark} className="hidden h-3 w-3 shrink-0 object-contain dark:block" alt="" />}
                            </>
                          : perm.icon && <perm.icon className="h-3 w-3 shrink-0" />
                        }
                        {perm.label}
                      </div>
                      {perm.children.map(child => (
                        <button
                          key={child.key}
                          onClick={() => setSelectedKey(child.key!)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md py-1.5 pl-6 pr-2 text-left text-sm transition-colors",
                            selectedKey === child.key
                              ? "bg-background text-foreground font-medium shadow-sm"
                              : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                          )}
                        >
                          {child.image
                            ? <>
                                <img src={child.image} className={cn("h-3.5 w-3.5 shrink-0 object-contain", child.imageDark && "dark:hidden")} alt="" />
                                {child.imageDark && <img src={child.imageDark} className="hidden h-3.5 w-3.5 shrink-0 object-contain dark:block" alt="" />}
                              </>
                            : child.icon && <child.icon className="h-3.5 w-3.5 shrink-0" />
                          }
                          <span className="truncate">{child.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* ── Regular permission item ── */
                    <button
                      key={perm.key}
                      onClick={() => setSelectedKey(perm.key!)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        selectedKey === perm.key
                          ? "bg-background text-foreground font-medium shadow-sm"
                          : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                      )}
                    >
                      {perm.image
                        ? <>
                            <img src={perm.image} className={cn("h-3.5 w-3.5 shrink-0 object-contain", perm.imageDark && "dark:hidden")} alt="" />
                            {perm.imageDark && <img src={perm.imageDark} className="hidden h-3.5 w-3.5 shrink-0 object-contain dark:block" alt="" />}
                          </>
                        : perm.icon && <perm.icon className="h-3.5 w-3.5 shrink-0" />
                      }
                      <span className="truncate">{perm.label}</span>
                    </button>
                  )
                )}
              </div>
            ))}
          </aside>

          {/* ── DnD columns, or a locked-page notice ── */}
          {lockedMessage ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
              <Lock className="h-6 w-6 text-muted-foreground/40" />
              <p className="max-w-sm text-sm text-muted-foreground">{lockedMessage}</p>
            </div>
          ) : (
          <div className="flex flex-1 overflow-hidden">

              {/* No Access */}
              <div
                className={cn(
                  "flex w-64 shrink-0 flex-col overflow-hidden border-r border-border p-3 transition-colors",
                  dragOver === "no-access" && "bg-muted/60",
                )}
                onDragOver={e => { e.preventDefault(); setDragOver("no-access") }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop("no-access")}
              >
                <div className="flex flex-1 flex-col gap-1.5">
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
                      <p className="text-center text-xs text-muted-foreground/40">All users have access</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Has Access */}
              <div
                className={cn(
                  "flex flex-1 flex-col overflow-hidden transition-colors",
                  dragOver === "access" && "bg-primary/5",
                )}
                onDragOver={e => { e.preventDefault(); setDragOver("access") }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop("access")}
              >
                {/* Scrollable area for normal users */}
                <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3">
                  {withAccess.map(u => {
                    const level = getEffective(u)[selectedKey]
                    return (
                      <UserCard
                        key={u.id}
                        user={u}
                        level={level ?? null}
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
                    )
                  })}
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
                {/* Pinned footer: dev / owner / manager — always have access */}
                {fixedAccess.length > 0 && (
                  <div className="shrink-0 flex flex-col gap-1.5 border-t border-border/50 bg-muted/20 px-3 pb-3 pt-2.5">
                    <p className="px-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40">Always have access</p>
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
