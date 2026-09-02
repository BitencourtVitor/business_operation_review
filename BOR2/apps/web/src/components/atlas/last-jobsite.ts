// A obra aberta vive na rota (`/atlas/<id>`), o que é bom: o endereço leva de
// volta ao lugar exato. Mas Settings, Users e Definitions são do produto, não da
// obra — ao entrar neles a rota perde o id e a barra ficava sem contexto, como
// se ninguém estivesse trabalhando em obra nenhuma.
//
// Daí este registro: a última obra aberta fica guardada no navegador, e a barra
// continua mostrando de onde a pessoa veio enquanto ela mexe na configuração.
// Só o botão de limpar apaga — sair para configurar não é largar a obra.

// Quem escreve o registro é a barra lateral, mas quem o limpa é o botão dentro
// dela: dois componentes olhando o mesmo valor. Sem aviso, limpar estando já em
// /atlas não mudava rota nenhuma, e a barra seguia mostrando a obra que a
// pessoa acabou de largar.
const CLEARED = "atlas:last-jobsite:cleared"

const KEY = "atlas:last-jobsite"

export function readLastJobsite(): string {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(KEY) ?? ""
  } catch {
    // Navegador com armazenamento bloqueado: sem memória, a barra apenas volta
    // a depender da rota. Não é motivo para quebrar a tela.
    return ""
  }
}

export function writeLastJobsite(id: string) {
  try {
    window.localStorage.setItem(KEY, id)
  } catch {}
}

export function clearLastJobsite() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {}
  window.dispatchEvent(new Event(CLEARED))
}

export function onLastJobsiteCleared(fn: () => void) {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(CLEARED, fn)
  return () => window.removeEventListener(CLEARED, fn)
}
