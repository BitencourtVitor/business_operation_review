import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export interface AIConversation {
  id: string
  user_id: string
  company: string
  title: string
  created_at: string
  updated_at: string
}

export interface AIMessage {
  id: string
  conversation_id: string
  role: "user" | "assistant"
  content_original?: string
  content_synthesized?: string
  content_response?: string
  is_compressed: boolean
  tokens_input?: number
  tokens_output?: number
  cost_usd?: number
  model?: string
  created_at: string
}

export interface ChatReply {
  conversation_id: string
  message_id: string
  response: string
  tokens_input: number
  tokens_output: number
  cost_usd: number
  model: string
}

export const aiService = {
  chat(company: string, message: string, conversationId?: string): Promise<ChatReply> {
    return api.post("/api/v1/ai/chat", { company, message, conversation_id: conversationId ?? "" }, getToken())
  },

  listConversations(company: string): Promise<AIConversation[]> {
    return api.get(`/api/v1/ai/conversations?company=${company}`, getToken())
  },

  deleteConversation(id: string): Promise<void> {
    return api.delete(`/api/v1/ai/conversations/${id}`, getToken())
  },

  updateTitle(id: string, title: string): Promise<void> {
    return api.patch(`/api/v1/ai/conversations/${id}/title`, { title }, getToken())
  },

  listMessages(conversationId: string): Promise<AIMessage[]> {
    return api.get(`/api/v1/ai/conversations/${conversationId}/messages`, getToken())
  },

  getContext(company: string): Promise<string> {
    return api.get(`/api/v1/ai/context/${company}`, getToken())
  },

  upsertContext(company: string, context: string): Promise<void> {
    return api.patch(`/api/v1/ai/context/${company}`, { context }, getToken())
  },
}
