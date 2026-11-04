// O Service Worker do Atlas saiu com o Atlas (virou o BuilderLog). Quem ainda
// tem o antigo instalado recebe este: ele apaga o que o outro guardou e se
// desinstala, para o BOR nunca abrir uma página antiga do cache.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const nome of await caches.keys()) await caches.delete(nome)
    await self.registration.unregister()
    for (const cliente of await self.clients.matchAll({ type: "window" })) cliente.navigate(cliente.url)
  })())
})
