const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  body?: unknown
  token?: string
}

class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token } = options

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // 204 No Content has no body — skip JSON parsing
  const json: Record<string, unknown> | null =
    res.status === 204 ? null : await res.json()

  if (!res.ok) {
    // 401 derruba a sessão, mas nunca quando a causa pode ser a rede.
    //
    // No canteiro isso é a diferença entre trabalhar e não trabalhar: um proxy
    // de hotel, um portal cativo ou um gateway mal configurado devolvem 401 para
    // requisição que nunca chegou ao servidor, e mandar a pessoa para o login
    // apagaria a fila local dela — quinze pontos levantados na manhã — por causa
    // de um Wi-Fi ruim.
    //
    // Offline, o erro sobe e quem chamou decide. Com rede, o 401 é o que ele diz
    // ser.
    const semRede = typeof navigator !== "undefined" && !navigator.onLine
    if (res.status === 401 && typeof window !== "undefined" && !semRede) {
      const { useAuthStore } = await import("@/store/auth.store")
      useAuthStore.getState().clearAuth()
      window.location.href = "/login"
    }
    throw new ApiError(
      res.status,
      (json?.code as string) ?? "UNKNOWN",
      (json?.error as string) ?? "Unknown error",
    )
  }

  return (json?.data ?? null) as T
}

export const api = {
  get: <T>(path: string, token?: string) => request<T>(path, { token }),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "POST", body, token }),
  put: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "PUT", body, token }),
  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "PATCH", body, token }),
  delete: <T>(path: string, token?: string) => request<T>(path, { method: "DELETE", token }),
}

export { ApiError }
