"use client"

import { useAtlasDictation } from "@/hooks/use-atlas"
import { gravacaoDisponivel, paraWav } from "@/components/atlas/wav"
import { AudioLines, Check, Loader2, Mic, Square, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

/**
 * A descrição falada do problema.
 *
 * Em obra ninguém digita parágrafo. A pessoa está de luva, olhando para a viga
 * que está errada, e falar é o único registro que ela consegue fazer sem largar
 * o que está fazendo. Então o botão é um só: aperta, fala, aperta de novo.
 *
 * O que acontece depois é trabalho de máquina, e a tela conta cada etapa em vez
 * de girar uma roda. São três, e elas demoram coisas diferentes: subir o arquivo
 * depende da rede do canteiro, transcrever leva alguns segundos, e ler em
 * tópicos é quase instantâneo. Uma roda só, sem nome, faria a de trinta segundos
 * parecer travamento.
 *
 * **O texto é rascunho.** Ele cai no campo de descrição e fica editável ali,
 * porque quem falou é quem sabe se ficou certo. Texto de máquina que entra
 * sozinho no relatório é o defeito que ninguém mais confere.
 */

const PASSOS: Record<string, string> = {
  sending: "Sending the recording",
  transcribing: "Writing down what was said",
  reading: "Reading it into topics",
}

export function VoiceNote({ jobsiteId, onResult, disabled }: {
  jobsiteId: string
  /**
   * O que saiu da gravação. `mediaId` volta para o ponto adotar o áudio quando
   * ele for salvo: a gravação sobe antes de o ponto existir, senão a pessoa
   * ficaria esperando a transcrição depois de já ter escrito o título.
   */
  onResult: (r: { mediaId: string; transcript: string; topics: string }) => void
  disabled?: boolean
}) {
  const ditado = useAtlasDictation(jobsiteId)
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [passo, setPasso] = useState<"sending" | "transcribing" | "reading" | null>(null)
  const [erro, setErro] = useState("")
  const [pronto, setPronto] = useState(false)

  const recorder = useRef<MediaRecorder | null>(null)
  const pedacos = useRef<Blob[]>([])
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    // A trilha do microfone continua aberta se a tela fechar no meio da
    // gravação, e o ponto vermelho do navegador fica aceso para sempre.
    recorder.current?.stream.getTracks().forEach(t => t.stop())
    if (relogio.current) clearInterval(relogio.current)
  }, [])

  async function comecar() {
    setErro("")
    setPronto(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      pedacos.current = []
      rec.ondataavailable = e => { if (e.data.size) pedacos.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        void processar(new Blob(pedacos.current, { type: rec.mimeType }))
      }
      rec.start()
      recorder.current = rec
      setGravando(true)
      setSegundos(0)
      relogio.current = setInterval(() => setSegundos(s => s + 1), 1000)
    } catch {
      // Permissão negada, ou aparelho sem microfone. Os dois se resolvem fora
      // daqui, e insistir com um alerta a cada toque não ajuda ninguém.
      setErro("This device did not allow the microphone")
    }
  }

  function parar() {
    if (relogio.current) clearInterval(relogio.current)
    relogio.current = null
    setGravando(false)
    recorder.current?.stop()
    recorder.current = null
  }

  async function processar(gravado: Blob) {
    // Gravação de menos de um segundo é toque sem querer no botão. Mandar isso
    // para transcrever gasta a chamada para ouvir o nada.
    if (gravado.size < 8000) {
      setErro("Too short to transcribe")
      return
    }
    try {
      const audio = await paraWav(gravado)
      const r = await ditado.mutateAsync({
        audio,
        andamento: p => setPasso(p),
      })
      setPasso(null)
      if (!r.transcript.trim()) {
        setErro("No speech in this recording")
        return
      }
      setPronto(true)
      onResult(r)
    } catch {
      setPasso(null)
      setErro("Could not turn this recording into text")
    }
  }

  if (!gravacaoDisponivel()) return null

  const relogioTexto = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {gravando ? (
          <button
            type="button"
            onClick={parar}
            className="flex h-9 items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop
            <span className="tabular-nums opacity-70">{relogioTexto}</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || !!passo}
            onClick={comecar}
            className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            {passo
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : pronto
                ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                : <Mic className="h-3.5 w-3.5" />}
            {passo ? PASSOS[passo] : pronto ? "Record again" : "Describe it out loud"}
          </button>
        )}

        {/* A onda pulsando é o único jeito de saber que o microfone está de fato
            ouvindo. Sem ela, gravação parada e gravação andando têm a mesma
            cara, e a pessoa fala trinta segundos para o nada. */}
        {gravando && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AudioLines className="h-4 w-4 animate-pulse text-destructive" />
            Listening
          </span>
        )}
      </div>

      {erro && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Trash2 className="h-3 w-3" />
          {erro}
        </span>
      )}
    </div>
  )
}
