'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, PenSquare, SendHorizonal, Trash2, Sparkles, PanelLeft, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
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

const loadingMessages = [
  'Consultando QuickBooks…',
  'Analisando dados…',
  'Processando métricas…',
  'Gerando insights…',
]

// ── Inline panel (same mechanism as InsightsPanel) ────────────────────────────

export default function AIChatPanel({ company, open, onClose }: AIChatPanelProps) {
  const qc = useQueryClient()

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null)
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const { data: conversationsRaw } = useAIConversations(company)
  const { data: messagesRaw, refetch: refetchMessages } = useAIMessages(activeConversationId)
  const conversations = conversationsRaw ?? []
  const messages = messagesRaw ?? []
  const chatMutation = useAIChat(company)
  const deleteMutation = useDeleteConversation(company)
  const updateTitleMutation = useUpdateConversationTitle(company)

  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, optimisticMessage])

  // Clear optimistic message only after real messages have loaded
  useEffect(() => {
    if (optimisticMessage && messages.length > 0 && !chatMutation.isPending) {
      setOptimisticMessage(null)
    }
  }, [messages, optimisticMessage, chatMutation.isPending])

  // Cycle loading text
  useEffect(() => {
    if (!optimisticMessage) { setLoadingMsgIdx(0); return }
    const id = setInterval(() => setLoadingMsgIdx((i) => (i + 1) % loadingMessages.length), 1800)
    return () => clearInterval(id)
  }, [optimisticMessage])

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 300)
  }, [open])

  useEffect(() => {
    if (editingId) setTimeout(() => editInputRef.current?.focus(), 50)
  }, [editingId])

  // Close sheet when panel closes
  useEffect(() => {
    if (!open) setSheetOpen(false)
  }, [open])

  // ── Handlers ─────────────────────────────────────────────────────────────────

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
    } catch {
      // keep optimistic message visible; isError shows the error state
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
    setSheetOpen(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id)
    setSheetOpen(false)
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

  // ── Derived ───────────────────────────────────────────────────────────────────

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const charCount = input.length
  const overLimit = charCount > MAX_CHARS
  const nearLimit = charCount > WARN_CHARS

  const getMessageContent = (msg: AIMessage) => {
    if (msg.role === 'user') return msg.content_original ?? ''
    return msg.content_response ?? msg.content_synthesized ?? ''
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        'relative flex shrink-0 flex-col overflow-hidden rounded-xl border transition-all duration-300 ease-in-out',
        open ? 'ml-4 w-[400px] border-border opacity-100' : 'ml-0 w-0 border-transparent opacity-0',
      )}
      style={{ backgroundColor: 'color-mix(in oklab, var(--color-card) 60%, transparent)' }}
    >

      {/* ── Internal sheet (slides from left inside the container) ── */}
      <div
        className={cn(
          'absolute inset-0 z-20 transition-all duration-300',
          sheetOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
      >
        {/* Backdrop */}
        <div
          className={cn(
            'absolute inset-0 transition-opacity duration-300',
            sheetOpen ? 'opacity-100' : 'opacity-0',
          )}
          style={{ backgroundColor: 'color-mix(in oklab, var(--color-background) 50%, transparent)' }}
          onClick={() => setSheetOpen(false)}
        />

        {/* Sheet panel */}
        <div
          className={cn(
            'absolute bottom-0 left-0 top-0 flex w-60 flex-col border-r border-border transition-transform duration-300 ease-in-out',
            sheetOpen ? 'translate-x-0' : '-translate-x-full',
          )}
          style={{ backgroundColor: 'var(--color-card)' }}
        >
          {/* Sheet header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-xs font-semibold">Conversas</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewChat}
                title="Nova conversa"
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                <PenSquare className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setSheetOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto py-1">
            {sortedConversations.length === 0 && (
              <p className="mt-6 px-3 text-center text-xs text-muted-foreground">
                Nenhuma conversa ainda
              </p>
            )}
            {sortedConversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  'group mx-1 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-2 text-xs transition-colors hover:bg-muted',
                  activeConversationId === conv.id && 'bg-muted',
                )}
                onClick={() => handleSelectConversation(conv.id)}
                title={conv.title}
              >
                {editingId === conv.id ? (
                  <>
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
                    <button
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-primary hover:text-primary/80"
                      onClick={(e) => { e.stopPropagation(); handleSaveTitle(conv.id) }}
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className={cn('flex-1 truncate', activeConversationId === conv.id && 'font-medium')}>
                      {conv.title}
                    </span>
                    {/* Actions — visible on hover */}
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground"
                        onClick={(e) => handleStartEdit(e, conv)}
                        title="Renomear"
                      >
                        <PenSquare className="h-3 w-3" />
                      </button>
                      <button
                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-destructive"
                        onClick={(e) => handleDeleteConversation(e, conv.id)}
                        title="Excluir"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main column ── */}
      <div className="flex min-h-0 flex-1 flex-col">

        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
          {/* Sheet trigger */}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
            title="Conversas"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </button>

          {/* Brand */}
          <div className="flex shrink-0 items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-sm font-semibold">Aria</span>
          </div>

          {/* Vertical divider */}
          <div className="h-4 w-px shrink-0 bg-border" />

          {/* Conversation title */}
          <span className="flex-1 truncate text-xs text-muted-foreground">
            {activeConversation?.title ?? 'Nova conversa'}
          </span>

          {/* Close */}
          <button
            onClick={onClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
          {!activeConversationId && messages.length === 0 && !optimisticMessage ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Sparkles className="h-7 w-7 opacity-30" />
              <p className="text-xs">Inicie uma conversa</p>
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
                        'max-w-[90%] break-words rounded-2xl px-3 py-2 text-xs',
                        isUser
                          ? 'bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap'
                          : 'bg-muted rounded-bl-sm prose prose-xs prose-invert max-w-none',
                      )}
                    >
                      {isUser ? content : (
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                            ul: ({ children }) => <ul className="mb-1 ml-3 list-disc space-y-0.5">{children}</ul>,
                            ol: ({ children }) => <ol className="mb-1 ml-3 list-decimal space-y-0.5">{children}</ol>,
                            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            code: ({ children }) => <code className="rounded bg-black/20 px-1 py-0.5 font-mono text-[11px]">{children}</code>,
                          }}
                        >
                          {content}
                        </ReactMarkdown>
                      )}
                    </div>
                    <span className="px-1 text-[10px] text-muted-foreground">{ts}</span>
                  </div>
                )
              })}

              {/* Optimistic user message */}
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
                  {(chatMutation.error as Error)?.message || 'Falha ao enviar'}
                </p>
              )}

              {/* Loading indicator — shown until real messages arrive */}
              {optimisticMessage !== null && !chatMutation.isError && (
                <div className="flex flex-col items-start gap-0.5">
                  <span className="px-1 text-[10px] font-medium text-muted-foreground">Aria</span>
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
                    <span className="flex gap-0.5">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground/60"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {loadingMessages[loadingMsgIdx]}
                    </span>
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
              placeholder="Pergunte à Aria…"
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
  )
}

// ── useAria hook (mirrors useInsights pattern) ────────────────────────────────

export function useAria(config: AriaConfig) {
  const [open, setOpen] = useState(false)
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

  const panel = everOpened ? <AIChatPanel {...config} open={open} onClose={close} /> : null

  return { open, triggerButton, panel }
}
