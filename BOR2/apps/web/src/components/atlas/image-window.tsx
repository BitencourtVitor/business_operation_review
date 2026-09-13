"use client"

import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * A imagem aberta por cima de tudo, numa janela própria.
 *
 * Nasceu no histórico de revisão de folha, para a foto que justifica uma troca
 * de prancha, e passou a valer também para a foto que acompanha um ponto. É a
 * mesma pergunta nos dois lugares: a miniatura mostra que existe imagem, e quem
 * quer ver de verdade precisa de tela.
 *
 * ── A moldura não muda de tamanho; o que se move é a imagem ──
 *
 * A janela abre do tamanho que sobra na tela, descontado o menu do rodapé, e
 * fica assim. Aproximar amplia a foto **dentro** dela, e arrastar passeia pelo
 * que saiu de vista. Antes era a janela que crescia junto com o zoom: com a
 * altura limitada pela tela e a largura não, a foto esticava na horizontal.
 *
 * Quem chama precisa envolvê-la num `createPortal` para o corpo da página
 * sempre que houver diálogo aberto por perto: popup de diálogo carrega
 * transformação própria, e dentro de um elemento transformado o `fixed` deixa
 * de valer a tela e passa a valer o popup. A janela nasceria presa a ele, do
 * tamanho dele, e o desfoque não alcançaria o resto.
 */
