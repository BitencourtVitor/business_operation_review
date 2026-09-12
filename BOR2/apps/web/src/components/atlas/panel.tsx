"use client"

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
export function Panel({ title, action, children }: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card/20">
      {/* Cabeçalho com fio embaixo: o corpo rola por dentro, e sem a linha o
          conteúdo passava por baixo do título como se fosse a mesma faixa.
          Título e ações na mesma linha, sempre: com quebra de linha, no celular
          as ações desciam e o cabeçalho virava dois andares. O título não
          encolhe; quem cede espaço são as ações, que cortam o texto. */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 pb-2.5 pt-3">
        <h2 className="min-w-0 shrink-0 truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {action}
      </header>
      {/* A lista rola dentro do painel, e não a página inteira: o cabeçalho da
          seção e o rodapé do aparelho ficam no lugar, e a obra com trinta
          documentos não empurra tudo para fora da tela. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">{children}</div>
    </section>
  )
}
