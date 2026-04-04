"use client"

import { PasswordResetModal } from "@/components/auth/password-reset-modal"
import { useAuth } from "@/hooks/use-auth"
import { useAuthStore } from "@/store/auth.store"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const { user } = useAuth()
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated && !token) {
      router.replace("/login")
    }
  }, [hydrated, token, router])

  if (!hydrated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    )
  }

  if (!token) {
    return null
  }

  // If user has provisional password, force reset
  if (user?.provisionalPassword && !resetDone) {
    return (
      <PasswordResetModal
        open={true}
        onSuccess={() => setResetDone(true)}
      />
    )
  }

  return <>{children}</>
}
