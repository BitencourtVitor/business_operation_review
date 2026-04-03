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
}
