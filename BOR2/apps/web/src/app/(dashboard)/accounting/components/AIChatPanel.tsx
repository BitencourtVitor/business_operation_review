'use client'

import { useEffect, useRef, useState } from 'react'
import { X, PenSquare, SendHorizonal, Trash2, Sparkles, MessageSquare } from 'lucide-react'
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

const MAX_CHARS = 2000
const WARN_CHARS = 1800

export default function AIChatPanel({ company, open, onClose }: AIChatPanelProps) {
  const qc = useQueryClient()

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatMutation.isPending])

  // Focus textarea when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 150)
    }
  }, [open])

  // Focus edit input when entering edit mode
  useEffect(() => {
    if (editingId) {
      setTimeout(() => editInputRef.current?.focus(), 50)
    }
  }, [editingId])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || chatMutation.isPending || trimmed.length > MAX_CHARS) return

    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

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
      // error handled by mutation state
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
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    const lineHeight = 24
    const maxHeight = lineHeight * 4 + 16
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
  }

  const handleNewChat = () => {
    setActiveConversationId(null)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleDeleteConversation = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    deleteMutation.mutate(id, {
      onSuccess: () => {
        if (activeConversationId === id) {
          setActiveConversationId(null)
        }
      },
    })
  }

  const handleStartEdit = (e: React.MouseEvent | React.KeyboardEvent, conv: AIConversation) => {
    e.stopPropagation()
    setEditingId(conv.id)
    setEditingTitle(conv.title)
  }

  const handleSaveTitle = (id: string) => {
    const trimmed = editingTitle.trim()
    if (trimmed) {
      updateTitleMutation.mutate({ id, title: trimmed })
    }
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
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex shadow-2xl transition-transform duration-300 ease-in-out',
          'w-full sm:w-[420px]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-label="Aria AI Chat Panel"
        role="dialog"
        aria-modal="true"
      >
        {/* Left mini-panel: conversation list */}
        <div className="w-52 flex-shrink-0 flex flex-col border-r bg-background">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-3 border-b">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Aria</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleNewChat}
              title="New chat"
            >
              <PenSquare className="h-4 w-4" />
            </Button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto py-1">
            {sortedConversations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-6 px-3">
                No conversations yet
              </p>
            )}
            {sortedConversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  'group relative flex items-center px-2 py-1.5 mx-1 rounded-md cursor-pointer text-sm transition-colors',
                  'hover:bg-muted',
                  activeConversationId === conv.id && 'bg-muted font-medium',
                )}
                onClick={() => setActiveConversationId(conv.id)}
                onDoubleClick={(e) => handleStartEdit(e, conv)}
                title={conv.title}
              >
                {editingId === conv.id ? (
                  <input
                    ref={editInputRef}
                    className="flex-1 min-w-0 bg-transparent border-b border-primary outline-none text-sm"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle(conv.id)
                      if (e.key === 'Escape') {
                        setEditingId(null)
                        setEditingTitle('')
                      }
                    }}
                    onBlur={() => handleSaveTitle(conv.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span className="flex-1 truncate pr-1">{conv.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        'h-5 w-5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity',
                        'text-muted-foreground hover:text-destructive',
                      )}
                      onClick={(e) => handleDeleteConversation(e, conv.id)}
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right main panel: chat */}
        <div className="flex-1 flex flex-col bg-background min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
            <span className="font-semibold text-sm truncate pr-2">
              {activeConversation?.title ?? 'New conversation'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={onClose}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0">
            {!activeConversationId && messages.length === 0 && !chatMutation.isPending ? (
              /* Empty state */
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-muted-foreground">
                <Sparkles className="h-8 w-8 opacity-40" />
                <p className="text-sm">Select or start a new conversation</p>
              </div>
            ) : (
              <>
                {messages.map((msg) => {
                  const isUser = msg.role === 'user'
                  const content = getMessageContent(msg)
                  const timestamp = new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })

                  return (
                    <div
                      key={msg.id}
                      className={cn('flex flex-col gap-0.5', isUser ? 'items-end' : 'items-start')}
                    >
                      {!isUser && (
                        <span className="text-xs font-medium text-muted-foreground px-1">Aria</span>
                      )}
                      <div
                        className={cn(
                          'max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
                          isUser
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-muted rounded-bl-sm',
                        )}
                      >
                        {content}
                      </div>
                      <span className="text-[10px] text-muted-foreground px-1">{timestamp}</span>
                    </div>
                  )
                })}

                {/* Typing indicator while sending */}
                {chatMutation.isPending && (
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="text-xs font-medium text-muted-foreground px-1">Aria</span>
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
                        style={{ animationDelay: '0ms' }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
                        style={{ animationDelay: '150ms' }}
                      />
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
                        style={{ animationDelay: '300ms' }}
                      />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 border-t px-3 py-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-end gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Aria about your financials..."
                  className="flex-1 resize-none min-h-[40px] max-h-[112px] text-sm leading-6 py-2"
                  rows={1}
                  disabled={chatMutation.isPending}
                />
                <Button
                  size="icon"
                  className="h-10 w-10 flex-shrink-0"
                  onClick={handleSend}
                  disabled={
                    !input.trim() || chatMutation.isPending || overLimit
                  }
                  title="Send message"
                >
                  <SendHorizonal className="h-4 w-4" />
                </Button>
              </div>

              {/* Character counter */}
              <div className="flex justify-end">
                <span
                  className={cn(
                    'text-[10px] tabular-nums transition-colors',
                    nearLimit ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {charCount}/{MAX_CHARS}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
