import { api } from "@/lib/api"

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
    return api.post("/ai/chat", { company, message, conversation_id: conversationId ?? "" })
  },

  listConversations(company: string): Promise<AIConversation[]> {
    return api.get(`/ai/conversations?company=${company}`)
  },

  deleteConversation(id: string): Promise<void> {
    return api.delete(`/ai/conversations/${id}`)
  },

  updateTitle(id: string, title: string): Promise<void> {
    return api.patch(`/ai/conversations/${id}/title`, { title })
  },

  listMessages(conversationId: string): Promise<AIMessage[]> {
    return api.get(`/ai/conversations/${conversationId}/messages`)
  },

  getContext(company: string): Promise<string> {
    return api.get(`/ai/context/${company}`)
  },

  upsertContext(company: string, context: string): Promise<void> {
    return api.patch(`/ai/context/${company}`, { context })
  },
}