export function ImageWindow({ url, name, pecas, inicial = 0, onClose }: {
  url: string
  name: string
  /**
   * O conjunto a que esta imagem pertence, quando ela não vem sozinha.
   *
   * Um ponto de punch pode ter vinte fotos do problema e vinte da correção.
   * Abrindo uma delas sem o conjunto, a pessoa perde a conta de qual está vendo
   * e precisa fechar a janela para trocar. Com a fita no rodapé, ela vê onde
   * está e anda para o lado sem sair da tela.
   */
  pecas?: { url: string; name: string }[]
  inicial?: number
  onClose: () => void
}) {
  const fita = pecas && pecas.length > 1 ? pecas : null
  const [atual, setAtual] = useState(inicial)
  const peca = fita?.[atual]
  const urlAtual = peca?.url ?? url
  const nomeAtual = peca?.name ?? name

  // A moldura, e o tamanho da foto dentro dela em zoom 1.
  //
  // No computador as duas são iguais: a moldura nasce com a forma da foto. No
  // celular não: lá a moldura toma toda a altura que sobra e a foto entra pela
  // largura, com a altura saindo da proporção. O resto do espaço é onde o zoom
  // vai crescer, e é por isso que os dois tamanhos precisam ser separados.
  const [caixa, setCaixa] = useState({ largura: 0, altura: 0 })
  const [base, setBase] = useState({ largura: 0, altura: 0 })
  const [zoom, setZoom] = useState(1)
  const [passeio, setPasseio] = useState({ x: 0, y: 0 })

  // A fila de miniaturas, para trazer a atual de volta ao centro quando a foto
  // muda pelas setas, pelo teclado ou pelo botão.
  const fila = useRef<HTMLDivElement | null>(null)
  const dedos = useRef(new Map<number, { x: number; y: number }>())
  const pinca = useRef<{ dist: number; zoom: number } | null>(null)
  const arrasto = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  const TETO_ZOOM = 6
  const limita = (n: number) => Math.min(TETO_ZOOM, Math.max(1, n))

  /**
   * O passeio preso às bordas da foto.
   *
   * Sem isto, arrastar leva a imagem para fora da moldura e sobra fundo dentro
   * da janela: o gesto continua respondendo e não há mais nada para ver.
   */
  const prende = useCallback((p: { x: number; y: number }, z: number) => {
    const folgaX = Math.max(0, (base.largura * z - caixa.largura) / 2)
    const folgaY = Math.max(0, (base.altura * z - caixa.altura) / 2)
    return {
      x: Math.min(folgaX, Math.max(-folgaX, p.x)),
      y: Math.min(folgaY, Math.max(-folgaY, p.y)),
    }
  }, [caixa, base])

  const aproxima = useCallback((fator: number) => {
    setZoom(z => {
      const novo = limita(z * fator)
      setPasseio(p => prende(p, novo))
      return novo
    })
  }, [prende])

  /**
   * De que tamanho a foto abre.
   *
   * O que sobra da tela depois do cabeçalho da janela, do menu do rodapé e de
   * um respiro nas bordas. A conta é feita com a proporção do arquivo, então a
   * moldura nasce com a forma da foto e não há o que esticar depois.
   */
  function medir(img: HTMLImageElement) {
    // O respiro da moldura, o cabeçalho da janela, o vão e o menu: o que sobra
    // é o espaço da foto. No celular o cabeçalho tem duas linhas, e a conta
    // precisa saber disso.
    const respiro = 24
    const MENU = 62
    const VAO = 12
    const celular = window.innerWidth < 640
    const CABECA = celular ? 72 : 44
    const largura = window.innerWidth - respiro * 2
    const altura = window.innerHeight - respiro * 2 - CABECA - (fita ? MENU + VAO : 0)
    const proporcao = img.naturalWidth / img.naturalHeight

    /**
     * No celular a moldura toma tudo, e a foto entra pela largura.
     *
     * Encaixando a foto inteira, como no computador, sobrava metade da tela em
     * fundo preto de cada lado da paisagem: telefone é estreito e alto, e foto
     * de obra é larga e baixa. Aqui a foto ocupa a largura inteira e a altura
     * sai da proporção dela, que é o que a mão espera ao abrir uma foto no
     * telefone. O vão que sobra é justamente onde o zoom vai crescer.
     */
    const molde = celular
      ? { largura, altura }
      : (() => {
        const coube = Math.min(1, largura / img.naturalWidth, altura / img.naturalHeight)
        return {
          largura: Math.round(img.naturalWidth * coube),
          altura: Math.round(img.naturalHeight * coube),
        }
      })()

    const foto = celular
      ? { largura: molde.largura, altura: Math.round(molde.largura / proporcao) }
      : molde

    // Medida igual devolve o mesmo objeto e o React não redesenha. Sem isso a
    // medição pela referência do elemento entra em laço: a referência é chamada
    // a cada desenho, mede, guarda, e o guardar manda desenhar de novo.
    const igual = (a: { largura: number; altura: number }, b: typeof a) =>
      a.largura === b.largura && a.altura === b.altura
    setCaixa(antiga => (igual(antiga, molde) ? antiga : molde))
    setBase(antiga => (igual(antiga, foto) ? antiga : foto))
  }

  const vaiPara = useCallback((i: number) => {
    const alvo = Math.min((fita?.length ?? 1) - 1, Math.max(0, i))
    setAtual(anterior => (alvo === anterior ? anterior : alvo))
    // Trocar de foto recomeça do início: a próxima tem outro tamanho e outra
    // forma, e herdar zoom e passeio da anterior abre a nova em algum canto.
    setZoom(1)
    setPasseio({ x: 0, y: 0 })
    setCaixa({ largura: 0, altura: 0 })
    setBase({ largura: 0, altura: 0 })
  }, [fita])

  // A fila acompanha quem está sendo visto: avançando até a décima foto, a
  // miniatura marcada já estava fora de vista e a fila continuava mostrando as
  // primeiras, como se nada tivesse andado.
  useEffect(() => {
    const alvo = fila.current?.children[atual] as HTMLElement | undefined
    alvo?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
  }, [atual])

  // A seta do teclado anda na fita: numa janela cheia de foto, tirar a mão do
  // teclado para clicar em seta de tela é o que faz ninguém percorrer o conjunto.
  useEffect(() => {
    if (!fita) return
    const anda = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") vaiPara(atual + 1)
      if (e.key === "ArrowLeft") vaiPara(atual - 1)
    }
    window.addEventListener("keydown", anda)
    return () => window.removeEventListener("keydown", anda)
  }, [fita, atual, vaiPara])

  function down(e: React.PointerEvent) {
    try {
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    } catch {
      // ponteiro que o navegador não conhece: segue sem captura
    }
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (dedos.current.size === 2) {
      const [a, b] = [...dedos.current.values()]
      pinca.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom }
      arrasto.current = null
      return
    }
    // Um dedo só é passeio, e só faz sentido com a foto ampliada.
    if (zoom > 1) arrasto.current = { x: e.clientX, y: e.clientY, px: passeio.x, py: passeio.y }
  }

  function move(e: React.PointerEvent) {
    if (!dedos.current.has(e.pointerId)) return
    dedos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (dedos.current.size === 2 && pinca.current) {
      const [a, b] = [...dedos.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinca.current.dist > 0) {
        const novo = limita(pinca.current.zoom * (dist / pinca.current.dist))
        setZoom(novo)
        setPasseio(p => prende(p, novo))
      }
      return
    }

    if (arrasto.current) {
      const bruto = {
        x: arrasto.current.px + (e.clientX - arrasto.current.x),
        y: arrasto.current.py + (e.clientY - arrasto.current.y),
      }
      setPasseio(prende(bruto, zoom))
    }
  }

  function up(e: React.PointerEvent) {
    dedos.current.delete(e.pointerId)
    if (dedos.current.size < 2) pinca.current = null
    if (dedos.current.size === 0) arrasto.current = null
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      // Uma coluna: a foto em cima ocupando tudo o que sobra, um vão, e o menu
      // embaixo. Antes o menu era peça solta presa ao rodapé da tela e a foto
      // não sabia dele: os dois se encostavam ou sobrava faixa morta no meio.
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-neutral-950/60 p-6 backdrop-blur-md"
    >
      <div
        role="presentation"
        onClick={e => e.stopPropagation()}
        onDoubleClick={() => { setZoom(1); setPasseio({ x: 0, y: 0 }) }}
        className="inline-flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      >
        {/* O cabeçalho segue a largura da janela e não muda de altura: ele é a
            identificação, e identificação não cresce com o zoom. */}
        {/* No celular o cabeçalho vira duas linhas: em cima o nome da foto e o
            X, que é a única coisa que faz sentido do lado oposto ao título;
            embaixo a contagem e o zoom. Numa tela de trezentos e setenta o nome
            ficava com meia dúzia de letras antes das reticências. */}
        <header className="flex shrink-0 flex-col gap-1.5 border-b border-border px-4 py-2 sm:h-11 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-0">
          <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-start">
            <span className="min-w-0 truncate text-sm font-medium">{nomeAtual}</span>
            {fita && (
              <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
                {atual + 1} of {fita.length}
              </span>
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
            {fita && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground sm:hidden">
                {atual + 1} of {fita.length}
              </span>
            )}

            {/* Menos, quanto, mais: um controle só, com moldura em volta e fios
                entre as partes. Três botões soltos lado a lado não diziam que
                eram o mesmo assunto, e o número no meio parecia texto. */}
            <div className="flex items-center overflow-hidden rounded-md border border-border">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => aproxima(1 / 1.25)}
                disabled={zoom <= 1}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Back to the whole photo"
                onClick={() => { setZoom(1); setPasseio({ x: 0, y: 0 }) }}
                className="h-7 min-w-[3.25rem] border-x border-border text-xs tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {zoom.toFixed(1)}x
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => aproxima(1.25)}
                disabled={zoom >= TETO_ZOOM}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="hidden h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* A moldura da foto: tamanho fixo, o que passa dela fica escondido. A
            imagem cresce por dentro e se arrasta por dentro. */}
        <div
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onWheel={e => aproxima(e.deltaY < 0 ? 1.12 : 1 / 1.12)}
          style={caixa.largura ? { width: caixa.largura, height: caixa.altura } : undefined}
          // A foto centrada dentro da moldura, e não encostada na quina: o
          // passeio é medido a partir do meio, e com ela na quina metade do que
          // o zoom revelou ficava fora de alcance para sempre.
          className={`relative flex touch-none items-center justify-center overflow-hidden bg-neutral-950 ${
            zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={urlAtual}
            src={urlAtual}
            alt={nomeAtual}
            draggable={false}
            // Foto que já está no cache dispara o `load` antes de o React
            // pendurar o `onLoad`, e a moldura ficava sem medida: a janela abria
            // no tamanho de emergência e encolhia à toa ao trocar de foto.
            ref={el => { if (el?.complete && el.naturalWidth) medir(el) }}
            onLoad={e => medir(e.currentTarget)}
            style={base.largura
              ? {
                width: base.largura * zoom,
                height: base.altura * zoom,
                transform: `translate(${passeio.x}px, ${passeio.y}px)`,
              }
              : { maxWidth: "80vw", maxHeight: "60vh" }}
            className="block max-w-none select-none"
          />
        </div>
      </div>

      {/* O controle da fita é peça à parte, presa ao rodapé da tela.

          Dentro da imagem ele tapava justamente o pé da foto, e mudava de lugar
          a cada foto de proporção diferente. No rodapé da tela ele fica sempre
          no mesmo lugar, a imagem fica no meio, e uma coisa não disputa a outra.

          **Metade da tela, no máximo.** Com vinte fotos a fila atravessava a
          tela inteira e virava o assunto da janela; presa à metade, ela rola por
          dentro e a foto continua sendo o assunto. As setas ficam nas pontas
          porque a fila rola, e o alvo de "próxima" não pode fugir junto. */}
      {fita && (
        // Três peças, e não uma: anterior, a fila, e próxima. As setas soltas
        // dentro da fila sumiam no meio das miniaturas; como blocos próprios,
        // com moldura e fundo, elas se leem como botão e ficam sempre no mesmo
        // lugar, do jeito que a virada de página do leitor de prancha já faz.
        <div
          role="presentation"
          onClick={e => e.stopPropagation()}
          className="flex w-fit max-w-full shrink-0 items-stretch gap-2"
        >
          <button
            type="button"
            aria-label="Previous"
            disabled={atual === 0}
            onClick={() => vaiPara(atual - 1)}
            className="flex w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-neutral-900/80 text-white/70 shadow-xl backdrop-blur transition-colors hover:bg-neutral-800/90 hover:text-white disabled:opacity-30 disabled:hover:bg-neutral-900/80"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Metade da tela, no máximo: com vinte fotos a fila atravessava a
              tela inteira e virava o assunto da janela. */}
          <div
            ref={fila}
            // A barra de rolagem fica escondida pelo mecanismo que a casa já
            // tem: ela aparece e some sozinha conforme o ponteiro, e o menu
            // inteiro pulava de altura junto.
            data-hide-scrollbar
            // A barra de rolagem fica escondida: ela some e volta sozinha
            // conforme o ponteiro, e o menu inteiro pulava de altura junto.
            className="flex min-w-0 max-w-[min(50vw,calc(100vw-9rem))] items-center gap-1.5 overflow-x-auto overscroll-contain rounded-xl border border-white/10 bg-neutral-900/80 p-1.5 shadow-xl backdrop-blur"
          >
            {fita.map((f, i) => (
              <button
                key={f.url + i}
                type="button"
                title={f.name}
                onClick={() => vaiPara(i)}
                className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                  i === atual
                    ? "border-primary"
                    : "border-transparent opacity-50 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.name} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-label="Next"
            disabled={atual === fita.length - 1}
            onClick={() => vaiPara(atual + 1)}
            className="flex w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-neutral-900/80 text-white/70 shadow-xl backdrop-blur transition-colors hover:bg-neutral-800/90 hover:text-white disabled:opacity-30 disabled:hover:bg-neutral-900/80"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  )
}
