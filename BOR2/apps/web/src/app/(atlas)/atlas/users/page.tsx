"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import {
  useAtlasUserCandidates, useAtlasUsers, useCreateAtlasUser, useSetAtlasUserAccess,
} from "@/hooks/use-atlas"
import { CodeXml, Copy, KeyRound, Plus, UserPlus, X } from "lucide-react"
import { useState } from "react"

const LEVELS = [
  { value: "read", label: "Read", hint: "Opens jobsites they were granted" },
  { value: "write", label: "Write", hint: "Also uploads documents and marks up plans" },
]

function NewUserDialog() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", level: "read" })
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)
  const create = useCreateAtlasUser()

  function close() {
    setOpen(false)
    setCreated(null)
    setForm({ name: "", email: "", level: "read" })
  }

  return (
    <Dialog open={open} onOpenChange={o => (o ? setOpen(true) : close())}>
      <DialogTrigger render={<Button />}>
        <UserPlus className="h-4 w-4" />
        New user
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>New Atlas user</DialogTitle></DialogHeader>

        {created ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Account created for <span className="font-medium">{created.email}</span>. This
              password is shown once and must be changed on first sign in.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-3">
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <code className="flex-1 truncate text-sm">{created.password}</code>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(created.password)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-name">Name</Label>
              <Input id="user-name" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-email">Email</Label>
              <Input id="user-email" type="email" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="user-level">Access</Label>
              <NativeSelect id="user-level" value={form.level}
                onChange={e => setForm({ ...form, level: e.target.value })}>
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                {LEVELS.find(l => l.value === form.level)?.hint}. Atlas only: this does not
                grant access to the BOR.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {created ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button
                disabled={!form.name.trim() || !form.email.trim() || create.isPending}
                onClick={() => create.mutate(form, {
                  onSuccess: r => setCreated({ email: form.email, password: r.provisionalPassword }),
                })}
              >
                {create.isPending ? "Creating…" : "Create"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GrantExistingDialog() {
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState("")
  const [level, setLevel] = useState("read")
  const { data: candidates } = useAtlasUserCandidates()
  const grant = useSetAtlasUserAccess()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Plus className="h-4 w-4" />
        Grant to existing
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Grant Atlas access</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grant-user">Person</Label>
            <NativeSelect id="grant-user" value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">Select…</option>
              {(candidates ?? []).map(u => (
                <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grant-level">Access</Label>
            <NativeSelect id="grant-level" value={level} onChange={e => setLevel(e.target.value)}>
              {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Only the Atlas key is written. Whatever they have in the BOR stays as it is.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!userId || grant.isPending}
            onClick={() => grant.mutate({ userId, level }, {
              onSuccess: () => { setUserId(""); setOpen(false) },
            })}
          >
            Grant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AtlasUsersPage() {
  const { data: users, isLoading } = useAtlasUsers()
  const setAccess = useSetAtlasUserAccess()

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Who gets into the Atlas. Access here is Atlas only: it never grants the BOR,
            and it never takes it away.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GrantExistingDialog />
          <NewUserDialog />
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      ) : !users?.length ? (
        <div className="rounded-lg border border-dashed border-border/60 p-10 text-center">
          <p className="text-sm font-medium">Nobody here yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a user for the Atlas, or grant access to somebody who already has an account.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map(u => (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium leading-tight">
                  {u.byRole && <CodeXml className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />}
                  {u.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>

              <span className="text-xs text-muted-foreground">
                {u.jobsites} {u.jobsites === 1 ? "jobsite" : "jobsites"}
              </span>

              {u.byRole ? (
                // Dev entra por ser dev; tirar a chave dele aqui não mudaria
                // nada, e o botão mentiria.
                <Badge variant="outline" className="border-yellow-500/40 text-yellow-600 dark:text-yellow-400">
                  Developer
                </Badge>
              ) : (
                <>
                  <NativeSelect
                    value={u.level}
                    className="h-8 w-28"
                    onChange={e => setAccess.mutate({ userId: u.id, level: e.target.value })}
                  >
                    {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </NativeSelect>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Remove Atlas access"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setAccess.mutate({ userId: u.id, level: "" })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
