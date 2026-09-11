"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { useEffect, useRef, useState } from "react"

/**
 * Ler do aparelho primeiro, revalidar em paralelo.
 *
 * Este é o **caminho único** de leitura das telas de campo, e não uma otimização
 * que liga quando a rede cai. A alternativa que parecia natural — "com rede
 * busca do servidor, sem rede usa o local" — produz dois caminhos de código, e
 * o de offline só é exercitado quando a rede cai. Ou seja: ele quebra no
 * canteiro, na frente do problema, e nunca em teste.
 *
 * Aqui os dois caminhos são o mesmo. A tela sempre lê do banco local e desenha
 * na hora; em paralelo, havendo rede, busca a versão fresca, grava no banco, e a
 * tela se atualiza sozinha porque `useLiveQuery` observa a gravação. Offline é
 * simplesmente o caso em que a segunda metade não roda, e nada mais muda.
 *
 * As exceções em que vale bloquear esperando o servidor são duas, e nenhuma
 * delas passa por aqui: conferir se há revisão nova antes de baixar uma pasta, e
 * operação que dependa de estado compartilhado no momento.
 */
export function useLocalFirst<T>(
  /** A leitura do banco local. Responde na hora, com o que houver. */
  ler: () => Promise<T>,
  /** A busca no servidor, que grava no banco local e não devolve nada. */
  revalidar: () => Promise<void>,
  deps: unknown[] = [],
): { dado: T | undefined; revalidando: boolean; erro: string } {
  const dado = useLiveQuery(ler, deps)
  const [revalidando, setRevalidando] = useState(false)
  const [erro, setErro] = useState("")
  // Guarda a função para o efeito não redisparar a cada render por causa de uma
  // closure nova. Sem isso, uma tela que revalida a cada render revalidaria em
  // laço, e no canteiro isso é bateria e dado móvel.
  const fn = useRef(revalidar)
  fn.current = revalidar

  useEffect(() => {
    let vivo = true
    async function rodar() {
      if (typeof navigator !== "undefined" && !navigator.onLine) return
      setRevalidando(true)
      try {
        await fn.current()
        if (vivo) setErro("")
      } catch (e) {
        // A falha não apaga a tela. O que já estava desenhado continua lá, e o
        // erro é informação lateral: dizer "não consegui atualizar" é útil,
        // esvaziar a lista porque o servidor não respondeu é destrutivo.
        if (vivo) setErro(e instanceof Error ? e.message : "não consegui atualizar")
      } finally {
        if (vivo) setRevalidando(false)
      }
    }
    void rodar()
    // Volta a rede, revalida. É o mesmo gatilho do resto do offline.
    const aoVoltar = () => void rodar()
    window.addEventListener("online", aoVoltar)
    return () => {
      vivo = false
      window.removeEventListener("online", aoVoltar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { dado, revalidando, erro }
}
