import type { Role } from "./common"

export interface User {
  id: string
  email: string
  name: string
  role: Role
  createdAt: string
  updatedAt: string
}

export interface Session {
  id: string
  userId: string
  expiresAt: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: User
  session: Session
  token: string
  /**
   * Conta que só enxerga o Atlas. A sessão dela dura meio ano no servidor e
   * desliza a cada uso, então o token precisa sobreviver ao fechamento da aba:
   * é o que decide guardá-lo em localStorage em vez de sessionStorage.
   */
  longSession?: boolean
}
