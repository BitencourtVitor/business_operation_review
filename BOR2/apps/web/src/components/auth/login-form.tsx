"use client"

import { ForgotPasswordDialog } from "@/components/auth/forgot-password-dialog"
import { IconInput } from "@/components/common/icon-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useAuth } from "@/hooks/use-auth"
import { zodResolver } from "@hookform/resolvers/zod"
import { Eye, EyeOff, Loader2, Lock, LogIn, Mail } from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type LoginFormValues = z.infer<typeof loginSchema>

const REMEMBER_EMAIL_KEY = "bor2-remember-email"

// Local dev types the same address every reload; skip it.
const DEV_EMAIL = "vitor@premiumgrpinc.com"

function isLocalhost() {
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
}

export function LoginForm() {
  const { login, isLoggingIn, loginError } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  // Load remembered email on mount
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY)
    if (saved) {
      form.setValue("email", saved)
      setRemember(true)
    } else if (isLocalhost()) {
      form.setValue("email", DEV_EMAIL)
    }
  }, [form])

  function handleLogin(v: LoginFormValues) {
    if (remember) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, v.email)
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY)
    }
    login({ ...v, remember })
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo_black.png"
        alt="Premium Group"
        className="h-8 object-contain dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo_white.png"
        alt="Premium Group"
        className="hidden h-8 object-contain dark:block"
      />

      {/* Sem nome de produto: esta tela é a porta da plataforma, e o destino
          — BOR ou Atlas — se escolhe depois de autenticar (AT-2). */}
      <div className="text-center">
        <h1 className="text-xl font-semibold text-primary">Data Intelligence Platform</h1>
        <p className="text-sm text-muted-foreground">Sign in to your account</p>
      </div>

      <Card className="w-full max-w-md py-0">
        <CardContent className="px-6 py-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <IconInput
                        type="email"
                        placeholder="name@premiumgrpinc.com"
                        startIcon={Mail}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <IconInput
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        startIcon={Lock}
                        endIcon={showPassword ? EyeOff : Eye}
                        onEndIconClick={() => setShowPassword(!showPassword)}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {loginError && (
                <p className="text-sm text-destructive">
                  {loginError.message}
                </p>
              )}

              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm whitespace-nowrap">
                  <Checkbox
                    checked={remember}
                    onCheckedChange={(v) => setRemember(v === true)}
                  />
                  Remember me
                </label>

                <Button type="submit" className="flex-1" disabled={isLoggingIn}>
                  {isLoggingIn ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="mr-2 h-4 w-4" />
                  )}
                  Sign in
                </Button>
              </div>
            </form>
          </Form>

        </CardContent>
      </Card>

      <ForgotPasswordDialog />
    </div>
  )
}
