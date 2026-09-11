"use client"

import { IconInput } from "@/components/common/icon-input"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"
import { useAuth } from "@/hooks/use-auth"
import { useAuthStore } from "@/store/auth.store"
import { Check, Eye, EyeOff, Loader2, Lock, LogOut, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"

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
  const { logout } = useAuth()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  // O canto de tema e sair vai por portal, e portal só existe no navegador. Sem
  // esperar a montagem, o servidor desenha a tela sem os botões e o navegador
  // com eles, e o React acusa erro de hidratação.
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])

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
      setError("Could not change the password. Try again.")
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
    <>
    {/* A saída da tela, fora da janela, no canto superior direito da tela.

        Quem entra com senha provisória cai aqui e o modal não fecha: sem
        `onClose` não há X, e trocar a senha é a única porta. Quem entrou com a
        conta errada, ou só queria conferir uma credencial, ficava preso tendo
        que definir uma senha permanente que não pediu.

        Fica fora da janela porque sair da conta não é parte do formulário: é
        sair da tela inteira, e o lugar disso é o canto da tela, como em qualquer
        outra página do sistema. Dentro da janela ele se lia como uma ação do
        formulário.

        Três detalhes sustentam isso, e os três quebram em silêncio se forem
        desfeitos:
          - vai por portal para o `body`. Dentro da janela, que é centralizada
            com `translate`, um filho `fixed` se posiciona em relação a ela e não
            à tela;
          - fica acima do fundo escuro (`z-[60]` contra `z-50`);
          - nesse modo o diálogo não é modal. Modal deixa inerte tudo que está
            fora dele, e o botão apareceria no lugar certo sem receber clique.
            Não há o que proteger: o AuthGuard não desenha mais nada na página
            enquanto a senha é provisória.

        O botão só existe quando não há X, porque aí ele é a única saída. */}
    {/* O canto da tela é o mesmo da seleção de produto (`select/page.tsx`):
        tema e sair, na mesma ordem, com os mesmos botões. É a mesma moldura de
        quem ainda não entrou num produto, e as duas telas se leem como uma. */}
    {open && !onClose && montado && createPortal(
      <div className="fixed right-4 top-4 z-[60] flex items-center gap-2">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => logout()}
          aria-label="Log out"
          className="text-muted-foreground"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>,
      document.body,
    )}
    <Dialog open={open} modal={!!onClose} onOpenChange={v => { if (!v) onClose?.() }}>
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
    </>
  )
}
