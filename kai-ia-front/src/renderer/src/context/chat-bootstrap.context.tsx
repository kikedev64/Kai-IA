import React, { createContext, useContext, useMemo, useState } from 'react'
import type { ChatItem, Message } from '../types/assistant'

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

export function ChatBootstrapProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const [chats, setChats] = useState<ChatItem[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null)
  const [messagesByChatId, setMessagesByChatId] = useState<Record<string, Message[]>>({})
  const [isReady, setIsReady] = useState(false)

  const value = useMemo<ChatBootstrapContextType>(
    () => ({
      chats,
      selectedChatId,
      messagesByChatId,
      isReady,
      setBootstrapData: ({ chats, selectedChatId, messagesByChatId }) => {
        setChats(chats)
        setSelectedChatId(selectedChatId)
        setMessagesByChatId(messagesByChatId)
        setIsReady(true)
      },
      setSelectedChatId,
      setMessagesForChat: (chatId: string, messages: Message[]) => {
        setMessagesByChatId((prev) => ({
          ...prev,
          [chatId]: messages
        }))
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