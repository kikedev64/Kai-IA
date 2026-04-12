import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ChatItem, Message } from '../types/assistant'
import { getChats, getChatMessages } from '../services/assistant.services'

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
  const [isReady, setIsReady] = useState(false)

  // NUEVO: Cargar datos del backend al montar
  useEffect(() => {
    async function loadBootstrapData() {
      try {
        console.log('[Bootstrap] Cargando chats del backend...')
        const fetchedChats = await getChats()
        console.log('[Bootstrap] Chats obtenidos:', fetchedChats.length)

        if (fetchedChats.length === 0) {
          console.log('[Bootstrap] Sin chats, marcando como ready')
          setIsReady(true)
          return
        }

        // Seleccionar el primer chat
        const firstChatId = fetchedChats[0].id
        console.log('[Bootstrap] Cargando mensajes del primer chat:', firstChatId)
        
        const messages = await getChatMessages(firstChatId)
        console.log('[Bootstrap] Mensajes obtenidos:', messages.length)

        // Actualizar estado
        setChats(fetchedChats)
        setSelectedChatId(firstChatId)
        setMessagesByChatId({ [firstChatId]: messages })

        // Guardar en localStorage
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              chats: fetchedChats,
              selectedChatId: firstChatId,
              messagesByChatId: { [firstChatId]: messages }
            })
          )
        } catch (e) {
          console.warn('[Bootstrap] No se pudo guardar en localStorage', e)
        }

        setIsReady(true)
      } catch (error) {
        console.error('[Bootstrap] Error cargando datos:', error)
        // Marcar como ready incluso si hay error, para no quedar en "Cargando..."
        setIsReady(true)
      }
    }

    loadBootstrapData()
  }, [])

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