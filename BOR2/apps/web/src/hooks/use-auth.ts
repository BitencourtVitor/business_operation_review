import { authService } from "@/services/auth.service"
import { useAuthStore } from "@/store/auth.store"
import { useFinancialStore } from "@/store/financial.store"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

/**
 * Se há rede, agora.
 *
 * `navigator.onLine` mente para cima (diz que há rede quando só há Wi-Fi sem
 * saída), mas nunca mente para baixo: quando ele diz que não há, não há mesmo.
 * É a direção que importa aqui, porque o uso é decidir o que **não** tentar.
 */
function useOnline() {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const m = () => setOnline(navigator.onLine)
    m()
    window.addEventListener("online", m)
    window.addEventListener("offline", m)
    return () => {
      window.removeEventListener("online", m)
      window.removeEventListener("offline", m)
    }
  }, [])
  return online
}

interface LoginParams {
  email: string
  password: string
  remember?: boolean
}

export function useAuth() {
  const { user, token, isAuthenticated, setAuth, clearAuth } = useAuthStore()
  const { resetFinancial } = useFinancialStore()
  const queryClient = useQueryClient()
  const router = useRouter()

  const loginMutation = useMutation({
    mutationFn: async ({ email, password, remember }: LoginParams) => {
      const data = await authService.login({ email, password })
      return { ...data, remember: remember ?? false }
    },
    onSuccess: (data) => {
      // Conta exclusiva do Atlas não depende da caixinha "Remember me": quem
      // abre uma prancha na obra pelo celular perdia a sessão a cada aba que o
      // navegador fechava sozinho, por mais meses que o servidor concedesse.
      setAuth(data.user, data.token, data.remember || !!data.longSession)
      router.push("/select")
    },
  })

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(token!),
    onSuccess: () => {
      // Clear ALL cached query data before navigating — prevents previous user's
      // data (name, profile, business data) from flashing on the next login.
      queryClient.clear()
      resetFinancial()
      clearAuth()
      router.push("/login")
    },
  })

  // A sessão precisa sobreviver sem rede.
  //
  // O token e o usuário já ficam no store persistido, então entrar não depende
  // do servidor. O que dependia era esta consulta: sem sinal ela falhava a cada
  // abertura, e a tela ficava em carregamento eterno esperando uma resposta que
  // não vinha.
  //
  // Offline ela nem roda, e o `user` do store responde. É o dado do último
  // login, e para o que ele serve na obra — nome, cargo, permissão — isso é
  // exatamente o que vale: nada disso muda entre uma prancha e outra.
  //
  // Voltando a rede, o `refetchOnReconnect` do TanStack revalida sozinho, que é
  // o mesmo stale-while-revalidate do resto do offline: mostra o que tem,
  // conserta quando puder.
  const online = useOnline()
  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => authService.me(token!),
    enabled: !!token && online,
    retry: false,
    refetchOnReconnect: true,
    staleTime: 5 * 60 * 1000,
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
