import type { MetadataRoute } from "next"

/**
 * O manifesto que torna a plataforma instalável na tela de início.
 *
 * Nome e ícone são da empresa: quem salva no iPad, no iPhone ou no Android
 * está salvando a Premium Group, e o atalho abre direto no BOR.
 *
 * Os ícones saem do mesmo logo do favicon, com fundo branco chapado. O original
 * tem os cantos transparentes, e o iOS pinta transparência de preto na tela de
 * início. O maskable tem o logo menor porque o Android recorta em círculo e só
 * garante os 80% do centro.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Premium Group",
    short_name: "Premium Group",
    description: "Premium Group Business Operations Review",
    start_url: "/bor",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
