"use client"

import { useEffect } from "react"

// O formulário é papel: fundo branco, tinta preta, igual ao que o sub recebe
// impresso. O tema do aparelho de quem abre não decide isso.
//
// O provedor de tema da plataforma é ancestral desta página, e efeito de
// ancestral roda depois do efeito do filho, então tirar a classe uma vez só não
// segura, ele repõe logo em seguida. O observador é o que mantém a tela clara
// sem mexer na preferência guardada de quem abriu, que pode ser a mesma pessoa
// que usa o BOR no escuro.
export function ForceLight() {
  useEffect(() => {
    const html = document.documentElement
    // Só mexe no que está fora do lugar. `classList.remove` reescreve o
    // atributo mesmo quando a classe não está lá, e reescrever acorda este
    // mesmo observador: sem a condição, ele chama a si próprio sem parar e
    // trava a página antes do primeiro quadro.
    const light = () => {
      if (html.classList.contains("dark")) html.classList.remove("dark")
      if (html.style.colorScheme !== "light") html.style.colorScheme = "light"
    }
    light()
    const observer = new MutationObserver(light)
    observer.observe(html, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return null
}
