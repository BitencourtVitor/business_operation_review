"use client"

import { NamingTemplateDialog } from "@/components/atlas/naming-template-dialog"
import { readPageNames, type NamingTemplate } from "@/components/atlas/plan-naming"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useUpdateDocCategory, useUploadAtlasVersion } from "@/hooks/use-atlas"
import { Check, CloudUpload, FileUp, ScanText } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const STEP_LABEL = {
  opening: "Opening the version",
  uploading: "Uploading the file",
  confirming: "Checking",
  splitting: "Splitting the sheets",
} as const

type Step = keyof typeof STEP_LABEL

/**
 * Subir um plan set, do arquivo às folhas nomeadas.
 *
 * Era um formulário encostado no topo da página, com um campo de revisão que
 * ninguém sabia preencher e uma lista de versões antigas ao lado. Nada disso é
 * assunto de quem tem o PDF na mão: o que existe é o arquivo, onde os nomes
 * estão impressos nele, e o envio. A revisão passa a ser contada sozinha, e a
 * folha que vale é sempre a última.
 */
export function UploadPlanDialog({
  documentId, categoryId, naming, revisionCount, open, onClose,
}: {
  documentId: string
  /** A categoria da pasta, onde o gabarito de nomenclatura fica guardado. */
  categoryId?: number
  naming?: NamingTemplate
  /** Quantas versões já existem: a próxima é a seguinte, sem ninguém digitar. */
  revisionCount: number
  open: boolean
  onClose: () => void
}) {
  const upload = useUploadAtlasVersion(documentId)
  const updateCategory = useUpdateDocCategory()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<Step | null>(null)
  const [detail, setDetail] = useState("")
  const [error, setError] = useState("")

  const [marking, setMarking] = useState(false)
  const [template, setTemplate] = useState<NamingTemplate | undefined>(naming)
  const [names, setNames] = useState<Map<number, string> | null>(null)
  const [reading, setReading] = useState("")

  useEffect(() => {
    if (open) return
    setFile(null); setStep(null); setDetail(""); setError("")
    setNames(null); setReading("")
  }, [open])

  // O que veio do servidor só entra enquanto ninguém marcou nada aqui: a
  // categoria devolve o gabarito a cada refetch, e adotá-lo sempre apagava a
  // marcação recém-feita no meio do envio.
  const marked = useRef(false)
  useEffect(() => {
    if (marked.current || !naming?.levels?.length) return
    setTemplate(naming)
  }, [naming])

  // O arquivo escolhido só existe no navegador; para marcar o gabarito e ler os
  // nomes, ele precisa de um endereço.
  const [localUrl, setLocalUrl] = useState("")
  useEffect(() => {
    if (!file) { setLocalUrl(""); return }
    const href = URL.createObjectURL(file)
    setLocalUrl(href)
    return () => URL.revokeObjectURL(href)
  }, [file])

  // Gabarito conhecido: os nomes saem sozinhos assim que o arquivo entra.
  useEffect(() => {
    if (!localUrl || !template?.levels?.length) { setNames(null); return }
    let alive = true
    setReading("0")
    readPageNames(localUrl, template, (done, total) => {
      if (alive) setReading(`${done}/${total}`)
    })
      .then(list => {
        if (!alive) return
        setNames(new Map(list.filter(n => n.name).map(n => [n.pageIndex, n.name])))
      })
      .catch(() => { if (alive) setNames(null) })
      .finally(() => { if (alive) setReading("") })
    return () => { alive = false }
  }, [localUrl, template])

  function submit() {
    if (!file) return
    setError("")
    upload.mutate(
      {
        file,
        names: names ?? undefined,
        // Contada, não digitada: quem sobe o arquivo sabe que ele é o mais novo,
        // não qual número ele tem na fila.
        revision: String(revisionCount + 1),
        onProgress: (next: Step, info?: string) => { setStep(next); setDetail(info ?? "") },
      },
      {
        onSuccess: () => onClose(),
        onError: (e: unknown) => {
          setStep(null)
          setError(e instanceof Error ? e.message : "could not upload")
        },
      },
    )
  }

  const busy = upload.isPending

  return (
    <>
      <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {revisionCount ? "Replace the plan set" : "Upload the plan set"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {/* 1. O arquivo. */}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setError("") }}
            />
            <Button
              variant="outline"
              className="h-auto justify-start py-3"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <FileUp className="h-4 w-4" />
              <span className="flex min-w-0 flex-col items-start">
                <span className="truncate">{file ? file.name : "Choose the PDF"}</span>
                {file && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                )}
              </span>
            </Button>

            {/* 2. Onde o nome de cada folha está impresso. */}
            <Button
              variant="outline"
              className="h-auto justify-start py-3"
              disabled={!localUrl || busy}
              onClick={() => setMarking(true)}
            >
              <ScanText className="h-4 w-4" />
              <span className="flex min-w-0 flex-col items-start">
                <span>{template?.levels?.length ? "Naming marked" : "Mark the naming"}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {reading ? `Reading the sheets ${reading}`
                    : names ? `${names.size} sheets named by the template`
                    : template?.levels?.length ? "Tap to check or redo it"
                    : "Where each sheet name is printed"}
                </span>
              </span>
              {!!names?.size && !reading && (
                <Check className="ml-auto h-4 w-4 text-emerald-500" />
              )}
            </Button>

            {revisionCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {/* A regra fica dita onde a decisão acontece, não num aviso à
                    parte: o que sobe passa a valer e o que estava vale como
                    histórico. */}
                The current plan set becomes the previous one. The sheet that counts is always the last one uploaded.
              </p>
            )}

            {step && (
              <p className="text-center text-xs text-muted-foreground">
                {STEP_LABEL[step]}{detail ? ` ${detail}` : ""}…
              </p>
            )}
            {error && <p className="text-center text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={!file || busy}>
              <CloudUpload className="h-4 w-4" />
              {busy ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {localUrl && (
        <NamingTemplateDialog
          url={localUrl}
          open={marking}
          initial={template}
          onClose={() => setMarking(false)}
          onSave={next => {
            marked.current = true
            setTemplate(next)
            setMarking(false)
            // Guardado na categoria: o próximo envio do mesmo relatório já sobe
            // nomeado, sem ninguém remarcar nada.
            // Gravar o gabarito é conveniência do próximo envio, não condição
            // deste: se falhar, o envio segue com o que está marcado aqui, e o
            // aviso diz que da próxima vez vai precisar remarcar.
            if (categoryId) {
              updateCategory.mutate({ id: categoryId, naming: next }, {
                onError: () => setError("The template was not saved to the folder. This upload still uses what you marked."),
              })
            }
          }}
        />
      )}
    </>
  )
}
