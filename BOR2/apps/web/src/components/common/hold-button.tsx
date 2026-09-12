"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Um botão que só age depois de segurado.
 *
 * Existe onde o toque cria ou destrói muita coisa de uma vez: aceitar duzentas
 * sugestões, apagar o que está guardado no aparelho. O tempo não é cerimônia, é
 * a diferença entre decidir e esbarrar, e o preenchimento correndo mostra que
 * ainda dá para soltar.
 */
export function HoldButton({
  duracao = 1500,
  disabled,
  children,
  className = "",
  tone = "default",
  onConfirmar,
  "aria-label": ariaLabel,
}: {
  /** Quanto tempo o dedo fica no botão, em milissegundos. */
  duracao?: number
  disabled?: boolean
  children: React.ReactNode
  className?: string
  /** `danger` pinta o preenchimento de vermelho, para o que não se desfaz. */
  tone?: "default" | "danger"
  onConfirmar: () => void
  "aria-label"?: string
}) {
  const [progresso, setProgresso] = useState(0)
  const [segurando, setSegurando] = useState(false)
  const quadro = useRef<number | null>(null)
  const inicio = useRef(0)

  const parar = () => {
    if (quadro.current !== null) cancelAnimationFrame(quadro.current)
    quadro.current = null
    setSegurando(false)
    setProgresso(0)
  }

  const comecar = () => {
    if (disabled || quadro.current !== null) return
    setSegurando(true)
    inicio.current = performance.now()
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio.current) / duracao)
      setProgresso(p)
      if (p >= 1) {
        quadro.current = null
        setSegurando(false)
        setProgresso(0)
        onConfirmar()
        return
      }
      quadro.current = requestAnimationFrame(passo)
    }
    quadro.current = requestAnimationFrame(passo)
  }

  useEffect(() => () => {
    if (quadro.current !== null) cancelAnimationFrame(quadro.current)
  }, [])

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onPointerDown={comecar}
      onPointerUp={parar}
      onPointerLeave={parar}
      onPointerCancel={parar}
      onKeyDown={e => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); comecar() }
      }}
      onKeyUp={e => { if (e.key === "Enter" || e.key === " ") parar() }}
      // Segurar no celular abre o menu de contexto e seleciona o texto; os dois
      // interromperiam o gesto no meio.
      onContextMenu={e => e.preventDefault()}
      className={`relative flex touch-none select-none items-center justify-center gap-1.5 overflow-hidden rounded-lg border text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
        tone === "danger"
          ? "border-destructive/40 text-destructive hover:bg-destructive/5"
          : "border-border bg-background hover:bg-muted"
      } ${className}`}
    >
      {/* O preenchimento acompanha o tempo quadro a quadro; ao soltar, volta a
          zero com uma transição curta, para a desistência ser vista. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 ${
          tone === "danger" ? "bg-destructive/20" : "bg-primary/20"
        } ${segurando ? "" : "transition-[width] duration-300"}`}
        style={{ width: `${progresso * 100}%` }}
      />
      <span className="relative flex items-center gap-1.5">{children}</span>
    </button>
  )
}
