import React, { createContext, useContext, useMemo, useState } from 'react'
import type { ChatItem, Message } from '../types/assistant'

const STORAGE_KEY = 'kai_bootstrap'

type ChatBootstrapState = {
  chats: ChatItem[]
  selectedChatId: string | null
  messagesByChatId: Record<string, Message[]>
  isReady: boolean
}

type ChatBootstrapContextType = ChatBootstrapState & {
  setBootstrapData: (data: {
    chats: ChatItem[]
    selectedChatId: string | null
    messagesByChatId: Record<string, Message[]>
  }) => void
  setSelectedChatId: (chatId: string | null) => void
  setMessagesForChat: (chatId: string, messages: Message[]) => void
}

const ChatBootstrapContext = createContext<ChatBootstrapContextType | null>(null)

function loadFromStorage(): Partial<ChatBootstrapState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function ChatBootstrapProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const stored = loadFromStorage()

  const [chats, setChats] = useState<ChatItem[]>(stored.chats ?? [])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(stored.selectedChatId ?? null)
  const [messagesByChatId, setMessagesByChatId] = useState<Record<string, Message[]>>(
    stored.messagesByChatId ?? {}
  )
  const [isReady, setIsReady] = useState(!!stored.chats?.length)

  const value = useMemo<ChatBootstrapContextType>(
    () => ({
      chats,
      selectedChatId,
      messagesByChatId,
      isReady,
      setBootstrapData: ({ chats, selectedChatId, messagesByChatId }) => {
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ chats, selectedChatId, messagesByChatId })
          )
        } catch (e) {
          console.warn('No se pudo guardar bootstrap en localStorage', e)
        }
        setChats(chats)
        setSelectedChatId(selectedChatId)
        setMessagesByChatId(messagesByChatId)
        setIsReady(true)
      },
      setSelectedChatId,
      setMessagesForChat: (chatId: string, messages: Message[]) => {
        setMessagesByChatId((prev) => ({ ...prev, [chatId]: messages }))
      }
    }),
    [chats, selectedChatId, messagesByChatId, isReady]
  )

  return (
    <ChatBootstrapContext.Provider value={value}>{children}</ChatBootstrapContext.Provider>
  )
}

export function useChatBootstrap(): ChatBootstrapContextType {
  const context = useContext(ChatBootstrapContext)
  if (!context) {
    throw new Error('useChatBootstrap debe usarse dentro de ChatBootstrapProvider')
  }
  return context
}