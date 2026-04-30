import type { User } from "@bor2/shared"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

const REMEMBER_KEY = "bor2-remember"

function getStorage() {
  if (typeof window === "undefined") return undefined
  const remember = localStorage.getItem(REMEMBER_KEY) === "true"
  return remember ? localStorage : sessionStorage
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (user: User, token: string, remember: boolean) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user, token, remember) => {
        // Save remember preference BEFORE setting auth so storage is correct on next hydration
        if (typeof window !== "undefined") {
          localStorage.setItem(REMEMBER_KEY, String(remember))
          if (remember) {
            localStorage.setItem("bor2-auth", JSON.stringify({ state: { token }, version: 0 }))
          } else {
            localStorage.removeItem("bor2-auth")
            sessionStorage.setItem("bor2-auth", JSON.stringify({ state: { token }, version: 0 }))
          }
        }
        set({ user, token, isAuthenticated: true })
      },
      clearAuth: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("bor2-auth")
          localStorage.removeItem(REMEMBER_KEY)
          localStorage.removeItem("bor2-financial") // clear other user's financial pref
          sessionStorage.removeItem("bor2-auth")
        }
        set({ user: null, token: null, isAuthenticated: false })
      },
    }),
    {
      name: "bor2-auth",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") return sessionStorage
        return getStorage() ?? sessionStorage
      }),
      partialize: (state) => ({ token: state.token }),
    }
  )
)
