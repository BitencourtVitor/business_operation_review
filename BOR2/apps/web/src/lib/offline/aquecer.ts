/**
 * Pede ao Service Worker que guarde páginas antes de a rede faltar.
 *
 * Sem isto, só fica guardada a página que foi aberta por navegação completa. Quem
 * entra na obra clicando na lista navega pelo roteador do Next, que não baixa o
 * HTML da página, e sem sinal a obra não abria: o worker não tinha o que servir.
 *
 * O worker baixa o HTML de cada rota e os arquivos de código que ele cita. Roda
 * em segundo plano e só com rede; falhar aqui não é erro, é adiantamento.
 */
export function aquecerRotas(rotas: string[]) {
  if (typeof navigator === "undefined" || !navigator.onLine) return
  navigator.serviceWorker?.controller?.postMessage({ tipo: "aquecer", rotas })
}
