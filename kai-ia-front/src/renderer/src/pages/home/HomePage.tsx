import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Menu, Plus, Search, Settings, Send, Bot, User, Sparkles } from 'lucide-react'
import {
  createChat,
  getChatItemById,
  getChatMessages
} from '../../services/assistant.services'
import { useChatBootstrap } from '../../context/chat-bootstrap.context'
import type { ChatItem, Message } from '../../types/assistant'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const MarkdownContent = ({ content }: { content: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      p: ({ children }) => <p className="mb-2 last:mb-0 text-sm leading-7 text-slate-100 break-words">{children}</p>,
      strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
      em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
      code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
        inline ? (
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-cyan-200 break-all">{children}</code>
        ) : (
          <pre className="my-2 overflow-x-auto rounded-xl bg-black/40 p-3 text-xs font-mono text-slate-200 border border-white/10">
            <code className="whitespace-pre-wrap">{children}</code>
          </pre>
        ),
      ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 text-sm text-slate-100">{children}</ul>,
      ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 text-sm text-slate-100">{children}</ol>,
      li: ({ children }) => <li className="leading-6 break-words">{children}</li>,
      a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline break-all hover:text-cyan-200">{children}</a>,
      blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-cyan-400/50 pl-3 text-slate-300 italic">{children}</blockquote>,
      h1: ({ children }) => <h1 className="mb-2 text-base font-semibold text-white">{children}</h1>,
      h2: ({ children }) => <h2 className="mb-2 text-sm font-semibold text-white">{children}</h2>,
      h3: ({ children }) => <h3 className="mb-1 text-sm font-medium text-white">{children}</h3>,
    }}
  >
    {content}
  </ReactMarkdown>
)

