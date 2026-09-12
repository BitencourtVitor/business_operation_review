"use client"

import { AttachmentPicker } from "@/components/atlas/attachment-picker"
import { AutolinkStep, type VinculoConfirmado } from "@/components/atlas/autolink-step"
import {
  NamingTemplateDialog, NamingTemplateEditor, type NamingEditorContext,
} from "@/components/atlas/naming-template-dialog"
import { readPageNames, type NamingTemplate } from "@/components/atlas/plan-naming"
import { Button } from "@/components/ui/button"
import { IconInput } from "@/components/common/icon-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useUpdateDocCategory } from "@/hooks/use-atlas"
import {
  ArrowLeft, ArrowRight, Check, CloudUpload, FileText, Link2, ListTree, ScanText,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  CategoryPicker, LINHA_VAZIA, paraEtiquetas, type LinhaCategoria,
} from "@/components/atlas/category-picker"

import type { AtlasDocCategory } from "@/services/atlas.service"

/** Uma etiqueta escolhida: a categoria e o valor do eixo. */
type TagKey = { categoryId: number; subcategory: string }

/** O que um documento novo precisa saber de si além do arquivo. */
export type DocumentIdentity = { name: string; tags: TagKey[] }

/**
 * Subir um plan set, do arquivo às folhas nomeadas.
 *
 * Era um formulário encostado no topo da página, com um campo de revisão que
 * ninguém sabia preencher e uma lista de versões antigas ao lado. Nada disso é
 * assunto de quem tem o PDF na mão: o que existe é o arquivo, onde os nomes
 * estão impressos nele, e o envio. A revisão passa a ser contada sozinha, e a
 * folha que vale é sempre a última.
 *
 * Documento novo vai em duas etapas. Na primeira, o arquivo, o nome e as
 * categorias: é o que diz o que a pasta é. Na segunda, onde o nome de cada
 * folha está impresso, que é trabalho de outra natureza (olhar o desenho e
 * marcar) e só faz sentido depois de a pasta estar decidida. Juntas numa tela
 * só, a marcação disputava atenção com o cadastro e parecia opcional.
 */
