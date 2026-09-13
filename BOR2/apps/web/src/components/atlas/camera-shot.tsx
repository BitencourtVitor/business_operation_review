"use client"

import { ArrowLeft, Camera, RefreshCw, SwitchCamera, Zap, ZapOff } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

/**
 * Quantas cartas o baralho mostra.
 *
 * Cinco. Da sexta em diante ele para de crescer e a carta do fundo passa a
 * contar o que ficou atrás: o rodapé da câmera é do disparo, e uma pilha que
 * cresce sem limite acaba dividindo a faixa com ele.
 */
const TETO_BARALHO = 5

/**
 * A câmera da obra, dentro do Atlas.
 *
 * ── Por que não o app do aparelho ──
 *
 * O `input capture` entrega a câmera do sistema, e ela devolve **uma** foto por
 * vez: a cada disparo o navegador volta, o diálogo se redesenha, e quem estava
 * documentando um problema com seis ângulos faz seis idas e voltas. Aqui a
 * câmera fica aberta: dispara, a foto entra na fila ali embaixo, dispara de
 * novo. Só se sai quando a pessoa diz que acabou.
 *
 * ── O que o navegador dá, e o que não dá ──
 *
 * O fluxo de vídeo é do aparelho, então funciona sem rede, que é o caso da obra.
 * A foto sai do quadro do vídeo, e no Chrome de Android sai da câmera de verdade
 * quando o `ImageCapture` existe, que é melhor. O flash é a lanterna do aparelho,
 * a única luz que a web alcança: por isso são dois estados e não três, aceso e
 * apagado, sem o "automático" que precisaria de um medidor de luz que o
 * navegador não expõe.
 *
 * Sem permissão, sem câmera ou em navegador que não dá o fluxo, a porta do
 * sistema continua aberta: é o botão de saída, e não um beco.
 */
