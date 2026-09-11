// O Service Worker do Atlas: a casca que faz o app abrir sem rede.
//
// A aplicação é Next e não é SPA por construção, mas o offline segue o padrão de
// app shell: este worker guarda as páginas do Atlas e o código delas, e o
// conteúdo é montado no cliente a partir do que o aparelho guardou.

const VERSAO = "atlas-v3"
const CASCA = "/atlas"

// Imagens da casca. Ficavam de fora, e sem rede o header aparecia com a logo
// quebrada. Cada uma entra sozinha: uma que falte não impede as outras.
const FIXOS = [
  CASCA,
  "/manifest.webmanifest",
  "/favicon.png",
  "/images/logo_black.png",
  "/images/logo_white.png",
  "/images/minilogo_black.png",
  "/images/minilogo_white.png",
  "/images/sublogo_framing.png",
  "/images/sublogo_hvac.png",
  "/images/sublogo_pcg.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
]

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(VERSAO)
      .then(c => Promise.all(FIXOS.map(u => c.add(u).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

// A página guardada é o HTML da rota, sem a query: `?tab=punch` é lido no
// cliente, e guardar uma cópia por aba seria guardar a mesma página várias vezes.
function chaveDaPagina(url) {
  return url.pathname
}

function ehDoAtlas(caminho) {
  return caminho === CASCA || caminho.startsWith(CASCA + "/")
}

self.addEventListener("fetch", event => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // A API nunca passa por aqui: quem responde por dado offline é o cache das
  // consultas no aparelho, que sabe a idade do dado.
  if (url.pathname.startsWith("/api/")) return

  // Cache primeiro só para o que tem o conteúdo no nome.
  //
  // Os arquivos de `/_next/static/` do build de produção carregam hash: nome
  // igual é conteúdo igual, então servir do cache é sempre correto. Qualquer
  // outro arquivo pode mudar de conteúdo sem mudar de nome, e cache primeiro
  // nele serve a versão velha para sempre.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(hit => hit ?? fetch(req).then(res => {
        if (res.ok) {
          const copia = res.clone()
          caches.open(VERSAO).then(c => c.put(req, copia))
        }
        return res
      })),
    )
    return
  }

  // Imagem e ícone: do cache na hora, e a rede atualiza por trás. Troca de logo
  // aparece na visita seguinte, que é atraso aceitável para uma logo.
  if (req.mode !== "navigate" && url.pathname !== CASCA && FIXOS.includes(url.pathname)) {
    event.respondWith(
      caches.open(VERSAO).then(async c => {
        const hit = await c.match(url.pathname)
        const rede = fetch(req).then(res => {
          if (res.ok) c.put(url.pathname, res.clone())
          return res
        })
        if (hit) {
          rede.catch(() => undefined)
          return hit
        }
        return rede
      }),
    )
    return
  }

  // Navegação: rede primeiro, e toda página do Atlas que chega fica guardada.
  // Sem rede, a própria página se já foi guardada; senão a lista de obras.
  if (req.mode === "navigate") {
    const atlas = ehDoAtlas(url.pathname)
    event.respondWith(
      fetch(req)
        .then(res => {
          if (atlas && res.ok && !res.redirected) {
            const copia = res.clone()
            caches.open(VERSAO).then(c => c.put(chaveDaPagina(url), copia))
          }
          return res
        })
        .catch(async () =>
          (await caches.match(chaveDaPagina(url))) ?? (await caches.match(CASCA)) ?? Response.error()),
    )
  }
  // O resto vai direto à rede, sem cache nenhum. Inclui o pedido de dados de
  // rota do Next (RSC): sem rede ele falha, e o próprio Next cai para navegação
  // completa, que é atendida acima pela página guardada.
})

// Guardar antes de precisar.
//
// Quem entra na obra clicando na lista navega pelo roteador do Next, que não
// baixa o HTML da página. A tela pede, e aqui o worker baixa cada rota e os
// arquivos de código que o HTML cita.
self.addEventListener("message", event => {
  const d = event.data
  if (!d || d.tipo !== "aquecer" || !Array.isArray(d.rotas)) return
  event.waitUntil(aquecer(d.rotas))
})

async function aquecer(rotas) {
  const c = await caches.open(VERSAO)
  for (const rota of rotas) {
    if (typeof rota !== "string" || !ehDoAtlas(rota)) continue
    try {
      const res = await fetch(rota, { credentials: "same-origin" })
      if (!res.ok || res.redirected) continue
      const html = await res.clone().text()
      await c.put(rota, res)
      const codigo = new Set(html.match(/\/_next\/static\/[^"'\s\\)]+/g) ?? [])
      for (const u of codigo) {
        if (await c.match(u)) continue
        try {
          const r = await fetch(u)
          if (r.ok) await c.put(u, r)
        } catch {
          // Um arquivo que não desce não impede os outros.
        }
      }
    } catch {
      // Sem rede no meio do caminho. A próxima abertura tenta de novo.
    }
  }
}