const HomePage = (): React.JSX.Element => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string>('')
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const {
    chats,
    selectedChatId,
    messagesByChatId,
    setSelectedChatId,
    setMessagesForChat,
    isReady
  } = useChatBootstrap()

  const [localChats, setLocalChats] = useState<ChatItem[]>(chats)

  useEffect(() => {
    setLocalChats(chats)
  }, [chats])

  useEffect(() => {
    const loadMessagesForSelectedChat = async () => {
      if (!selectedChatId) return
      if (messagesByChatId[selectedChatId]) return

      try {
        setIsLoadingMessages(true)
        const messages = await getChatMessages(selectedChatId)
        setMessagesForChat(selectedChatId, messages)
      } catch (error) {
        console.error('Error cargando mensajes del chat:', error)
      } finally {
        setIsLoadingMessages(false)
      }
    }

    void loadMessagesForSelectedChat()
  }, [selectedChatId, messagesByChatId, setMessagesForChat])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [messagesByChatId, streamingContent])

  const filteredChats = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return localChats
    return localChats.filter(
      (chat) =>
        chat.title.toLowerCase().includes(term) ||
        chat.lastMessage.toLowerCase().includes(term)
    )
  }, [search, localChats])

  const selectedChat = localChats.find((chat) => chat.id === selectedChatId) ?? null
  const messages = selectedChatId ? messagesByChatId[selectedChatId] ?? [] : []

  const handleCreateChat = async () => {
    try {
      setIsCreatingChat(true)
      const newChatId = await createChat()
      const optimisticChat: ChatItem = {
        id: newChatId,
        title: 'Nuevo chat',
        lastMessage: 'Sin mensajes todavía',
        updatedAt: 'Hoy'
      }
      setLocalChats((prev) => [optimisticChat, ...prev])
      setMessagesForChat(newChatId, [])
      setSelectedChatId(newChatId)
      setInput('')
    } catch (error) {
      console.error('Error creando chat:', error)
      alert('No se pudo crear el chat.')
    } finally {
      setIsCreatingChat(false)
    }
  }

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId)
  }

  const handleSend = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || !selectedChatId || isSending) return

    const optimisticUserMessage: Message = {
      id: `${selectedChatId}-user-${Date.now()}`,
      role: 'user',
      content: trimmedInput
    }

    const currentMessages = messagesByChatId[selectedChatId] ?? []
    const updatedMessages = [...currentMessages, optimisticUserMessage]

    setMessagesForChat(selectedChatId, updatedMessages)
    setLocalChats((prev) =>
      prev.map((chat) =>
        chat.id === selectedChatId
          ? { ...chat, lastMessage: trimmedInput, updatedAt: 'Hoy' }
          : chat
      )
    )
    setInput('')
    setIsSending(true)
    setStreamingContent('')

    try {
      const baseUrl = await window.configApi.getServerUrl()
      const port = await window.configApi.getServerPort()
      const url = `${baseUrl || 'http://localhost'}:${port || 8000}`

      const params = new URLSearchParams({
        chat_id: selectedChatId,
        user_input: trimmedInput,
        limit_history: '50'
      })

      const response = await fetch(`${url}/assistant/chat/stream?${params.toString()}`, {
        method: 'POST'
      })

      if (!response.ok || !response.body) throw new Error('Stream no disponible')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const token = line.slice(6)
          if (token === '[DONE]') break
          accumulated += token
          setStreamingContent(accumulated)
        }
      }

      const assistantMessage: Message = {
        id: `${selectedChatId}-assistant-${Date.now()}`,
        role: 'assistant',
        content: accumulated
      }

      setMessagesForChat(selectedChatId, [...updatedMessages, assistantMessage])
      setStreamingContent('')

      const refreshedChat = await getChatItemById(selectedChatId)
      setLocalChats((prev) =>
        prev.map((chat) => (chat.id === selectedChatId ? refreshedChat : chat))
      )
    } catch (error) {
      console.error('Error enviando mensaje:', error)
      const errorMessage: Message = {
        id: `${selectedChatId}-assistant-error-${Date.now()}`,
        role: 'assistant',
        content: 'Ha ocurrido un error al procesar el mensaje.'
      }
      setMessagesForChat(selectedChatId, [
        ...(messagesByChatId[selectedChatId] ?? []),
        errorMessage
      ])
      setStreamingContent('')
    } finally {
      setIsSending(false)
    }
  }

  // Enviar con Enter (Shift+Enter para salto de línea)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#020617] text-slate-400 text-sm">
        Cargando...
      </div>
    )
  }

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-60px] h-[320px] w-[320px] rounded-full bg-cyan-500/18 blur-3xl" />
        <div className="absolute right-[-80px] top-[10%] h-[340px] w-[340px] rounded-full bg-fuchsia-500/12 blur-3xl" />
        <div className="absolute bottom-[-100px] left-[20%] h-[300px] w-[300px] rounded-full bg-blue-500/12 blur-3xl" />
        <div className="absolute bottom-[12%] right-[18%] h-[220px] w-[220px] rounded-full bg-emerald-400/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '44px 44px'
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_32%)]" />
      </div>

      <aside
        className={`relative z-10 border-r border-white/10 bg-white/[0.045] backdrop-blur-2xl transition-all duration-300 ${
          sidebarOpen ? 'w-[330px]' : 'w-0 overflow-hidden border-r-0'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 bg-white/[0.03] p-4">
            <button
              onClick={handleCreateChat}
              disabled={isCreatingChat}
              className="group flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3 text-sm font-medium shadow-[0_10px_30px_rgba(0,0,0,0.18)] transition hover:border-white/30 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={18} />
              {isCreatingChat ? 'Creando...' : 'Nuevo chat'}
            </button>

            <div className="relative mt-4">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar chat..."
                className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white outline-none backdrop-blur-xl transition placeholder:text-slate-500 focus:border-cyan-300/30 focus:bg-black/25"
              />
            </div>
          </div>

            <div className="flex-1 overflow-y-auto p-3 scrollbar-none [&::-webkit-scrollbar]:hidden">            {filteredChats.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No hay chats disponibles.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredChats.map((chat) => {
                  const isActive = chat.id === selectedChatId
                  return (
                    <button
                      key={chat.id}
                      onClick={() => handleSelectChat(chat.id)}
                      className={`group w-full rounded-2xl border p-4 text-left transition ${
                        isActive
                          ? 'border-cyan-300/20 bg-white/[0.12] shadow-[0_8px_30px_rgba(34,211,238,0.08)]'
                          : 'border-white/5 bg-white/[0.04] hover:border-white/15 hover:bg-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="line-clamp-1 text-sm font-medium text-white">
                          {chat.title}
                        </h3>
                        <span className="shrink-0 text-xs text-slate-400">{chat.updatedAt}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-300/80">
                        {chat.lastMessage}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-white/10 bg-white/[0.045] px-4 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="rounded-2xl border border-white/10 bg-white/[0.08] p-2.5 shadow-[0_8px_25px_rgba(0,0,0,0.18)] transition hover:bg-white hover:text-black"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-200 backdrop-blur-xl">
                <Sparkles size={16} />
              </div>
              <div>
                <h1 className="text-sm font-semibold md:text-base">Kai IA</h1>
                <p className="text-xs text-slate-400">Asistente personal inteligente</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm backdrop-blur-xl transition hover:bg-white hover:text-black">
              Próximamente
            </button>
            <button className="rounded-2xl border border-white/10 bg-white/[0.08] p-2.5 backdrop-blur-xl transition hover:bg-white hover:text-black">
              <Settings size={18} />
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col pt-3 px-3 pb-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.045] shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
            <div className="relative border-b border-white/10 px-6 py-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <h2 className="text-lg font-semibold">
                {selectedChat?.title ?? 'Selecciona un chat'}
              </h2>
              <p className="mt-1 text-sm text-slate-400">Conversación activa con Kai</p>
            </div>

            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:hidden">
              <div className="mx-auto flex max-w-4xl flex-col gap-4">
                {isLoadingMessages ? (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    Cargando mensajes...
                  </div>
                ) : (
                  <>
                    {messages.map((message) => {
                      const isUser = message.role === 'user'
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-[24px] border px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl ${
                              isUser
                                ? 'border-cyan-300/20 bg-cyan-400/10'
                                : 'border-white/10 bg-white/[0.06]'
                            }`}
                          >
                            <div className="mb-2 flex items-center gap-2 text-xs text-slate-300/80">
                              {isUser ? <User size={14} /> : <Bot size={14} />}
                              <span>{isUser ? 'Tú' : 'Kai'}</span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100">
                              <MarkdownContent content={message.content} />
                            </p>
                          </div>
                        </div>
                      )
                    })}

                    {streamingContent && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                          <div className="mb-2 flex items-center gap-2 text-xs text-slate-300/80">
                            <Bot size={14} />
                            <span>Kai</span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-100">
                            <MarkdownContent content={streamingContent} />
                            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-cyan-300" />
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Indicador de espera antes de que llegue el primer token */}
                    {isSending && !streamingContent && (
                      <div className="flex justify-start">
                        <div className="rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
                          <div className="mb-2 flex items-center gap-2 text-xs text-slate-300/80">
                            <Bot size={14} />
                            <span>Kai</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {messages.length === 0 && !streamingContent && !isSending && (
                      <div className="flex h-full items-center justify-center text-slate-400">
                        No hay mensajes en este chat.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="border-t border-white/10 px-6 py-4">
              <div className="mx-auto flex max-w-4xl items-end gap-3">
                <div className="relative flex-1 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.06] shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Escribe un mensaje para Kai..."
                    className="max-h-40 min-h-[72px] w-full resize-none bg-transparent px-4 py-4 text-sm text-white outline-none placeholder:text-slate-500"
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || !selectedChatId || isSending}
                  className="flex h-[54px] w-[54px] items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.1] shadow-[0_12px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default HomePage