"use client"

import { ThemeToggle } from "@/components/common/theme-toggle"
import { Button } from "@/components/ui/button"
import type { Product } from "@/lib/products"
import {
  Award, CircleGauge, CodeXml, Compass, Lock, LogOut, Map, User,
} from "lucide-react"

const PRODUCT_ICON = {
  bor: CircleGauge,
  atlas: Map,
} as const

// Mesmo crachá que o header dos dois produtos mostra, com a mesma cor por papel.
const ROLE_BADGE: Record<string, { icon: typeof User; className: string }> = {
  dev:     { icon: CodeXml, className: "text-yellow-600 dark:text-yellow-400" },
  owner:   { icon: Compass, className: "text-emerald-600 dark:text-emerald-400" },
  admin:   { icon: Award,   className: "text-primary" },
  manager: { icon: Award,   className: "text-primary" },
  gestor:  { icon: Award,   className: "text-primary" },
  user:    { icon: User,    className: "text-foreground" },
  viewer:  { icon: User,    className: "text-foreground" },
}

function ProductCard({ product, onPick }: { product: Product; onPick: (p: Product) => void }) {
  const Icon = PRODUCT_ICON[product.id]
  return (
    <button
      onClick={() => product.enabled && onPick(product)}
      disabled={!product.enabled}
      className={`group flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors enabled:hover:border-primary/50 enabled:hover:bg-accent/40 disabled:cursor-not-allowed sm:gap-4 sm:p-4 ${
        // Fundo e borda continuam apagados no card travado; o que saiu do
        // esmaecido foi só o texto, que é o que precisa ser lido.
        product.enabled ? "border-border/60 bg-card" : "border-border/30 bg-card/50"
      }`}
    >
      {/* O esmaecido vive no ícone e no cadeado, nunca no texto: o card travado
          é justamente o que precisa ser lido, e opacidade em cima de letra é
          contraste perdido de graça. */}
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground transition-colors group-enabled:group-hover:border-primary/40 group-enabled:group-hover:text-primary ${
          product.enabled ? "" : "opacity-50"
        }`}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* O título quebra linha em vez de cortar. Com `truncate`, em tela de
            celular o nome do produto e o "Soon!" sumiam atrás de reticências,
            e o nome é a única coisa que o card precisa dizer. */}
        <span className="text-sm font-semibold leading-snug">
          {product.name}
          {/* O "Soon!" fica em cinza dentro do próprio título: quem não tem
              acesso lê o nome e a razão na mesma linha, sem caçar um selo. */}
          {!product.enabled && (
            <span className="font-normal text-muted-foreground"> | Soon!</span>
          )}
        </span>
        <span className="line-clamp-2 text-sm text-muted-foreground">{product.tagline}</span>
        {!product.enabled && (
          <span className="text-sm text-muted-foreground/70">
            Vitor is working hard on it…
          </span>
        )}
      </span>
      {/* Card inteiro é o alvo do clique; a seta só repetia isso. O cadeado
          fica sem texto, porque o título já diz o porquê. */}
      {!product.enabled && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
    </button>
  )
}

/**
 * A tela de escolha entre BOR e Atlas, sem saber de onde vêm os dados.
 *
 * Separada da página para poder ser desenhada sem login, e conferida em tamanho
 * de celular. A página continua sendo quem busca usuário e produtos.
 */
export function SelectView({ userName, userRole, products, available, onPick, onLogout }: {
  userName?: string
  userRole?: string
  products: Product[]
  available: Product[]
  onPick: (p: Product) => void
  onLogout: () => void
}) {
  const role = ROLE_BADGE[userRole ?? "viewer"] ?? ROLE_BADGE.viewer
  const RoleIcon = role.icon

  return (
    // `min-h-dvh` e não `min-h-screen`. No celular, `100vh` inclui a barra de
    // endereço do navegador: a tela ficava sempre um pouco maior que a área
    // visível, e sobrava rolagem vertical sem nada embaixo. `dvh` acompanha a
    // área que de fato aparece.
    //
    // O respiro também é menor no celular: em tela baixa, `py-12` e `gap-10`
    // sozinhos já empurravam o segundo card para fora. O `pt-16` garante que o
    // logo nunca passe por baixo dos botões de tema e sair.
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-6 px-4 pb-8 pt-16 sm:gap-10 sm:py-12">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={onLogout} className="text-muted-foreground">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-col items-center gap-4 sm:gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo_black.png" alt="Premium Group" className="h-7 object-contain dark:hidden sm:h-8" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo_white.png" alt="Premium Group" className="hidden h-7 object-contain dark:block sm:h-8" />
        <div className="flex flex-col items-center gap-1 text-center">
          {/* Uma linha de texto só, com o ícone dentro dela: envolver o nome num
              flex empurrava o "!" para longe da palavra e pintava o nome com a
              cor do papel. A cor é do crachá, não de quem o usa. */}
          <h1 className="text-lg font-semibold sm:text-xl">
            Welcome,{" "}
            <RoleIcon className={`inline-block h-5 w-5 align-[-0.15em] ${role.className}`} />{" "}
            {userName?.split(" ")[0] ?? "there"}!
          </h1>
          <p className="text-sm text-muted-foreground">Where are we working today?</p>
        </div>
      </div>

      <div className="flex w-full max-w-xl flex-col gap-3">
        {products.map(product => (
          <ProductCard key={product.id} product={product} onPick={onPick} />
        ))}
      </div>

      {available.length === 0 && (
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Your account has no product access yet. Ask an administrator to grant permissions
          in Settings.
        </p>
      )}
    </main>
  )
}
