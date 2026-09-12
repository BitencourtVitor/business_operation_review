/**
 * Registro de depuração que fica no código, desligado.
 *
 * Defeito de desenho e de layout só aparece com o gesto real, e reconstruir a
 * instrumentação toda vez que ele volta é refazer trabalho. Aqui a instrumentação
 * fica, calada: quem precisa liga no aparelho em que o defeito acontece.
 *
 *     localStorage.setItem("atlas-debug", "zoom")
 *
 * Vários assuntos separados por vírgula, ou "*" para todos.
 */
export function depurar(assunto: string, ...dados: unknown[]) {
  if (typeof window === "undefined") return
  let ligado = ""
  try {
    ligado = window.localStorage.getItem("atlas-debug") ?? ""
  } catch {
    return
  }
  if (!ligado) return
  if (ligado !== "*" && !ligado.split(",").map(s => s.trim()).includes(assunto)) return
  console.log(`[${assunto}]`, ...dados)
}
