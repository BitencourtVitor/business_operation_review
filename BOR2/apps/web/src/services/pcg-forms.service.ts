import { api, API_URL } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"
import type { ProjectTrade, Question, TradeIconKey } from "@/app/bor/pcg-bid-requests/_lib/types"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

const base = "/api/v1/pcg/forms"
const publicBase = "/api/v1/pcg/public-forms"

// O que o link mostra a quem abre. É uma cópia congelada, não uma referência:
// o catálogo de trades ainda vive no localStorage de quem administra, e um
// visitante anônimo não teria como lê-lo. Editar o catálogo depois também não
// muda o formulário que alguém já recebeu.
export type PCGFormSnapshot = {
  projectName: string
  projectAddress: string
  tradeName: string
  // Opcional porque os primeiros formulários foram criados sem ele.
  icon?: TradeIconKey
  questions: Question[]
}

export type PCGBidForm = {
  id: string
  projectId: string
  tradeId: string
  snapshot: PCGFormSnapshot
  answers?: ProjectTrade["answers"]
  available: boolean
  submittedAt: string | null
  createdAt: string
  createdBy: string
}

export type PCGPublicForm = {
  id: string
  state: "open" | "answered" | "closed"
  snapshot?: PCGFormSnapshot
}

// O endereço que vai no WhatsApp. Montado do próprio site que está aberto, para
// não haver uma segunda cópia do domínio para manter.
export function formLink(id: string): string {
  return `${window.location.origin}/pcg-form/${id}`
}

export const pcgFormsService = {
  list: (projectId: string) =>
    api.get<PCGBidForm[]>(`${base}?project_id=${encodeURIComponent(projectId)}`, getToken()).then(r => r ?? []),

  create: (projectId: string, tradeId: string, snapshot: PCGFormSnapshot) =>
    api.post<PCGBidForm>(base, { projectId, tradeId, snapshot }, getToken()),

  setAvailable: (id: string, available: boolean) =>
    api.patch<PCGBidForm>(`${base}/${id}`, { available }, getToken()),

  remove: (id: string) => api.delete(`${base}/${id}`, getToken()),

  // As duas chamadas da página pública, fora do cliente compartilhado de
  // propósito: ele trata 401 derrubando a sessão e mandando para /login, que é
  // exatamente o que este link existe para não fazer. Quem abre não tem sessão
  // para derrubar, e quem abre já logado não pode ser deslogado por isso.
  getPublic: (id: string) => publicRequest<PCGPublicForm>(`${publicBase}/${id}`),

  submit: (id: string, answers: ProjectTrade["answers"]) =>
    publicRequest<{ submittedAt: string }>(`${publicBase}/${id}`, { answers }),
}

async function publicRequest<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error((json?.error as string) ?? `HTTP ${res.status}`)
  return (json?.data ?? null) as T
}
