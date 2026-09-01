"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUploadAtlasVersion } from "@/hooks/use-atlas"
import { CloudUpload, FileUp } from "lucide-react"
import { useRef, useState } from "react"

const STEP_LABEL = {
  opening: "Abrindo a versão…",
  uploading: "Enviando para o storage…",
  confirming: "Conferindo o arquivo…",
} as const

/**
 * O PDF vai direto do navegador para o R2 pela URL assinada — não passa pela
 * API (AT-9). Por isso o botão fala em três etapas: a do meio é a longa, e num
 * set de 112 MB em internet de obra ela pode levar minutos.
 */
export function VersionUpload({ documentId }: { documentId: string }) {
  const upload = useUploadAtlasVersion(documentId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [revision, setRevision] = useState("")
  const [step, setStep] = useState<keyof typeof STEP_LABEL | null>(null)
  const [error, setError] = useState("")

  function submit() {
    if (!file || !revision.trim()) return
    setError("")
    upload.mutate(
      { file, revision: revision.trim(), onProgress: setStep },
      {
        onSuccess: () => { setFile(null); setRevision(""); setStep(null) },
        onError: (e: unknown) => {
          setStep(null)
          setError(e instanceof Error ? e.message : "falha ao enviar")
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4">
      <p className="text-sm font-medium">Nova revisão</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-40">
          <Label htmlFor="revision">Revisão</Label>
          <Input
            id="revision"
            value={revision}
            placeholder="2"
            onChange={e => setRevision(e.target.value)}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="version-file">Arquivo</Label>
          <input
            id="version-file"
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          <Button variant="outline" className="justify-start" onClick={() => inputRef.current?.click()}>
            <FileUp className="h-4 w-4" />
            <span className="truncate">{file ? file.name : "Escolher PDF"}</span>
          </Button>
        </div>

        <Button onClick={submit} disabled={!file || !revision.trim() || upload.isPending}>
          <CloudUpload className="h-4 w-4" />
          {upload.isPending ? "Enviando…" : "Enviar"}
        </Button>
      </div>

      {step && <p className="text-xs text-muted-foreground">{STEP_LABEL[step]}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
