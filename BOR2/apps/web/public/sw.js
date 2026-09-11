// O Service Worker do Atlas: a casca que faz o app abrir sem rede.
//
// A aplicação é Next e não é SPA por construção, mas o offline segue o padrão de
// app shell: este worker responde à navegação com uma casca guardada em cache
// quando não há rede, e o conteúdo da rota é montado no cliente a partir do
// banco local.

const VERSAO = "atlas-v2"
const CASCA = "/atlas"

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(VERSAO)
      .then(c => c.addAll([CASCA, "/manifest.webmanifest"]))
      .catch(() => undefined)
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

self.addEventListener("fetch", event => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // A API nunca passa por aqui: quem responde por dado offline é o banco local,
  // que sabe a idade do dado.
  if (url.pathname.startsWith("/api/")) return

  // Cache primeiro só para o que tem o conteúdo no nome.
  //
  // Os arquivos de `/_next/static/` do build de produção carregam hash: nome
  // igual é conteúdo igual, então servir do cache é sempre correto. Qualquer
  // outro arquivo pode mudar de conteúdo sem mudar de nome, e cache primeiro
  // nele serve a versão velha para sempre. Foi o que aconteceu com a regra
  // anterior, que decidia pela extensão: o botão corrigido compilava e o
  // navegador seguia recebendo o antigo.
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

  // Navegação: rede primeiro, casca só quando a rede falha.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(CASCA)) ?? Response.error()),
    )
  }
  // O resto vai direto à rede, sem cache nenhum.
})
