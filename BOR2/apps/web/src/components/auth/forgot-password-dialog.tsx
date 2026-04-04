"use client"

import { IconInput } from "@/components/common/icon-input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"
import { KeyRound, Loader2, Mail } from "lucide-react"
import { useState } from "react"

export function ForgotPasswordDialog() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    try {
      await api.post("/api/v1/auth/forgot-password", { email })
    } catch {
      // Always show success
    }
    setLoading(false)
    setSent(true)
  }

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) {
      setEmail("")
      setSent(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
          />
        }
      >
        <KeyRound className="h-3 w-3" />
        Forgot password?
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            {sent
              ? "If the email is registered, a temporary password has been sent."
              : "Enter your email to receive a temporary password."}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <Mail className="h-8 w-8 text-primary" />
            <p className="text-center text-sm text-muted-foreground">
              Check your inbox and sign in with the temporary password.
            </p>
            <Button variant="secondary" size="sm" onClick={() => handleOpenChange(false)}>
              Got it
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <IconInput
              type="email"
              placeholder="name@premiumgrpinc.com"
              startIcon={Mail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" className="w-full" size="sm" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="mr-2 h-3.5 w-3.5" />
              )}
              Send temporary password
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
