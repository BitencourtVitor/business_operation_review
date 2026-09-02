"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/hooks/use-auth"
import { useWorkforceUploads, useWorkforceUpload, useDeleteWorkforceUpload } from "@/hooks/use-workforce"
import type { WorkforceUpload } from "@/services/workforce.service"
import { ArrowLeft, Building2, Loader2, ShieldAlert, Trash2, Upload, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

const COMPANIES = ["Framing", "PCG", "HVAC"] as const
type Company = (typeof COMPANIES)[number]

function formatMonth(ym: string) {
  const [y, m] = ym.split("-")
  return new Date(Number(y), Number(m) - 1).toLocaleString("en-US", { month: "long", year: "numeric" })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

const companyColor: Record<string, string> = {
  Framing: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  PCG:     "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  HVAC:    "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400",
}

// ─── Upload dialog ────────────────────────────────────────────────────────────

function UploadDialog({
  onClose,
  existingUploads,
}: {
  onClose: () => void
  existingUploads: WorkforceUpload[]
}) {
  const [company, setCompany]       = useState<Company>("Framing")
  const [month, setMonth]           = useState("")
  const [file, setFile]             = useState<File | null>(null)
  const [conflict, setConflict]     = useState<WorkforceUpload | null>(null)
  const [error, setError]           = useState("")
  const fileRef                     = useRef<HTMLInputElement>(null)
  const upload                      = useWorkforceUpload()

  const existing = existingUploads.find(u => u.referenceMonth === month && u.company === company)

  async function handleSubmit(overwrite = false) {
    if (!file || !month) return
    setError("")

    if (existing && !overwrite) {
      setConflict(existing)
      return
    }

    const res = await upload.mutateAsync({ file, company, referenceMonth: month, overwrite })
    if (!res.ok) {
      setError(res.error ?? "Upload failed")
      return
    }
    onClose()
  }

  if (conflict) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <h2 className="text-base font-semibold">Upload already exists</h2>
          </div>
          <p className="mb-1 text-sm text-muted-foreground">
            A file for <span className="font-medium text-foreground">{conflict.company}</span> ·{" "}
            <span className="font-medium text-foreground">{formatMonth(conflict.referenceMonth)}</span> already exists.
          </p>
          <p className="mb-5 text-sm text-muted-foreground">
            Overwriting will permanently delete <span className="font-medium text-foreground">{conflict.recordCount.toLocaleString()} records</span> and replace them with the new file.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConflict(null)} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={() => { setConflict(null); handleSubmit(true) }}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              Overwrite
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <h2 className="mb-5 text-base font-semibold">Upload Timesheet CSV</h2>

        <div className="flex flex-col gap-4">
          {/* Company */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Company</label>
            <div className="flex gap-2">
              {COMPANIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCompany(c)}
                  className={cn(
                    "flex-1 rounded-lg border py-2 text-xs font-medium transition-colors",
                    company === c
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Month */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Reference Month</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* File */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">CSV File</label>
            <button
              onClick={() => fileRef.current?.click()}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm transition-colors",
                file ? "border-primary/40 bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <Upload className="h-4 w-4 shrink-0" />
              {file ? file.name : "Choose CSV file…"}
            </button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>

          {existing && (
            <p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
              ⚠ An upload already exists for {company} · {formatMonth(month)}
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={!file || !month || upload.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {upload.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Upload
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkforceSettingsPage() {
  const { user, isLoading: authLoading } = useAuth()
  const { data: uploads = [], isLoading } = useWorkforceUploads()
  const deleteUpload = useDeleteWorkforceUpload()
  const [uploadOpen, setUploadOpen]       = useState(false)
  const [deletingId, setDeletingId]       = useState<string | null>(null)

  if (authLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (user && !["dev", "owner", "manager"].includes(user.role)) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive/60" />
          <p className="font-medium">Access Denied</p>
          <p className="text-sm text-muted-foreground">Only administrators can manage workforce data.</p>
        </div>
      </div>
    )
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    await deleteUpload.mutateAsync(id)
    setDeletingId(null)
  }

  // Group by month
  const byMonth = uploads.reduce<Record<string, WorkforceUpload[]>>((acc, u) => {
    if (!acc[u.referenceMonth]) acc[u.referenceMonth] = []
    acc[u.referenceMonth].push(u)
    return acc
  }, {})

  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/bor/settings" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-tight">Workforce Productivity</h1>
            <p className="text-sm text-muted-foreground">Manage QBTime CSV uploads by month and company</p>
          </div>
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Upload className="h-4 w-4" />
            New Upload
          </button>
        </div>

        {/* Upload list */}
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : months.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No uploads yet. Upload your first QBTime CSV.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {months.map(month => (
              <div key={month}>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/50">
                  {formatMonth(month)}
                </p>
                <div className="flex flex-col overflow-hidden rounded-xl border border-border/30 bg-muted/40">
                  {byMonth[month].map((u, i) => (
                    <div
                      key={u.id}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3",
                        i < byMonth[month].length - 1 && "border-b border-border/30",
                      )}
                    >
                      <span className={cn(
                        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        companyColor[u.company] ?? "border-border bg-secondary text-foreground",
                      )}>
                        {u.company}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.recordCount.toLocaleString()} records · {u.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs · {formatDate(u.uploadedAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(u.id)}
                        disabled={deletingId === u.id}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                      >
                        {deletingId === u.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {uploadOpen && (
        <UploadDialog onClose={() => setUploadOpen(false)} existingUploads={uploads} />
      )}
    </>
  )
}
