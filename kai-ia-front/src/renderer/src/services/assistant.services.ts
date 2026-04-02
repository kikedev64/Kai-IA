import type {
  ApiChatsResponse,
  ApiFullChatResponse,
  ChatItem,
  Message,
  StartChatResponse,
  SendChatMessageResponse
} from '../types/assistant'

type UserProfilePayload = Record<string, unknown>

async function getBaseUrl(): Promise<string> {
  const [backendUrl, backendPort] = await Promise.all([
    window.configApi.getServerUrl(),
    window.configApi.getServerPort()
  ])

  const url = backendUrl || 'http://localhost'
  const port = backendPort || 8000

  if (!backendUrl) {
    console.warn('No se ha configurado la URL del backend, usando valor por defecto')
  }

  if (!backendPort) {
    console.warn('No se ha configurado el puerto del backend, usando valor por defecto')
  }

  return `${url}:${port}`
}

function formatUpdatedAt(dateString?: string | null): string {
  if (!dateString) return 'Sin fecha'

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'

  const now = new Date()

  const isSameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate()

  if (isSameDay) return 'Hoy'

  const yesterday = new Date()
  yesterday.setDate(now.getDate() - 1)

  const isYesterday =
    yesterday.getFullYear() === date.getFullYear() &&
    yesterday.getMonth() === date.getMonth() &&
    yesterday.getDate() === date.getDate()

  if (isYesterday) return 'Ayer'

  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  })
}

function buildLastMessagePreview(messages: ApiFullChatResponse['messages']): string {
  if (!messages?.length) return 'Sin mensajes todavía'

  const visibleMessages = messages.filter(
    (message) => message.role === 'user' || message.role === 'assistant'
  )

  if (!visibleMessages.length) return 'Sin mensajes todavía'

  const lastMessage = visibleMessages[visibleMessages.length - 1]

  return lastMessage.content?.trim() || 'Sin contenido'
}

function mapChatToChatItem(
  chat: ApiChatsResponse['chats'][number],
  index: number
): ChatItem {
  return {
    id: chat.chat_id,
    title: chat.title?.trim() || `Nuevo chat ${index + 1}`,
    lastMessage: 'Abre la conversación para ver los mensajes',
    updatedAt: formatUpdatedAt(chat.updated_at)
  }
}

export async function getChats(): Promise<ChatItem[]> {
  const baseUrl = await getBaseUrl()

  const response = await fetch(`${baseUrl}/assistant/chats`, {
    method: 'GET'
  })

  if (!response.ok) {
    throw new Error('No se pudieron cargar los chats')
  }

  const data: ApiChatsResponse = await response.json()

  return (data.chats ?? []).map(mapChatToChatItem)
}

export async function getChatById(chatId: string): Promise<ApiFullChatResponse> {
  const baseUrl = await getBaseUrl()

  const response = await fetch(`${baseUrl}/assistant/chats/${chatId}`, {
    method: 'GET'
  })

  if (!response.ok) {
    throw new Error('No se pudo cargar el chat')
  }

  return response.json()
}

export async function getChatMessages(chatId: string): Promise<Message[]> {
  const chat = await getChatById(chatId)

  const visibleMessages = (chat.messages ?? []).filter(
    (message) => message.role === 'user' || message.role === 'assistant'
  )

  return visibleMessages.map((message, index) => ({
    id: `${chatId}-${index}`,
    role: message.role as 'user' | 'assistant',
    content: message.content
  }))
}

export async function createChat(): Promise<string> {
  const baseUrl = await getBaseUrl()

  const response = await fetch(`${baseUrl}/assistant/start`, {
    method: 'POST'
  })

  if (!response.ok) {
    throw new Error('No se pudo crear el chat')
  }

  const data: StartChatResponse = await response.json()
  return data.chat_id
}

export async function sendMessage(
  chatId: string,
  userInput: string,
  limitHistory = 50
): Promise<SendChatMessageResponse> {
  const baseUrl = await getBaseUrl()

  const params = new URLSearchParams({
    chat_id: chatId,
    user_input: userInput,
    limit_history: String(limitHistory)
  })

  const response = await fetch(`${baseUrl}/assistant/chat?${params.toString()}`, {
    method: 'POST'
  })

  if (!response.ok) {
    throw new Error('No se pudo enviar el mensaje')
  }

  return response.json()
}

export async function getChatItemById(chatId: string): Promise<ChatItem> {
  const chat = await getChatById(chatId)

  return {
    id: chat.chat_id,
    title: chat.title?.trim() || 'Nuevo chat',
    lastMessage: buildLastMessagePreview(chat.messages ?? []),
    updatedAt: formatUpdatedAt(chat.updated_at)
  }
}

export async function saveUserProfileOnboarding(
  data: UserProfilePayload
): Promise<void> {
  const baseUrl = await getBaseUrl()

  const response = await fetch(`${baseUrl}/user-profile/onboarding/manual`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ data })
  })

  if (!response.ok) {
    throw new Error('No se pudo guardar el perfil del usuario')
  }
}

export async function getUserProfile(): Promise<Record<string, unknown>> {
  const baseUrl = await getBaseUrl()

  const response = await fetch(`${baseUrl}/user-profile/`, {
    method: 'GET'
  })

  if (!response.ok) {
    throw new Error('No se pudo cargar el perfil del usuario')
  }

  const data = await response.json()
  return data.profile ?? {}
}

export type InitialChatBootstrapData = {
  chats: ChatItem[]
  selectedChatId: string | null
  messagesByChatId: Record<string, Message[]>
}

export async function loadInitialChatBootstrap(): Promise<InitialChatBootstrapData> {
  const chats = await getChats()

  if (!chats.length) {
    return {
      chats: [],
      selectedChatId: null,
      messagesByChatId: {}
    }
  }

  const selectedChatId = chats[0].id
  const firstChatMessages = await getChatMessages(selectedChatId)

  return {
    chats,
    selectedChatId,
    messagesByChatId: {
      [selectedChatId]: firstChatMessages
    }
  }
}