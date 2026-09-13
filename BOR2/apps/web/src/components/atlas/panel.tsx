"use client"

import { ChevronLeft } from "lucide-react"
import Link from "next/link"

/**
 * O contêiner de listagem da sala da obra.
 *
 * Uma moldura com cabeçalho próprio e o conteúdo rolando por dentro. É o que dá
 * à sala a leitura de seções: as partes dela são coisas de natureza diferente,
 * uma se lê e a outra se percorre, e numa moldura só a segunda parecia
 * continuação da primeira.
 *
 * Mora aqui, e não na página da obra, porque toda listagem da sala usa a mesma:
 * documentos, verificação, e o que vier depois. Uma cópia por tela divergiria na
 * primeira mudança de espaçamento.
 *
 * **O que vai dentro é livre, e é grade.** O corpo não impõe forma: quem usa
 * monta a grade que o conteúdo pede, e ela é que se adapta entre o computador e
 * o celular. O contêiner cuida da moldura, do cabeçalho e da rolagem.
 */
export function Panel({ title, action, onBack, backLabel = "Back", stackActions = false, children }: {
  title: string
  action?: React.ReactNode
  /**
   * O cabeçalho em duas linhas até o computador: título em cima, ações embaixo.
   *
   * Vale para quem carrega uma fileira de controles no cabeçalho. Numa tela de
   * mil e quatrocentos tudo cabe na mesma linha; no tablet e no celular o título
   * e os botões passam a se espremer, e espremer significa cortar o nome do que
   * se está vendo. Duas faixas resolvem sem tirar nada da tela.
   */
  stackActions?: boolean
  /**
   * Voltar para a listagem de onde se entrou.
   *
   * Mora no cabeçalho, colado ao título, porque navegação não é conteúdo: solto
   * na primeira linha do corpo ele disputava a leitura com a metadata do que se
   * está vendo, e quem procura o caminho de volta procura no canto de cima.
   */
  onBack?: () => void
  backLabel?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/20">
      {/* Cabeçalho com fio embaixo: o corpo rola por dentro, e sem a linha o
          conteúdo passava por baixo do título como se fosse a mesma faixa.
          Título e ações na mesma linha, sempre: com quebra de linha, no celular
          as ações desciam e o cabeçalho virava dois andares. O título não
          encolhe; quem cede espaço são as ações, que cortam o texto. */}
      <header
        className={`flex shrink-0 border-b border-border/60 px-4 pb-2.5 pt-3 ${
          stackActions
            ? "flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-3"
            : "items-center justify-between gap-3"
        }`}
      >
        {/* Com o cabeçalho em duas faixas, o voltar desce junto com o resto dos
            controles: ele é comando como os outros, e a faixa de cima fica só
            com o nome de onde a pessoa está. Na tela larga volta para o lugar
            dele, antes do título. */}
        <div className="flex min-w-0 items-center gap-2">
          {onBack && <Voltar onBack={onBack} rotulo={backLabel} className={stackActions ? "hidden lg:flex" : "flex"} />}
          <h2 className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </h2>
        </div>
        {stackActions
          ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {onBack && <Voltar onBack={onBack} rotulo={backLabel} className="flex lg:hidden" />}
              {action}
            </div>
          )
          : action}
      </header>
      {/* A lista rola dentro do painel, e não a página inteira: o cabeçalho da
          seção e o rodapé do aparelho ficam no lugar, e a obra com trinta
          documentos não empurra tudo para fora da tela. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">{children}</div>
    </section>
  )
}

/**
 * O caminho de volta, e ele é o mesmo em toda a sala da obra.
 *
 * Seta, moldura e o nome de **para onde** se volta, porque "voltar" sozinho não
 * diz o que vem depois do toque. No celular sobra só a seta: o rótulo ali
 * roubava a largura do nome do lugar onde a pessoa está. Tem 32 de altura, a
 * medida de tudo que mora na faixa do cabeçalho, senão ele desalinha da fileira.
 *
 * Vale como botão, quando a volta é troca de estado dentro da mesma tela, e
 * como link, quando ela é outra página: o desenho é o mesmo, a natureza não.
 */
export function Voltar({ onBack, href, rotulo, extenso, className = "flex" }: {
  onBack?: () => void
  href?: string
  rotulo: string
  /** O nome do destino aparece em qualquer largura, e não só de `sm` para cima. */
  extenso?: boolean
  className?: string
}) {
  const traje = `-ml-1.5 h-8 shrink-0 items-center gap-1 rounded-md border border-border/60 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${className}`
  const dentro = (
    <>
      <ChevronLeft className="h-3.5 w-3.5" />
      <span className={extenso ? "" : "hidden sm:inline"}>{rotulo}</span>
    </>
  )
  if (href) {
    return <Link href={href} aria-label={rotulo} title={rotulo} className={traje}>{dentro}</Link>
  }
  return (
    <button type="button" onClick={onBack} aria-label={rotulo} className={traje}>
      {dentro}
    </button>
  )
}
