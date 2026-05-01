import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { aiService, } from "@/services/ai.service"

export function useAIConversations(company: string) {
  return useQuery({
    queryKey: ["ai-conversations", company],
    queryFn: () => aiService.listConversations(company),
    enabled: !!company,
    staleTime: 30_000,
  })
}

export function useAIMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["ai-messages", conversationId],
    queryFn: () => aiService.listMessages(conversationId!),
    enabled: !!conversationId,
    staleTime: 0,
  })
}

export function useAIChat(company: string) {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ message, conversationId }: { message: string; conversationId?: string }) =>
      aiService.chat(company, message, conversationId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["ai-conversations", company] })
      if (vars.conversationId) {
        qc.invalidateQueries({ queryKey: ["ai-messages", vars.conversationId] })
      }
    },
  })
}

export function useDeleteConversation(company: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => aiService.deleteConversation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-conversations", company] }),
  })
}

export function useUpdateConversationTitle(company: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      aiService.updateTitle(id, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-conversations", company] }),
  })
}
