"use client"

import { useEffect, useRef, useState } from "react"

/**
 * O botão que só age segurado.
 *
 * Para o que desfaz trabalho de alguém: um toque escapa sem querer, segurar um
 * segundo não. Uma faixa enche enquanto se segura; soltar antes esvazia e não
 * faz nada. Vale para o dedo, o mouse e o teclado (Enter ou espaço seguros).
 */
export function HoldButton({ onConfirm, className = "", faixa = "bg-current/20", duracao = 1000, title, disabled, children }: {
  onConfirm: () => void
  /** Classes do botão. */
  className?: string
  /** Cor da faixa que enche. */
  faixa?: string
  duracao?: number
  title?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  const [segurando, setSegurando] = useState(false)
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)

  const soltar = () => {
    if (relogio.current) clearTimeout(relogio.current)
    relogio.current = null
    setSegurando(false)
  }
  const segurar = () => {
    if (relogio.current || disabled) return
    setSegurando(true)
    relogio.current = setTimeout(() => {
      relogio.current = null
      setSegurando(false)
      onConfirm()
    }, duracao)
  }
  useEffect(() => soltar, [])

  return (
    <button type="button"
      title={title}
      disabled={disabled}
      onPointerDown={e => { e.preventDefault(); segurar() }}
      onPointerUp={soltar}
      onPointerLeave={soltar}
      onPointerCancel={soltar}
      onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) { e.preventDefault(); segurar() } }}
      onKeyUp={e => { if (e.key === "Enter" || e.key === " ") soltar() }}
      onContextMenu={e => e.preventDefault()}
      className={`relative touch-none select-none overflow-hidden ${className}`}
    >
      <span
        style={segurando ? { transitionDuration: `${duracao}ms` } : undefined}
        className={`absolute inset-y-0 left-0 ${faixa} ${segurando ? "w-full transition-[width] ease-linear" : "w-0"}`}
      />
      <span className="relative flex items-center justify-center gap-1.5">{children}</span>
    </button>
  )
}
