import { api } from "@/lib/api"
import type { LoginRequest, LoginResponse, User } from "@bor2/shared"

export const authService = {
  login: (credentials: LoginRequest) =>
    api.post<LoginResponse>("/api/v1/auth/login", credentials),

  logout: (token: string) =>
    api.post<void>("/api/v1/auth/logout", {}, token),

  me: (token: string) =>
    api.get<User>("/api/v1/auth/me", token),
}
