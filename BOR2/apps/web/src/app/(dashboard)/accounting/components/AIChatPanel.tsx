'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, PenSquare, SendHorizonal, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  useAIConversations,
  useAIMessages,
  useAIChat,
  useDeleteConversation,
  useUpdateConversationTitle,
} from '@/hooks/use-ai-chat'
import type { AIConversation, AIMessage } from '@/services/ai.service'
import { useQueryClient } from '@tanstack/react-query'

interface AIChatPanelProps {
  company: string
  open: boolean
  onClose: () => void
}

interface AriaConfig {
  company: string
}

const MAX_CHARS = 2000
const WARN_CHARS = 1800

// ── Inline panel (same mechanism as InsightsPanel) ────────────────────────────

export default function AIChatPanel({ company, open, onClose }: AIChatPanelProps) {
  const qc = useQueryClient()

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const { data: conversations = [] } = useAIConversations(company)
  const { data: messages = [], refetch: refetchMessages } = useAIMessages(activeConversationId)
  const chatMutation = useAIChat(company)
  const deleteMutation = useDeleteConversation(company)
  const updateTitleMutation = useUpdateConversationTitle(company)

  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatMutation.isPending])

  // Clear optimistic message only after real messages have loaded
  useEffect(() => {
    if (optimisticMessage && messages.length > 0 && !chatMutation.isPending) {
      setOptimisticMessage(null)
    }
  }, [messages, optimisticMessage, chatMutation.isPending])

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 300)
  }, [open])

  useEffect(() => {
    if (editingId) setTimeout(() => editInputRef.current?.focus(), 50)
  }, [editingId])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || chatMutation.isPending || trimmed.length > MAX_CHARS) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setOptimisticMessage(trimmed)

    const isNewConversation = !activeConversationId

    try {
      const reply = await chatMutation.mutateAsync({
        message: trimmed,
        conversationId: activeConversationId ?? undefined,
      })

      if (isNewConversation && reply.conversation_id) {
        setActiveConversationId(reply.conversation_id)
        qc.invalidateQueries({ queryKey: ['ai-messages', reply.conversation_id] })
      } else if (activeConversationId) {
        refetchMessages()
      }
      // optimisticMessage cleared by useEffect once messages arrive
    } catch {
      // on error: keep optimistic message visible, chatMutation.isError shows state
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 24 * 4 + 16) + 'px'
  }

  const handleNewChat = () => {
    setActiveConversationId(null)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleDeleteConversation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteMutation.mutate(id, {
      onSuccess: () => {
        if (activeConversationId === id) setActiveConversationId(null)
      },
    })
  }

  const handleStartEdit = (e: React.MouseEvent, conv: AIConversation) => {
    e.stopPropagation()
    setEditingId(conv.id)
    setEditingTitle(conv.title)
  }

  const handleSaveTitle = (id: string) => {
    const trimmed = editingTitle.trim()
    if (trimmed) updateTitleMutation.mutate({ id, title: trimmed })
    setEditingId(null)
    setEditingTitle('')
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const charCount = input.length
  const overLimit = charCount > MAX_CHARS
  const nearLimit = charCount > WARN_CHARS

  const getMessageContent = (msg: AIMessage) => {
    if (msg.role === 'user') return msg.content_original ?? ''
    return msg.content_response ?? msg.content_synthesized ?? ''
  }

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col overflow-hidden rounded-xl border transition-all duration-300 ease-in-out',
        open ? 'ml-4 w-[420px] border-border opacity-100' : 'ml-0 w-0 border-transparent opacity-0',
      )}
      style={{ backgroundColor: 'color-mix(in oklab, var(--color-card) 60%, transparent)' }}
    >
      {/* ── Two-column interior ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Left: conversation list */}
        <div className="flex w-44 shrink-0 flex-col border-r border-border">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-semibold">Aria</span>
            </div>
            <button
              onClick={handleNewChat}
              title="New chat"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground"
            >
              <PenSquare className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {sortedConversations.length === 0 && (
              <p className="mt-6 px-3 text-center text-xs text-muted-foreground">
                No conversations yet
              </p>
            )}
            {sortedConversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  'group relative mx-1 flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted',
                  activeConversationId === conv.id && 'bg-muted font-medium',
                )}
                onClick={() => setActiveConversationId(conv.id)}
                onDoubleClick={(e) => handleStartEdit(e, conv)}
                title={conv.title}
              >
                {editingId === conv.id ? (
                  <input
                    ref={editInputRef}
                    className="min-w-0 flex-1 border-b border-primary bg-transparent text-xs outline-none"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle(conv.id)
                      if (e.key === 'Escape') { setEditingId(null); setEditingTitle('') }
                    }}
                    onBlur={() => handleSaveTitle(conv.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="flex-1 truncate pr-1">{conv.title}</span>
                    <button
                      className={cn(
                        'h-4 w-4 shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity',
                        'text-muted-foreground/50 hover:text-destructive',
                      )}
                      onClick={(e) => handleDeleteConversation(e, conv.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: chat area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
            <span className="truncate pr-2 text-xs font-semibold text-muted-foreground">
              {activeConversation?.title ?? 'New conversation'}
            </span>
            <button
              onClick={onClose}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
            {!activeConversationId && messages.length === 0 && !optimisticMessage ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Sparkles className="h-7 w-7 opacity-30" />
                <p className="text-xs">Start a new conversation</p>
              </div>
            ) : (
              <>
                {messages.map((msg) => {
                  const isUser = msg.role === 'user'
                  const content = getMessageContent(msg)
                  const ts = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

                  return (
                    <div key={msg.id} className={cn('flex flex-col gap-0.5', isUser ? 'items-end' : 'items-start')}>
                      {!isUser && (
                        <span className="px-1 text-[10px] font-medium text-muted-foreground">Aria</span>
                      )}
                      <div
                        className={cn(
                          'max-w-[90%] break-words rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap',
                          isUser
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-muted rounded-bl-sm',
                        )}
                      >
                        {content}
                      </div>
                      <span className="px-1 text-[10px] text-muted-foreground">{ts}</span>
                    </div>
                  )
                })}

                {/* Optimistic user message while waiting for response */}
                {optimisticMessage && (
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="max-w-[90%] break-words rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-xs whitespace-pre-wrap text-primary-foreground">
                      {optimisticMessage}
                    </div>
                  </div>
                )}

                {/* Error state */}
                {chatMutation.isError && optimisticMessage && (
                  <p className="px-1 text-[10px] text-destructive">
                    Failed to send — check if the API is running.
                  </p>
                )}

                {/* Aria typing indicator */}
                {chatMutation.isPending && (
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="px-1 text-[10px] font-medium text-muted-foreground">Aria</span>
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-2.5">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border px-2 py-2">
            <div className="flex items-end gap-1.5">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask Aria…"
                className="min-h-[36px] max-h-[96px] flex-1 resize-none py-2 text-xs leading-5"
                rows={1}
                disabled={chatMutation.isPending}
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={handleSend}
                disabled={!input.trim() || chatMutation.isPending || overLimit}
              >
                <SendHorizonal className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-1 flex justify-end">
              <span className={cn('text-[10px] tabular-nums transition-colors', nearLimit ? 'text-destructive' : 'text-muted-foreground')}>
                {charCount}/{MAX_CHARS}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── useAria hook (mirrors useInsights pattern) ────────────────────────────────

export function useAria(config: AriaConfig) {
  const [open, setOpen] = useState(false)
  // Lazy-mount: only render AIChatPanel after the first open click.
  // This avoids firing authenticated queries before Zustand has hydrated
  // the token from localStorage (Next.js async hydration race condition).
  const [everOpened, setEverOpened] = useState(false)

  const toggle = useCallback(() => {
    setEverOpened(true)
    setOpen((v) => !v)
  }, [])
  const close = useCallback(() => setOpen(false), [])

  const triggerButton = (
    <button
      onClick={toggle}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors',
        open
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Sparkles className="h-3.5 w-3.5" />
      Aria
    </button>
  )

  // Only mount the panel after first open — keeps it in DOM for open/close
  // animations on subsequent toggles, but avoids the pre-hydration query.
  const panel = everOpened ? <AIChatPanel {...config} open={open} onClose={close} /> : null

  return { open, triggerButton, panel }
}
