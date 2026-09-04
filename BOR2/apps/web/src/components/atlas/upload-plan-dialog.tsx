"use client"

import { NamingTemplateDialog } from "@/components/atlas/naming-template-dialog"
import { readPageNames, type NamingTemplate } from "@/components/atlas/plan-naming"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useUpdateDocCategory } from "@/hooks/use-atlas"
import { Check, CloudUpload, FileUp, ImagePlus, Paperclip, ScanText, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import type { AtlasJobsiteCategory } from "@/services/atlas.service"

/** Uma etiqueta escolhida: a categoria e o valor do eixo. */
type TagKey = { categoryId: number; subcategory: string }

/** O que um documento novo precisa saber de si além do arquivo. */
export type DocumentIdentity = { name: string; tags: TagKey[] }

/** "3rd Floor Trusses", "C Unit Cabinet Layout", ou só "Permit Set". */
function slotLabel(sl: AtlasJobsiteCategory) {
  if (!sl.subcategory) return sl.name
  return sl.axis === "unit"
    ? `${sl.subcategory} Unit ${sl.name}`
    : `${sl.subcategory} Floor ${sl.name}`
}

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
  categoryId, naming, revisionCount, open, slots, onStart, onClose,
}: {
  /** A categoria da pasta, onde o gabarito de nomenclatura fica guardado. */
  categoryId?: number
  naming?: NamingTemplate
  /** Quantas versões já existem: a próxima é a seguinte, sem ninguém digitar. */
  revisionCount: number
  open: boolean
  /**
   * Documento novo: as categorias que esta obra espera receber. Presente,
   * o diálogo também pergunta nome e etiquetas; ausente, ele só troca o set de
   * um documento que já existe.
   */
  slots?: AtlasJobsiteCategory[]
  /** Quem envia é a página: o envio precisa sobreviver ao fechamento daqui. */
  onStart: (
    file: File,
    names?: Map<number, string>,
    identity?: DocumentIdentity,
    version?: { name: string; notes: string; attachments: File[] },
  ) => void
  onClose: () => void
}) {
  const updateCategory = useUpdateDocCategory()
  const inputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState("")

  // O nome do documento e como ele se classifica. O nome nasce do arquivo:
  // quem anexou já escolheu como chamar aquilo, e digitar de novo é pedir a
  // mesma coisa duas vezes. Fica editável aqui e depois, na própria página.
  const [name, setName] = useState("")
  const [tags, setTags] = useState<TagKey[]>([])

  // O apelido desta versão e o que mudou nela. A versão se identifica pela data
  // e hora do envio; isto é o que a data não conta.
  const [versionName, setVersionName] = useState("")
  const [versionNotes, setVersionNotes] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])

  const [marking, setMarking] = useState(false)
  const [template, setTemplate] = useState<NamingTemplate | undefined>(naming)
  const [names, setNames] = useState<Map<number, string> | null>(null)
  const [reading, setReading] = useState("")

  useEffect(() => {
    if (open) return
    setFile(null); setError("")
    setNames(null); setReading("")
    setName(""); setTags([])
    setVersionName(""); setVersionNotes(""); setAttachments([])
  }, [open])

  function choose(picked: File | null) {
    setFile(picked); setError("")
    // Sem a extensão: ".pdf" é o formato, não o nome do documento.
    if (picked) setName(picked.name.replace(/.pdf$/i, "").trim())
  }

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
    }, undefined, file?.name)
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
    onStart(file, names ?? undefined,
      slots ? { name: name.trim() || file.name.replace(/.pdf$/i, ""), tags } : undefined,
      { name: versionName.trim(), notes: versionNotes.trim(), attachments })
    onClose()
  }

  const busy = false

  return (
    <>
      <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {slots ? "New document"
                : revisionCount ? "Replace the plan set"
                : "Upload the plan set"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {/* 1. O arquivo. */}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={e => choose(e.target.files?.[0] ?? null)}
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

            {/* 2. Como o documento se chama e como ele se classifica. Só para
                documento novo: trocar o set de um que já existe não é hora de
                mexer no nome dele. */}
            {slots && !!file && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="doc-name">Document name</Label>
                  <Input
                    id="doc-name"
                    value={name}
                    placeholder="Comes from the file"
                    onChange={e => setName(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Categories</Label>
                  {slots.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      This jobsite has no category yet. Add one from the folder list, or upload
                      it plain and tag it later.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {slots.map(sl => {
                        const key = `${sl.categoryId}:${sl.subcategory}`
                        const on = tags.some(t => `${t.categoryId}:${t.subcategory}` === key)
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setTags(prev => on
                              ? prev.filter(t => `${t.categoryId}:${t.subcategory}` !== key)
                              : [...prev, { categoryId: sl.categoryId, subcategory: sl.subcategory }])}
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                              on
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}
                          >
                            {slotLabel(sl)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A document can carry more than one. A set covering the 3rd and the 4th
                    floor is one document with two.
                  </p>
                </div>
              </>
            )}

            {/* 3. Onde o nome de cada folha está impresso. Opcional: dá para
                subir agora e nomear depois, na própria pasta, que é o caminho
                de quem recebeu o arquivo e ainda não sabe como ele é
                organizado. */}
            <Button
              variant="outline"
              className="h-auto justify-start py-3"
              disabled={!localUrl || busy}
              onClick={() => setMarking(true)}
            >
              <ScanText className="h-4 w-4" />
              <span className="flex min-w-0 flex-col items-start">
                <span>{template?.levels?.length ? "Naming marked" : "Mark the naming (optional)"}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {reading ? `Reading the sheets ${reading}`
                    : names ? `${names.size} sheets named by the template`
                    : template?.levels?.length ? "Tap to check or redo it"
                    : "Skip it and the sheets go by page number until you name them"}
                </span>
              </span>
              {!!names?.size && !reading && (
                <Check className="ml-auto h-4 w-4 text-emerald-500" />
              )}
            </Button>

            {/* Trocar o set é o momento de dizer o que mudou. Num documento
                novo não há o que comparar, e o campo só pediria texto por
                pedir. */}
            {revisionCount > 0 && !!file && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ver-name">Version name</Label>
                  <Input
                    id="ver-name"
                    value={versionName}
                    placeholder="What changed, in a few words"
                    onChange={e => setVersionName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ver-notes">Why it changed</Label>
                  {/* Uma linha só não cabia o motivo. Quem troca um set conta o
                      que foi achado em obra, quem pediu e o que a correção
                      resolve, e isso não é uma frase. */}
                  <Textarea
                    id="ver-notes"
                    rows={4}
                    value={versionNotes}
                    placeholder="What was found, who asked for it, what the correction solves"
                    onChange={e => setVersionNotes(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Attachments</Label>
                  <input
                    ref={filesRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={e => {
                      // A lista sai do input agora, e não dentro do
                      // atualizador de estado: o React só roda o atualizador
                      // na renderização seguinte, e até lá a linha abaixo já
                      // esvaziou o campo. Lendo lá dentro, o anexo chegava
                      // sempre vazio e a tela não mostrava nada.
                      const escolhidos = Array.from(e.target.files ?? [])
                      e.target.value = ""
                      setAttachments(prev => [...prev, ...escolhidos])
                    }}
                  />
                  {/* A foto do que se achou em obra, o recorte do e-mail do
                      projetista. Sem lugar para isso, a justificativa vira "ver
                      anexo no e-mail" e o anexo fica fora do Atlas. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {attachments.map((a, i) => (
                      <span
                        key={`${a.name}-${i}`}
                        className="flex items-center gap-1 rounded-md border border-border/60 py-1 pl-2 pr-1 text-xs text-muted-foreground"
                      >
                        <Paperclip className="h-3 w-3" />
                        <span className="max-w-36 truncate">{a.name}</span>
                        <button
                          type="button"
                          onClick={() => setAttachments(p => p.filter((_, k) => k !== i))}
                          className="rounded p-0.5 transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <Button variant="outline" size="xs" onClick={() => filesRef.current?.click()}>
                      <ImagePlus />
                      Add an image
                    </Button>
                  </div>
                </div>
              </>
            )}

            {revisionCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {/* A regra fica dita onde a decisão acontece, não num aviso à
                    parte: o que sobe passa a valer e o que estava vale como
                    histórico. */}
                The current plan set becomes the previous one. The sheet that counts is always the last one uploaded.
              </p>
            )}

            {error && <p className="text-center text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={!file}>
              <CloudUpload className="h-4 w-4" />
              Upload
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
            const target = categoryId ?? tags[0]?.categoryId
            if (target) {
              updateCategory.mutate({ id: target, naming: next }, {
                onError: () => setError("The template was not saved to the folder. This upload still uses what you marked."),
              })
            }
          }}
        />
      )}
    </>
  )
}
