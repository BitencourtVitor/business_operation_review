"use client"

import { useRef, useState } from "react"
import { Upload } from "lucide-react"
import { cn } from "@/lib/utils"

export function DropZone({ onFile, disabled }: { onFile: (f: File) => void; disabled?: boolean }) {
  const [drag, setDrag] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const handle = (f: File | undefined) => {
    if (f && f.type === "application/pdf") onFile(f)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!disabled) setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (!disabled) handle(e.dataTransfer.files[0]) }}
      onClick={() => !disabled && ref.current?.click()}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        drag ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/20",
      )}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <div className="text-center">
        <p className="text-sm font-medium">Drop MS Project PDF here</p>
        <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
      </div>
      <input ref={ref} type="file" accept=".pdf,application/pdf" className="hidden" onChange={e => handle(e.target.files?.[0])} />
    </div>
  )
}
