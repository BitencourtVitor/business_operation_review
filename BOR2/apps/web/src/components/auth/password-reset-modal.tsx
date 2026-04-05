"use client"

import { IconInput } from "@/components/common/icon-input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"
import { Check, Eye, EyeOff, Loader2, Lock, X } from "lucide-react"
import { useMemo, useState } from "react"

interface PasswordResetModalProps {
  open: boolean
  onSuccess: () => void
  onClose?: () => void
}

function checkStrength(password: string) {
  const checks = {
    minLength: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^a-zA-Z0-9]/.test(password),
  }

  const passed = Object.values(checks).filter(Boolean).length

  let level: "weak" | "fair" | "good" | "strong" = "weak"
  if (passed >= 5) level = "strong"
  else if (passed >= 4) level = "good"
  else if (passed >= 3) level = "fair"

  return { checks, passed, level }
}

const strengthColors = {
  weak: "bg-destructive",
  fair: "bg-orange-500",
  good: "bg-yellow-500",
  strong: "bg-emerald-500",
}

const strengthLabels = {
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
}

export function PasswordResetModal({ open, onSuccess, onClose }: PasswordResetModalProps) {
  const token = useAuthStore((s) => s.token)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const strength = useMemo(() => checkStrength(password), [password])
  const passwordsMatch = password === confirm && confirm.length > 0
  const canSubmit = strength.level === "strong" && passwordsMatch

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    setError("")
    try {
      await api.post("/api/v1/auth/change-password", { newPassword: password }, token ?? undefined)
      onSuccess()
    } catch {
      setError("Erro ao alterar senha. Tente novamente.")
    }
    setLoading(false)
  }

  const rules = [
    { key: "minLength", label: "At least 8 characters" },
    { key: "lowercase", label: "Lowercase letter" },
    { key: "uppercase", label: "Uppercase letter" },
    { key: "number", label: "Number" },
    { key: "symbol", label: "Symbol" },
  ] as const

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose?.() }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!!onClose}>
        <DialogHeader>
          <DialogTitle>Create New Password</DialogTitle>
          <DialogDescription>
            Your password is provisional. Create a new secure password to continue.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <IconInput
              type={showPassword ? "text" : "password"}
              placeholder="New password"
              startIcon={Lock}
              endIcon={showPassword ? EyeOff : Eye}
              onEndIconClick={() => setShowPassword(!showPassword)}
              className="rounded-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {/* Strength bar */}
            {password.length > 0 && (
              <div className="space-y-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i <= strength.passed
                          ? strengthColors[strength.level]
                          : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs font-medium ${
                  strength.level === "strong" ? "text-emerald-500" :
                  strength.level === "good" ? "text-yellow-500" :
                  strength.level === "fair" ? "text-orange-500" :
                  "text-destructive"
                }`}>
                  Strength: {strengthLabels[strength.level]}
                </p>
              </div>
            )}

            {/* Rules checklist */}
            <div className="space-y-1">
              {rules.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2 text-xs">
                  {strength.checks[key] ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <X className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className={strength.checks[key] ? "text-foreground" : "text-muted-foreground"}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <IconInput
              type={showConfirm ? "text" : "password"}
              placeholder="Confirm new password"
              startIcon={Lock}
              endIcon={showConfirm ? EyeOff : Eye}
              onEndIconClick={() => setShowConfirm(!showConfirm)}
              className="rounded-full"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {confirm.length > 0 && !passwordsMatch && (
              <p className="text-xs text-destructive">Passwords do not match</p>
            )}
            {passwordsMatch && (
              <p className="flex items-center gap-1 text-xs text-emerald-500">
                <Check className="h-3 w-3" /> Passwords match
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full rounded-full" disabled={!canSubmit || loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm New Password
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
