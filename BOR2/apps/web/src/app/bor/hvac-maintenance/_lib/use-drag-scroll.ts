import { useRef } from "react"

// Abaixo disto é clique, não arraste: a mão treme um pouco ao clicar no cartão.
const DRAG_THRESHOLD = 5

/**
 * Clicar e arrastar no quadro: na horizontal rola o quadro inteiro, na vertical
 * só a coluna onde o arraste começou (o elemento com `data-lane-scroll` dentro
 * da `section` sob o cursor). Clique sem arraste segue para o cartão; depois de
 * um arraste, o clique que o navegador dispara ao soltar é engolido.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const drag = useRef<{ x: number; y: number; left: number; lane: HTMLElement | null; top: number; moved: boolean } | null>(null)
  const swallowClick = useRef(false)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.pointerType !== "mouse" || !ref.current) return
    const lane = (e.target as HTMLElement).closest("section")?.querySelector<HTMLElement>("[data-lane-scroll]") ?? null
    drag.current = { x: e.clientX, y: e.clientY, left: ref.current.scrollLeft, lane, top: lane?.scrollTop ?? 0, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !ref.current) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    d.moved = true
    ref.current.style.cursor = "grabbing"
    ref.current.scrollLeft = d.left - dx
    if (d.lane) d.lane.scrollTop = d.top - dy
  }

  const end = () => {
    if (drag.current?.moved) swallowClick.current = true
    drag.current = null
    if (ref.current) ref.current.style.cursor = ""
  }

  const onClickCapture = (e: React.MouseEvent) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  return { ref, onPointerDown, onPointerMove, onPointerUp: end, onPointerLeave: end, onClickCapture }
}