export function UploadPlanDialog({
  categoryId, jobsiteId, naming, revisionCount, open, categorias, ocupadas, onStart, onClose,
}: {
  /** A obra: o índice de destinos dos hiperlinks é dela inteira. */
  jobsiteId?: string
  /** A categoria da pasta, onde o gabarito de nomenclatura fica guardado. */
  categoryId?: number
  naming?: NamingTemplate
  /** Quantas versões já existem: a próxima é a seguinte, sem ninguém digitar. */
  revisionCount: number
  open: boolean
  /**
   * Documento novo: as categorias da taxonomia que valem para esta obra.
   * Presente, o diálogo pergunta nome e categoria numa primeira etapa; ausente,
   * ele só troca o set de um documento que já existe, numa tela só.
   */
  categorias?: AtlasDocCategory[]
  /** Vagas já tomadas por outro documento da obra, para o seletor apagar. */
  ocupadas?: Map<string, string>
  /** Quem envia é a página: o envio precisa sobreviver ao fechamento daqui. */
  onStart: (
    file: File,
    names?: Map<number, string>,
    identity?: DocumentIdentity,
    version?: { name: string; notes: string; attachments: File[] },
    /** Os vínculos confirmados na terceira etapa, gravados depois do envio. */
    links?: VinculoConfirmado[],
  ) => void
  onClose: () => void
}) {
  const updateCategory = useUpdateDocCategory()
  const inputRef = useRef<HTMLInputElement>(null)
  const novo = !!categorias

  const [etapa, setEtapa] = useState<1 | 2 | 3>(1)
  // A terceira etapa: a pergunta de sim ou não, e os vínculos confirmados.
  const [querLinks, setQuerLinks] = useState<boolean | null>(null)
  const [vinculos, setVinculos] = useState<VinculoConfirmado[]>([])
  // Quantas páginas o arquivo tem, contadas pela leitura dos nomes.
  const [paginasDoArquivo, setPaginasDoArquivo] = useState(0)
  // Como vai a conferência dos vínculos, que é o que libera o envio.
  const [estadoDosLinks, setEstadoDosLinks] = useState({ varrido: false, pendentes: 0 })
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState("")
  const [arrastando, setArrastando] = useState(false)

  // O nome do documento e como ele se classifica. O nome nasce do arquivo:
  // quem anexou já escolheu como chamar aquilo, e digitar de novo é pedir a
  // mesma coisa duas vezes. Fica editável aqui e depois, na própria página.
  const [name, setName] = useState("")
  // A categoria da pasta, escolhida junto com ela: a pasta é a dona da
  // categoria. As linhas completas viram as etiquetas do documento.
  const [linhas, setLinhas] = useState<LinhaCategoria[]>([LINHA_VAZIA])
  const { etiquetas: tags, incompleta } = useMemo(
    () => paraEtiquetas(linhas, categorias ?? []),
    [linhas, categorias],
  )
  const categoriaOk = !novo || (tags.length > 0 && !incompleta)

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
    setEtapa(1)
    setFile(null); setError("")
    setNames(null); setReading("")
    setName(""); setLinhas([LINHA_VAZIA])
    setVersionName(""); setVersionNotes(""); setAttachments([])
    setQuerLinks(null); setVinculos([]); setEstadoDosLinks({ varrido: false, pendentes: 0 })
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

  // Gabarito conhecido: os nomes saem sozinhos assim que o arquivo entra. No
  // documento novo quem lê é a etapa de marcação, na hora do envio.
  useEffect(() => {
    if (novo || !localUrl || !template?.levels?.length) { setNames(null); return }
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
      novo ? { name: name.trim() || file.name.replace(/.pdf$/i, ""), tags } : undefined,
      { name: versionName.trim(), notes: versionNotes.trim(), attachments })
    onClose()
  }

  // Documento novo: o que está marcado na tela é o gabarito, e os nomes são os
  // da prévia, que é obrigatória. Quem sobe viu antes o nome de cada folha.
  //
  // Daqui não se envia: com os nomes lidos, o caminho segue para a terceira
  // etapa, onde os hiperlinks do desenho são propostos e confirmados. Enviar
  // antes disso deixaria a pasta no ar sem os vínculos que ela pede.
  function seguirParaLinks(ctx: NamingEditorContext) {
    if (!file || !ctx.preview) return
    setNames(new Map(ctx.preview.filter(n => n.name).map(n => [n.pageIndex, n.name] as [number, string])))
    setPaginasDoArquivo(ctx.preview.length)
    // Guardado na categoria, para o próximo envio do mesmo relatório já vir
    // marcado. É conveniência do próximo envio, não condição deste.
    const alvo = tags[0]?.categoryId
    if (alvo) updateCategory.mutate({ id: alvo, naming: ctx.template })
    setEtapa(3)
  }

  /** O envio de documento novo, com os nomes lidos e os vínculos confirmados. */
  function enviarNomeado() {
    if (!file || !names) return
    onStart(file, names,
      { name: name.trim() || file.name.replace(/.pdf$/i, ""), tags },
      { name: "", notes: "", attachments: [] },
      querLinks ? vinculos : [])
    onClose()
  }

  const busy = false
  // Dizendo não aos vínculos, sobe direto. Dizendo sim, sobe com a varredura
  // feita e nenhuma sugestão pendente.
  const faltaDecidir = querLinks === true && estadoDosLinks.varrido ? estadoDosLinks.pendentes : 0
  const podeEnviar = querLinks === false
    || (querLinks === true && estadoDosLinks.varrido && estadoDosLinks.pendentes === 0)
  const nomeacaoOk = !!template?.levels?.length && !reading
  const podeAvancar = !!file && !!name.trim() && categoriaOk

  const zonaDoArquivo = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={e => choose(e.target.files?.[0] ?? null)}
      />
      {/* O arquivo entra pela mesma área de soltar do resto do sistema
          (Workforce, Building Schedule): borda tracejada, arrastar ou clicar. O
          nome quebra linha: nome de arquivo não tem espaço para a quebra natural
          ("DADOS_ADICIONAIS_..."). */}
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-disabled={busy}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={e => {
          if (busy || (e.key !== "Enter" && e.key !== " ")) return
          e.preventDefault()
          inputRef.current?.click()
        }}
        onDragOver={e => { e.preventDefault(); if (!busy) setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={e => {
          e.preventDefault()
          setArrastando(false)
          if (busy) return
          const f = e.dataTransfer.files?.[0]
          if (!f) return
          if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) {
            setError("Only PDF files.")
            return
          }
          choose(f)
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center outline-none transition-all focus-visible:ring-3 focus-visible:ring-ring/50 ${
          arrastando
            ? "scale-[1.01] border-primary bg-primary/10"
            : file
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
        }`}
      >
        {file ? (
          <>
            <FileText className="h-8 w-8 text-primary" />
            <span className="max-w-full break-all text-sm font-medium text-primary">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(1)} MB · click or drop to replace
            </span>
          </>
        ) : (
          <>
            <CloudUpload className={`h-8 w-8 transition-colors ${arrastando ? "text-primary" : "text-muted-foreground/50"}`} />
            <span className="text-sm font-medium text-muted-foreground">
              {arrastando ? "Drop to attach" : "Drag & drop or click to choose the PDF"}
            </span>
            <span className="text-xs text-muted-foreground/60">PDF files only</span>
          </>
        )}
      </div>
    </>
  )

  // Onde o nome de cada folha está impresso. Obrigatório: set sem nome sobe com
  // as folhas chamadas pelo número da página, e ninguém volta depois para nomear.
  const botaoNomeacao = (
    <Button
      variant="outline"
      className="h-auto justify-start whitespace-normal py-3 text-left"
      disabled={!localUrl || busy}
      onClick={() => setMarking(true)}
    >
      <ScanText className="h-4 w-4 shrink-0 self-start" />
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span>{template?.levels?.length ? "Naming marked" : "Mark the naming"}</span>
        <span className={`text-xs font-normal ${
          template?.levels?.length || !localUrl ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"
        }`}>
          {reading ? `Reading the sheets ${reading}`
            : names ? `${names.size} sheets named by the template`
            : template?.levels?.length ? "Tap to check or redo it"
            : "Required. Mark where the sheet name is printed"}
        </span>
      </span>
      {!!names?.size && !reading && (
        <Check className="ml-auto h-4 w-4 text-emerald-500" />
      )}
    </Button>
  )

  return (
    <>
      <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose() }}>
        {/* Na marcação o diálogo cresce até o tamanho da janela de marcar: a
            região que se desenha tem poucos milímetros no papel. */}
        <DialogContent
          className={novo && etapa >= 2
            ? "flex h-[92vh] w-[min(96vw,80rem)] max-w-none flex-col gap-4 sm:max-w-none"
            : "sm:max-w-lg"}
        >
          <DialogHeader>
            <DialogTitle>
              {novo ? "New document"
                : revisionCount ? "Replace the plan set"
                : "Upload the plan set"}
            </DialogTitle>
            {/* As duas etapas à vista desde o começo: quem abre sabe que depois
                do cadastro ainda vem a marcação dos nomes. */}
            {novo && (
              <div className="flex items-center justify-center gap-2 text-xs">
                {[{ n: 1, t: "Document" }, { n: 2, t: "Sheet naming" }, { n: 3, t: "Links" }].map(({ n, t }) => (
                  <span key={n} className="flex items-center gap-2">
                    {n > 1 && <span className="h-px w-6 bg-border" aria-hidden="true" />}
                    <span className={`flex items-center gap-1.5 ${etapa === n ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                        etapa > n ? "border-emerald-500 bg-emerald-500 text-white"
                          : etapa === n ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}>
                        {etapa > n ? <Check className="h-3 w-3" /> : n}
                      </span>
                      {t}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </DialogHeader>

          {novo && etapa === 2 ? (
            // A segunda etapa é a própria marcação, e não um resumo com um botão
            // que abre outra janela por cima.
            <NamingTemplateEditor
              url={localUrl}
              open={open}
              initial={template}
              fileName={file?.name}
              actions={ctx => (
                <>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  {/* Enquanto se marca, os botões são voltar ao cadastro e ler
                      os nomes. O envio só aparece depois da leitura, na guia em
                      que se confere o que saiu: subir sem ter visto o nome de
                      cada folha é descobrir o erro em campo. */}
                  {ctx.etapa === 1 ? (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        disabled={!!ctx.reading}
                        onClick={() => {
                          // Voltar não apaga o que foi marcado.
                          marked.current = true
                          setTemplate(ctx.template)
                          setError("")
                          setEtapa(1)
                        }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </Button>
                      <Button className="flex-1" disabled={!ctx.ready || !!ctx.reading} onClick={ctx.runPreview}>
                        <ScanText className="h-4 w-4" />
                        {ctx.reading ? `Reading ${ctx.reading}` : "Preview names"}
                      </Button>
                    </div>
                  ) : (
                    <Button className="w-full" disabled={!ctx.preview || !!ctx.reading} onClick={() => seguirParaLinks(ctx)}>
                      Next
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            />
          ) : novo && etapa === 3 ? (
            // A terceira etapa: os códigos que o desenho cita viram hiperlinks,
            // um a um, com a decisão de quem envia.
            <>
              <AutolinkStep
                jobsiteId={jobsiteId ?? ""}
                url={localUrl}
                nomes={names ?? new Map()}
                paginas={paginasDoArquivo}
                ligado={querLinks}
                onLigado={setQuerLinks}
                onChange={setVinculos}
                onEstado={setEstadoDosLinks}
              />
              <DialogFooter>
                {error && (
                  <p className="order-last max-w-[16rem] text-left text-xs text-destructive sm:order-first sm:mr-auto sm:self-center">
                    {error}
                  </p>
                )}
                {/* O envio espera a conferência: enquanto houver sugestão sem
                    decisão, subir seria deixar a automação decidir por quem
                    enviou, que é justamente o que esta etapa existe para evitar. */}
                {faltaDecidir > 0 && (
                  <p className="order-last flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 sm:order-first sm:mr-auto">
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    {faltaDecidir} link{faltaDecidir === 1 ? "" : "s"} still to confirm or reject.
                  </p>
                )}
                <Button variant="outline" onClick={() => setEtapa(2)}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button disabled={!podeEnviar} onClick={enviarNomeado}>
                  <CloudUpload className="h-4 w-4" />
                  Upload
                  {querLinks && vinculos.length > 0 && (
                    <span className="tabular-nums font-normal opacity-70">
                      · {vinculos.length} link{vinculos.length === 1 ? "" : "s"}
                    </span>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
          <>
          <div className="flex flex-col gap-3">
            {novo && etapa === 1 && (
              <>
                {zonaDoArquivo}
                {!!file && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="doc-name">Document name</Label>
                      {/* O ícone dentro do campo, como prefixo, igual aos campos
                          de categoria logo abaixo. */}
                      <IconInput
                        id="doc-name"
                        startIcon={FileText}
                        value={name}
                        placeholder="Comes from the file"
                        onChange={e => setName(e.target.value)}
                      />
                    </div>

                    {/* A categoria é da pasta e se escolhe aqui, junto com ela.
                        Cada linha tem a categoria e, quando ela pede, o andar ou
                        a unidade na mesma linha. */}
                    <div className="flex flex-col gap-1.5">
                      <CategoryPicker categorias={categorias ?? []} linhas={linhas} onChange={setLinhas} ocupadas={ocupadas} />
                    </div>
                  </>
                )}
              </>
            )}

            {!novo && (
              <>
                {zonaDoArquivo}
                {botaoNomeacao}

                {/* Trocar o set é o momento de dizer o que mudou. */}
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
                      {/* Uma linha só não cabia o motivo. Quem troca um set conta
                          o que foi achado em obra, quem pediu e o que a correção
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
                      {/* A foto do que se achou em obra, o recorte do e-mail do
                          projetista. Sem lugar para isso, a justificativa vira
                          "ver anexo no e-mail" e o anexo fica fora do Atlas. */}
                      <AttachmentPicker files={attachments} onChange={setAttachments} />
                    </div>
                  </>
                )}

                {revisionCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {/* A regra fica dita onde a decisão acontece: o que sobe
                        passa a valer e o que estava vale como histórico. */}
                    The current plan set becomes the previous one. The sheet that counts is always the last one uploaded.
                  </p>
                )}
              </>
            )}

            {error && <p className="text-center text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            {/* O aviso mora no rodapé, à esquerda dos botões: é o motivo de o
                Next estar apagado, e fica ao lado dele. Quebra linha quando não
                cabe; no celular, onde os botões se empilham, vai por cima deles. */}
            {novo && etapa === 1 && incompleta && (
              <p className="order-last flex min-w-0 max-w-[13rem] items-start gap-1.5 text-left text-xs text-amber-600 dark:text-amber-400 sm:order-first sm:mr-auto sm:self-center">
                {/* O mesmo ícone da metade da subcategoria: aponta para o campo que falta. */}
                <ListTree className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Pick the subcategory for every category that has one.</span>
              </p>
            )}
            <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
            {novo ? (
              <Button onClick={() => setEtapa(2)} disabled={!podeAvancar}>
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              // Sem gabarito marcado, ou ainda lendo os nomes, não sobe.
              <Button onClick={submit} disabled={!file || !nomeacaoOk || !categoriaOk}>
                <CloudUpload className="h-4 w-4" />
                Upload
              </Button>
            )}
          </DialogFooter>
          </>
          )}
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
            // nomeado, sem ninguém remarcar nada. Gravar o gabarito é
            // conveniência do próximo envio, não condição deste: se falhar, o
            // envio segue com o que está marcado aqui.
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
