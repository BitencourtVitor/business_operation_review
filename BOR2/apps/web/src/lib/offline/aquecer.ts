/**
 * Pede ao Service Worker que guarde páginas antes de a rede faltar.
 *
 * Sem isto, só fica guardada a página que foi aberta por navegação completa. Quem
 * entra na obra clicando na lista navega pelo roteador do Next, que não baixa o
 * HTML da página, e sem sinal a obra não abria: o worker não tinha o que servir.
 *
 * O worker baixa o HTML de cada rota e os arquivos de código que ele cita. Roda
 * em segundo plano e só com rede; falhar aqui não é erro, é adiantamento.
 *
 * O pedido vai ao worker ativo do registro, e não ao `controller` da página. Na
 * primeira abertura depois de uma atualização a página ainda não é controlada
 * pelo worker novo, o `controller` é nulo, e o pedido se perdia sem aviso.
 */
export function aquecerRotas(rotas: string[]) {
  if (typeof navigator === "undefined" || !navigator.onLine || !("serviceWorker" in navigator)) return
  if (!rotas.length) return
  void navigator.serviceWorker.ready
    .then(reg => reg.active?.postMessage({ tipo: "aquecer", rotas }))
    .catch(() => undefined)
}

/** Se a página já está guardada no aparelho. Nulo quando não há como saber. */
export async function paginaGuardada(rota: string): Promise<boolean | null> {
  if (typeof caches === "undefined" || !navigator.serviceWorker?.controller) return null
  try {
    return !!(await caches.match(rota))
  } catch {
    return null
  }
}
