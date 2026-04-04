import { LoginForm } from "@/components/auth/login-form"
import { GuestGuard } from "@/components/auth/guest-guard"
import { ThemeToggle } from "@/components/common/theme-toggle"

export default function LoginPage() {
  return (
    <GuestGuard>
      <main className="relative flex min-h-screen items-center justify-center px-4">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <LoginForm />
      </main>
    </GuestGuard>
  )
}
