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
export function Panel({ title, subtitulo, action, onBack, backLabel = "Back", stackActions = false, fixo, fixoSoNoCelular = false, children }: {
  title: string
  /**
   * O que vem logo abaixo do título, dentro do mesmo bloco.
   *
   * Existe para identificação que não cabe no título sem virar uma frase só
   * (a subcategoria de um escopo do punch e as categorias que a compõem, por
   * exemplo). Cresce o cabeçalho quando precisa: título é o que nunca corta,
   * e o que vem abaixo dele pode.
   */
  subtitulo?: React.ReactNode
  action?: React.ReactNode
  /**
   * O que fica parado entre o cabeçalho e a lista, fora da rolagem.
   *
   * Filtro é comando da lista: rolando junto com os itens, ele sumia justo
   * quando a pessoa queria trocar de condição no meio de trinta pontos.
   */
  fixo?: React.ReactNode
  /** A faixa fixa só existe no celular: do tablet para cima o que ela guarda sobe para o cabeçalho. */
  fixoSoNoCelular?: boolean
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
        {/* items-center por padrão: sem subtítulo o bloco é uma linha só, e o
            voltar (mais alto que o texto) centraliza com ela como sempre foi.
            items-start só entra quando o subtítulo de fato empilha embaixo do
            título, porque aí o voltar precisa ficar no topo do bloco, e não
            no meio dele. */}
        <div className={`flex min-w-0 gap-2 ${
          subtitulo ? (stackActions ? "items-center lg:items-start" : "items-start") : "items-center"
        }`}>
          {onBack && <Voltar onBack={onBack} rotulo={backLabel} className={stackActions ? "hidden lg:flex" : "flex"} />}
          {/* Título e subtítulo são um bloco só, e não embaixo da fileira
              inteira (que inclui o botão de voltar): uma faixa geral de
              segunda linha ficaria desalinhada com o nome do escopo,
              começando lá na altura do "Scopes" em vez de embaixo do "1st
              Floor".
              A regra é sobre espaço sobrando, não sobre tamanho de tela: o
              título mora sozinho na própria fileira sempre que as ações
              ainda não subiram para o lado dele, e é exatamente aí que sobra
              largura para jogar o subtítulo para a ponta oposta. Isso
              acontece abaixo do mesmo "lg" em que `stackActions` junta as
              duas fileiras (por isso o corte usa a mesma marca); sem
              `stackActions`, as ações já dividem a fileira com o título
              desde sempre, e não há sobra nenhuma para explorar. */}
          <div className={`flex min-w-0 flex-1 items-center justify-between gap-2 ${
            stackActions ? "lg:flex-col lg:items-start lg:justify-normal lg:gap-1" : "flex-col items-start justify-normal gap-1"
          }`}>
            <h2 className={`min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground ${
              stackActions ? "lg:flex-none" : "flex-none"
            }`}>
              {title}
            </h2>
            {subtitulo}
          </div>
        </div>
        {stackActions
          ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {/* extenso: nesta fileira o nome cabe folgado, mesmo no celular,
                  agora que ela perdeu o Sign off. Cortar para só a seta aqui
                  seria economizar espaço que já não falta mais. */}
              {onBack && <Voltar onBack={onBack} rotulo={backLabel} extenso className="flex lg:hidden" />}
              {action}
            </div>
          )
          : action}
      </header>
      {/* A lista rola dentro do painel, e não a página inteira: o cabeçalho da
          seção e o rodapé do aparelho ficam no lugar, e a obra com trinta
          documentos não empurra tudo para fora da tela. */}
      {fixo && (
        <div className={`shrink-0 border-b border-border/60 px-4 py-3 ${fixoSoNoCelular ? "sm:hidden" : ""}`}>{fixo}</div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">{children}</div>
    </section>
  )
}

/**
 * O vazio padrão de uma listagem da sala da obra.
 *
 * Ícone, título e explicação, um embaixo do outro, centralizados dentro de uma
 * moldura tracejada. É a mesma forma em toda parte que uma lista pode não ter
 * nada para mostrar; título e texto sozinhos, sem o ícone acima, liam como um
 * aviso de erro em vez de "ainda não há nada aqui".
 */
export function EmptyState({ icon: Icone, title, description, fill = false, className = "" }: {
  icon: React.ElementType
  title: string
  description?: string
  /** Ocupa a altura toda de quem o envolve, centralizado nela: o vazio de uma
   *  tela inteira, e não de uma caixa perdida no topo com o resto em branco
   *  embaixo. */
  fill?: boolean
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 p-10 text-center ${fill ? "h-full min-h-56" : ""} ${className}`}>
      <Icone className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
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