export function CameraShot({ fotos, onCapture, onClose, onSistema }: {
  /** A fila do formulário, para a pessoa ver o que já tirou sem sair daqui. */
  fotos: File[]
  onCapture: (foto: File) => void
  onClose: () => void
  /** A saída pelo app do aparelho, quando o navegador não entrega a câmera. */
  onSistema: () => void
}) {
  const video = useRef<HTMLVideoElement | null>(null)
  const fluxo = useRef<MediaStream | null>(null)
  const [lado, setLado] = useState<"environment" | "user">("environment")
  const [lanterna, setLanterna] = useState(false)
  const [temLanterna, setTemLanterna] = useState(false)
  const [erro, setErro] = useState("")
  const [disparando, setDisparando] = useState(false)
  const [clarao, setClarao] = useState(false)

  // O fluxo começa e morre com a tela, e recomeça ao trocar de lado. Deixar a
  // câmera ligada depois de fechar acende a luz do aparelho sem ninguém pedir.
  useEffect(() => {
    let vivo = true
    let atual: MediaStream | null = null

    navigator.mediaDevices?.getUserMedia({
      video: { facingMode: lado, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: false,
    }).then(s => {
      if (!vivo) { s.getTracks().forEach(t => t.stop()); return }
      atual = s
      fluxo.current = s
      if (video.current) video.current.srcObject = s
      const capacidades = s.getVideoTracks()[0]?.getCapabilities?.() as
        { torch?: boolean } | undefined
      setTemLanterna(!!capacidades?.torch)
      setErro("")
    }).catch((e: unknown) => {
      if (!vivo) return
      const nome = (e as { name?: string })?.name
      setErro(nome === "NotAllowedError"
        ? "The camera is blocked for this site. Allow it in the browser settings, or use the device camera."
        : "This browser did not give access to the camera.")
    })

    return () => {
      vivo = false
      atual?.getTracks().forEach(t => t.stop())
      fluxo.current = null
    }
  }, [lado])

  // A lanterna é uma restrição da trilha de vídeo, e não uma propriedade da
  // página: acender antes de o fluxo existir não faz nada.
  const acende = useCallback(async (ligada: boolean) => {
    const trilha = fluxo.current?.getVideoTracks()[0]
    if (!trilha) return
    try {
      await trilha.applyConstraints(
        { advanced: [{ torch: ligada }] } as unknown as MediaTrackConstraints,
      )
      setLanterna(ligada)
    } catch {
      setTemLanterna(false)
    }
  }, [])

  async function disparar() {
    const v = video.current
    const trilha = fluxo.current?.getVideoTracks()[0]
    if (!v || !trilha || disparando) return
    setDisparando(true)
    setClarao(true)
    setTimeout(() => setClarao(false), 120)

    try {
      let blob: Blob | null = null

      // No Chrome de Android isto puxa a foto da câmera, e não o quadro do
      // vídeo: mesma cena, muito mais pixel. Onde não existe, cai no quadro.
      const Captura = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => {
        takePhoto: () => Promise<Blob>
      } }).ImageCapture
      if (Captura) {
        try { blob = await new Captura(trilha).takePhoto() } catch { blob = null }
      }

      if (!blob) {
        const tela = document.createElement("canvas")
        tela.width = v.videoWidth
        tela.height = v.videoHeight
        tela.getContext("2d")?.drawImage(v, 0, 0)
        blob = await new Promise<Blob | null>(ok => tela.toBlob(ok, "image/jpeg", 0.92))
      }

      if (blob) {
        onCapture(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }))
      }
    } finally {
      setDisparando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black">
      {/* A faixa de cima: sair, e os dois ajustes da câmera. */}
      <div className="flex shrink-0 items-center justify-between gap-2 p-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="gap-1.5 border-white/20 bg-black/40 text-white backdrop-blur hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to the report
        </Button>

        <div className="flex items-center gap-2">
          {temLanterna && (
            <button
              type="button"
              aria-label={lanterna ? "Flash off" : "Flash on"}
              onClick={() => void acende(!lanterna)}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border backdrop-blur transition-colors ${
                lanterna
                  ? "border-amber-300/60 bg-amber-300/20 text-amber-200"
                  : "border-white/20 bg-black/40 text-white/80 hover:bg-white/10"
              }`}
            >
              {lanterna ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            aria-label="Switch camera"
            onClick={() => setLado(l => (l === "environment" ? "user" : "environment"))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-black/40 text-white/80 backdrop-blur transition-colors hover:bg-white/10"
          >
            <SwitchCamera className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* A prévia ao vivo. `playsInline` é o que impede o iPhone de abrir o
          vídeo em tela cheia própria e tomar a página. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {erro ? (
          <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
            <p className="text-sm text-white/80">{erro}</p>
            <Button variant="outline" onClick={onSistema} className="gap-1.5 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Camera className="h-4 w-4" />
              Use the device camera
            </Button>
          </div>
        ) : (
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            className={`h-full w-full object-contain ${lado === "user" ? "-scale-x-100" : ""}`}
          />
        )}

        {/* O clarão do disparo: sem ele, com a lanterna apagada, nada na tela
            diz que a foto saiu. */}
        {clarao && <div className="absolute inset-0 bg-white/70" />}
      </div>

      {/* A faixa de baixo: o que já foi tirado, e o botão de tirar. */}
      <div className="flex shrink-0 flex-col gap-3 p-4 pb-6">
        {/* Baralho, e não fila.

            Enfileiradas, seis fotos atravessavam a tela e o disparo passava a
            dividir o rodapé com elas. Empilhadas com folga, cada uma mostra uma
            tira de si e a última aparece inteira: dá para conferir o que acabou
            de sair sem que a pilha cresça sobre o resto. */}
        {fotos.length > 0 && (
          <div className="flex items-center">
            {fotos.slice(-TETO_BARALHO).map((f, i) => {
              // A carta do fundo vira a conta do que não coube. Da décima em
              // diante o baralho para de crescer, e é ela que diz que ele
              // continua atrás: sem isso, as primeiras sumiam sem aviso.
              const escondidas = fotos.length - TETO_BARALHO
              const ultima = i === 0 && escondidas > 0
              return (
                <span
                  key={`${f.name}-${i}`}
                  className="relative -ml-8 h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 ring-black first:ml-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                  {ultima && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/70 pr-6 text-xs font-semibold text-white">
                      +{escondidas}
                    </span>
                  )}
                </span>
              )
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <span className="w-28 text-xs tabular-nums text-white/60">
            {fotos.length} {fotos.length === 1 ? "photo" : "photos"}
          </span>

          {/* O disparo no meio e grande: é o único gesto que se faz com a mão
              tremendo, de luva, olhando para a parede e não para a tela. */}
          <button
            type="button"
            aria-label="Take a photo"
            disabled={!!erro || disparando}
            onClick={() => void disparar()}
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 transition-transform active:scale-95 disabled:opacity-40"
          >
            {disparando
              ? <RefreshCw className="h-6 w-6 animate-spin text-white" />
              : <span className="h-11 w-11 rounded-full bg-white" />}
          </button>

          <span className="flex w-28 justify-end">
            <Button
              size="sm"
              onClick={onClose}
              className="gap-1.5"
            >
              Done
            </Button>
          </span>
        </div>
      </div>
    </div>
  )
}
