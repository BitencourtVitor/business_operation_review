"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

/**
 * O botão que só age segurado.
 *
 * Para o que desfaz trabalho de alguém: um toque escapa sem querer, segurar um
 * segundo não. Uma faixa enche enquanto se segura; soltar antes esvazia e não
 * faz nada. Vale para o dedo, o mouse e o teclado (Enter ou espaço seguros).
 *
 * ── O botão explica a si mesmo ──
 *
 * Ninguém adivinha que um botão pede para ser segurado. No celular a pessoa
 * tocava em Reopen e nada acontecia. Agora um balão acima do botão acompanha o
 * gesto: enquanto segura, diz o que está acontecendo com a barra enchendo; se
 * soltar antes, diz que é para segurar.
 */
export function HoldButton({
  onConfirm, className = "", faixa = "bg-current/20", duracao = 1000, title, disabled,
  acao = "confirm", andamento, children,
}: {
  onConfirm: () => void
  /** Classes do botão. */
  className?: string
  /** Cor da faixa que enche. */
  faixa?: string
  duracao?: number
  title?: string
  disabled?: boolean
  /** O verbo, no infinitivo: "reopen", "delete". */
  acao?: string
  /** O que o balão diz enquanto se segura: "Reopening", "Deleting". */
  andamento?: string
  children: React.ReactNode
}) {
  const [segurando, setSegurando] = useState(false)
  const [dica, setDica] = useState(false)
  const [lugar, setLugar] = useState<{ x: number; y: number } | null>(null)
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)
  const apagaDica = useRef<ReturnType<typeof setTimeout> | null>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const inicio = useRef(0)

  const ancorar = () => {
    const r = botao.current?.getBoundingClientRect()
    if (r) setLugar({ x: r.left + r.width / 2, y: r.top })
  }

  const soltar = () => {
    const faltava = relogio.current && Date.now() - inicio.current < duracao
    if (relogio.current) clearTimeout(relogio.current)
    relogio.current = null
    setSegurando(false)
    // Soltou antes do fim: o balão fica um instante dizendo que é para segurar.
    if (faltava) {
      setDica(true)
      if (apagaDica.current) clearTimeout(apagaDica.current)
      apagaDica.current = setTimeout(() => setDica(false), 1800)
    }
  }
  const segurar = () => {
    if (relogio.current || disabled) return
    ancorar()
    setDica(false)
    setSegurando(true)
    inicio.current = Date.now()
    relogio.current = setTimeout(() => {
      relogio.current = null
      setSegurando(false)
      onConfirm()
    }, duracao)
  }
  useEffect(() => () => {
    if (relogio.current) clearTimeout(relogio.current)
    if (apagaDica.current) clearTimeout(apagaDica.current)
  }, [])


  return (
    <>
      <button type="button"
        ref={botao}
        title={title}
        disabled={disabled}
        onPointerDown={e => { e.preventDefault(); segurar() }}
        onPointerUp={soltar}
        onPointerLeave={soltar}
        onPointerCancel={soltar}
        onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); segurar() } }}
        onKeyUp={e => { if (e.key === "Enter" || e.key === " ") soltar() }}
        onContextMenu={e => e.preventDefault()}
        style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
        className={`relative touch-none select-none overflow-hidden ${className}`}
      >
        <span
          style={segurando ? { transitionDuration: `${duracao}ms` } : undefined}
          className={`absolute inset-y-0 left-0 ${faixa} ${segurando ? "w-full transition-[width] ease-linear" : "w-0"}`}
        />
        <span className="relative flex items-center justify-center gap-1.5">{children}</span>
      </button>

      {(segurando || dica) && lugar && createPortal(
        <span
          role="status"
          style={{ left: lugar.x, top: lugar.y - 8 }}
          className="pointer-events-none fixed z-[60] flex w-max -translate-x-1/2 -translate-y-full flex-col items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-center text-xs font-medium text-background shadow-lg"
        >
          {segurando ? (
            <>
              <span>{andamento ?? "Keep holding"}{andamento ? ", keep holding" : ""}</span>
              <span className="h-1 w-28 overflow-hidden rounded-full bg-background/25">
                <span
                  style={{ animationDuration: `${duracao}ms` }}
                  className="block h-full origin-left animate-[encher_linear_forwards] rounded-full bg-background"
                />
              </span>
            </>
          ) : (
            <span>Press and hold to {acao}</span>
          )}
        </span>,
        document.body,
      )}
    </>
  )
}
