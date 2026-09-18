// Publica os arquivos de apoio do pdf.js em public/pdfjs/.
//
// O pdf.js 6 decodifica JBIG2 e JPEG 2000 por WebAssembly, e lê fonte padrão e
// cmap de fora do pacote principal. Sem esses arquivos servidos, prancha
// escaneada nunca desenha: a imagem falha ao decodificar e a folha fica
// esperando para sempre (ATL-112).
//
// Copiar no build, e não versionar: é binário de dependência, e sai do próprio
// node_modules na versão que estiver instalada.
import { cp, mkdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..")
const origem = join(raiz, "node_modules", "pdfjs-dist")
const destino = join(raiz, "public", "pdfjs")

await rm(destino, { recursive: true, force: true })
await mkdir(destino, { recursive: true })

for (const pasta of ["wasm", "standard_fonts", "cmaps"]) {
  await cp(join(origem, pasta), join(destino, pasta), { recursive: true })
  console.log(`pdfjs: ${pasta} publicado em public/pdfjs/${pasta}`)
}
