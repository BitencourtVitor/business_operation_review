import type { MetadataRoute } from "next"

/**
 * O manifesto que torna a plataforma instalável na tela de início.
 *
 * Nome e ícone são da empresa, e não de um produto: quem salva no iPad, no
 * iPhone ou no Android está salvando a Premium Group, e dentro dela escolhe
 * Atlas ou BOR.
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
    description: "Premium Group operational intelligence platform",
    start_url: "/atlas",
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
