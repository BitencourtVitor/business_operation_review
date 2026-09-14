"use client"

import { CameraShot } from "@/components/atlas/camera-shot"
import { PhotoGrid } from "@/components/atlas/photo-grid"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useUpdateAtlasEvent, useUploadAtlasMedia } from "@/hooks/use-atlas"
import { AlignLeft, CheckCircle2, Wrench } from "lucide-react"
import { useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * Registrar a solução de um ponto.
 *
 * É o espelho do "Report an issue" da prancha: o que foi feito numa linha, o
 * parágrafo que conta como, e as fotos tiradas na hora. O problema entra por
 * um formulário; a solução entra pelo mesmo tipo de formulário, e não por um
 * botão de câmera solto na metade vazia do ponto, que não dizia o que se
 * esperava de quem tocava nele.
 *
 * O texto vai para o ponto, ao lado do problema, e as fotos sobem como prova.
 * A foto continua obrigatória: solução sem prova é a que o relatório não
 * consegue mostrar.
 */
export function SolutionDialog({ jobsiteId, eventId, jaResolvido, open, onClose }: {
  jobsiteId: string
  eventId: string
  jaResolvido: boolean
  open: boolean
  onClose: () => void
}) {
  const upload = useUploadAtlasMedia(jobsiteId)
  const condicao = useUpdateAtlasEvent(jobsiteId)
  const [titulo, setTitulo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [fotos, setFotos] = useState<File[]>([])
  const [camera, setCamera] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")
  const sistemaRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  function fechar() {
    if (salvando) return
    setTitulo(""); setDescricao(""); setFotos([]); setErro("")
    onClose()
  }

  async function salvar() {
    if (!titulo.trim() || !fotos.length || salvando) return
    setSalvando(true)
    setErro("")
    try {
      // As fotos antes do texto: marcar resolvido exige a prova do depois já
      // gravada (migração 000156), e o texto vai no mesmo PATCH do status.
      for (const file of fotos) {
        await upload.mutateAsync({ file, eventId, phase: "after" })
      }
      await condicao.mutateAsync({
        eventId,
        patch: {
          solutionTitle: titulo.trim(),
          solutionBody: descricao.trim(),
          ...(jaResolvido ? {} : { status: "resolved" }),
        },
      })
      setTitulo(""); setDescricao(""); setFotos([])
      onClose()
    } catch {
      setErro("Something did not save. Check your connection and try again.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={o => { if (!o) fechar() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              Problem solved
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`sol-titulo-${eventId}`}>What was done?</Label>
            <div className="relative">
              <Wrench className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={`sol-titulo-${eventId}`}
                autoFocus
                value={titulo}
                placeholder="A short title for the solution"
                onChange={e => setTitulo(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`sol-desc-${eventId}`}>Description</Label>
            <div className="relative">
              <AlignLeft className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <textarea
                id={`sol-desc-${eventId}`}
                rows={3}
                value={descricao}
                placeholder="Details"
                onChange={e => setDescricao(e.target.value)}
                className="w-full resize-y rounded-md border border-input bg-transparent py-2 pl-8 pr-3 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          </div>

          <PhotoGrid
            fotos={fotos}
            onAdd={() => setCamera(true)}
            onAddVideo={() => videoRef.current?.click()}
            onRemove={i => setFotos(list => list.filter((_, k) => k !== i))}
          />
          <input
            ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden"
            onChange={e => {
              const escolhidos = Array.from(e.target.files ?? [])
              e.target.value = ""
              if (escolhidos.length) setFotos(list => [...list, ...escolhidos])
            }}
          />
          <input
            ref={sistemaRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => {
              const escolhidas = Array.from(e.target.files ?? [])
              e.target.value = ""
              if (escolhidas.length) setFotos(list => [...list, ...escolhidas])
            }}
          />

          {erro && <p className="text-xs text-destructive">{erro}</p>}

          <DialogFooter>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-600/90"
              onClick={() => void salvar()}
              disabled={!titulo.trim() || !fotos.length || salvando}
              title={!fotos.length ? "Take at least one photo or video of what was done" : undefined}
            >
              <CheckCircle2 className="h-4 w-4" />
              {salvando ? "Saving…" : fotos.length ? "Save solution" : "Add a photo or video to save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {camera && createPortal(
        <CameraShot
          fotos={fotos.filter(f => !f.type.startsWith("video/"))}
          onCapture={f => setFotos(list => [...list, f])}
          onClose={() => setCamera(false)}
          onSistema={() => { setCamera(false); sistemaRef.current?.click() }}
        />,
        document.body,
      )}
    </>
  )
}
