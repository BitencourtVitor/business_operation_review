"use client"

import { QueryClient } from "@tanstack/react-query"

/**
 * O QueryClient da aplicação.
 *
 * No servidor cada chamada ganha um cliente novo: um cliente de módulo seria
 * compartilhado entre requisições de pessoas diferentes. No navegador é um só.
 */
let cliente: QueryClient | null = null

function novo() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        retry: 1,
      },
    },
  })
}

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return novo()
  return (cliente ??= novo())
}
