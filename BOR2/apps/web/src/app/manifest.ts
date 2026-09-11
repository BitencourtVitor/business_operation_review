import type { MetadataRoute } from "next"

/**
 * O manifesto que torna o Atlas instalável.
 *
 * Não é enfeite: no WebKit, o armazenamento persistente é concedido por
 * heurística, e o critério que mais pesa é o app estar instalado na tela de
 * início. PWA aberto como aba comum do Safari tem tratamento de armazenamento
 * significativamente pior e perde o offline no primeiro aperto de espaço.
 *
 * Por isso a instalação é requisito de onboarding de quem vai a campo, e não
 * sugestão: sem ela, tudo que o resto do offline constrói pode ser descartado
 * pelo sistema sem aviso.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Atlas · Premium Group",
    short_name: "Atlas",
    description: "Plantas, marcas e fotos da obra, com ou sem sinal.",
    start_url: "/atlas",
    // `standalone` faz o app abrir sem a barra do navegador, e é também o que o
    // iOS usa para tratá-lo como aplicativo em vez de aba.
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
    icons: [
      { src: "/favicon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/favicon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
