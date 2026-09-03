"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NamingTemplateDialog } from "@/components/atlas/naming-template-dialog"
import { readPageNames, type NamingTemplate } from "@/components/atlas/plan-naming"
import { useUploadAtlasVersion, useUpdateDocCategory } from "@/hooks/use-atlas"
import { CloudUpload, FileUp, ScanText } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const STEP_LABEL = {
  opening: "Opening the version…",
  uploading: "Uploading the set…",
  confirming: "Checking the file…",
  splitting: "Splitting into plans…",
} as const

type Step = keyof typeof STEP_LABEL

/**
 * O PDF vai direto do navegador para o R2 pela URL assinada — não passa pela
 * API (AT-9). Por isso o botão fala em três etapas: a do meio é a longa, e num
 * set de 112 MB em internet de obra ela pode levar minutos.
 */
export function VersionUpload({ documentId, categoryId, naming }: {
  documentId: string
  /** A categoria da pasta, que é onde o gabarito de nomenclatura fica guardado. */
  categoryId?: number
  naming?: NamingTemplate
}) {
  const upload = useUploadAtlasVersion(documentId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [revision, setRevision] = useState("")
  const [step, setStep] = useState<Step | null>(null)
  // O corte é a etapa longa e a única com contagem: 51 páginas dão 51 uploads,
  // e ficar sem número na tela é o que faz parecer travado.
  const [detail, setDetail] = useState("")
  const [error, setError] = useState("")

  // O gabarito vive na categoria, mas é aqui que ele se marca: é olhando o
  // arquivo que se enxerga onde o nome está impresso.
  const [marking, setMarking] = useState(false)
  const [template, setTemplate] = useState<NamingTemplate | undefined>(naming)
  const [names, setNames] = useState<Map<number, string> | null>(null)
  const [naming_, setNaming] = useState("")
  const updateCategory = useUpdateDocCategory()

  // O arquivo escolhido só existe no navegador até subir; para marcar e para
  // ler os nomes, ele precisa de um endereço.
  const [localUrl, setLocalUrl] = useState("")
  useEffect(() => {
    if (!file) { setLocalUrl(""); return }
    const href = URL.createObjectURL(file)
    setLocalUrl(href)
    return () => URL.revokeObjectURL(href)
  }, [file])

  // Gabarito conhecido: os nomes saem sozinhos assim que o arquivo entra, sem
  // ninguém precisar abrir nada.
  useEffect(() => {
    if (!localUrl || !template?.levels?.length) { setNames(null); return }
    let alive = true
    setNaming("0")
    readPageNames(localUrl, template, (done, total) => {
      if (alive) setNaming(`${done}/${total}`)
    })
      .then(list => {
        if (!alive) return
        setNames(new Map(list.filter(n => n.name).map(n => [n.pageIndex, n.name])))
      })
      .catch(() => { if (alive) setNames(null) })
      .finally(() => { if (alive) setNaming("") })
    return () => { alive = false }
  }, [localUrl, template])

  function submit() {
    if (!file || !revision.trim()) return
    setError("")
    upload.mutate(
      {
        file,
        names: names ?? undefined,
        revision: revision.trim(),
        onProgress: (next: Step, info?: string) => { setStep(next); setDetail(info ?? "") },
      },
      {
        onSuccess: () => { setFile(null); setRevision(""); setStep(null); setDetail("") },
        onError: (e: unknown) => {
          setStep(null)
          setError(e instanceof Error ? e.message : "upload failed")
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4">
      <p className="text-sm font-medium">New revision</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-40">
          <Label htmlFor="revision">Revision</Label>
          <Input
            id="revision"
            value={revision}
            placeholder="2"
            onChange={e => setRevision(e.target.value)}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="version-file">File</Label>
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
            <span className="truncate">{file ? file.name : "Choose PDF"}</span>
          </Button>
        </div>

        {/* Marcar onde o nome está impresso. Só faz sentido com o arquivo em
            mãos, e é por isso que fica aqui e não na tela da taxonomia. */}
        <Button
          variant="outline"
          disabled={!localUrl}
          onClick={() => setMarking(true)}
          title="Marcar onde o nome de cada folha está impresso"
        >
          <ScanText className="h-4 w-4" />
          {template?.levels?.length ? "Naming set" : "Set naming"}
        </Button>

        <Button onClick={submit} disabled={!file || !revision.trim() || upload.isPending}>
          <CloudUpload className="h-4 w-4" />
          {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {step && (
        <p className="text-xs text-muted-foreground">
          {STEP_LABEL[step]}{detail ? ` ${detail}` : ""}
        </p>
      )}
      {naming_ && (
        <p className="text-xs text-muted-foreground">Reading sheet names {naming_}</p>
      )}
      {!naming_ && names && (
        <p className="text-xs text-muted-foreground">
          {names.size} folha{names.size === 1 ? "" : "s"} nomeada
          {names.size === 1 ? "" : "s"} pelo gabarito.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {localUrl && (
        <NamingTemplateDialog
          url={localUrl}
          open={marking}
          initial={template}
          onClose={() => setMarking(false)}
          onSave={next => {
            setTemplate(next)
            setMarking(false)
            // Guardado na categoria: o próximo nível do mesmo relatório sobe
            // nomeado sem ninguém remarcar nada.
            if (categoryId) {
              updateCategory.mutate({ id: categoryId, naming: next })
            }
          }}
        />
      )}
    </div>
  )
}
