import { authService } from "@/services/auth.service"
import { useAuthStore } from "@/store/auth.store"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

interface LoginParams {
  email: string
  password: string
  remember?: boolean
}

export function useAuth() {
  const { user, token, isAuthenticated, setAuth, clearAuth } = useAuthStore()
  const router = useRouter()

  const loginMutation = useMutation({
    mutationFn: async ({ email, password, remember }: LoginParams) => {
      const data = await authService.login({ email, password })
      return { ...data, remember: remember ?? false }
    },
    onSuccess: (data) => {
      setAuth(data.user, data.token, data.remember)
      router.push("/dashboard")
    },
  })

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(token!),
    onSuccess: () => {
      clearAuth()
      router.push("/login")
    },
  })

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => authService.me(token!),
    enabled: !!token,
    retry: false,
  })

  return {
    user: meQuery.data ?? user,
    token,
    isAuthenticated,
    isLoading: meQuery.isLoading,
    login: loginMutation.mutate,
    logout: logoutMutation.mutate,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
  }
}
