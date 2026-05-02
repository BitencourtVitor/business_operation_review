"use client"

import { useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Upload, X } from "lucide-react"
import { cn } from "@/lib/utils"

export function FileDropZone({ label, accept, fileName, status, warnMessage, onFile, onRemove }: {
  label:         string
  accept:        string
  fileName:      string
  status:        "idle" | "ok" | "warn"
  warnMessage?:  string
  onFile:        (f: File) => void
  onRemove?:     () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  return (
    <div
      onClick={() => ref.current?.click()}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-5 text-center transition-colors select-none",
        drag             ? "border-primary/60 bg-primary/5"
        : status === "ok"   ? "border-emerald-500/40 bg-emerald-500/5"
        : status === "warn" ? "border-amber-400/50 bg-amber-400/5"
        :                     "border-border/60 hover:border-border hover:bg-muted/30",
      )}
    >
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = "" }} />

      {status === "ok" && onRemove && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove() }}
          className="absolute right-2 top-2 rounded-md p-0.5 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Remove file"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {status === "ok" && (
        <><CheckCircle2 className="h-5 w-5 text-emerald-500" /><p className="text-xs font-medium">{fileName}</p><p className="text-[11px] text-muted-foreground">Click or drop to replace</p></>
      )}
      {status === "warn" && (
        <><AlertCircle className="h-5 w-5 text-amber-500" /><p className="text-xs font-medium text-amber-600 dark:text-amber-400">{fileName}</p><p className="text-[11px] text-muted-foreground">{warnMessage ?? "No valid rows — click to try another file"}</p></>
      )}
      {status === "idle" && (
        <><Upload className="h-5 w-5 text-muted-foreground/40" /><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="text-[11px] text-muted-foreground/60">Drag & drop or click to select</p></>
      )}
    </div>
  )
}
