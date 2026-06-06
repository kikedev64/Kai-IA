import type {
  ApiChatsResponse,
  ApiFullChatResponse,
  ChatItem,
  Message,
  StartChatResponse,
  SendChatMessageResponse
} from '../types/assistant'

type UserProfilePayload = Record<string, unknown>

/**
 * Build the assistant backend base URL from renderer configuration.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<string>
 */
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

/**
 * Format a chat update timestamp for the sidebar.
 *
 * Args:
 *   dateString: ISO date returned by the backend.
 *
 * Returns:
 *   string
 */
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

/**
 * Return a readable sidebar preview from raw message content.
 *
 * Mermaid fenced blocks are replaced with a concise label so the sidebar
 * never shows raw diagram syntax. Other fenced code blocks are collapsed
 * to a generic label, and common markdown symbols are stripped so the
 * preview reads as plain prose.
 *
 * Args:
 *   raw: Raw message content string.
 *
 * Returns:
 *   string
 */
function cleanPreviewContent(raw: string): string {
  return raw
    .replace(/```mermaid[\s\S]*?```/gi, '[Diagrama]')
    .replace(/```[\s\S]*?```/g, '[Código]')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Create the sidebar preview for the most recent visible chat message.
 *
 * Args:
 *   messages: Messages returned for a chat.
 *
 * Returns:
 *   string
 */
function buildLastMessagePreview(messages: ApiFullChatResponse['messages']): string {

  if (!messages?.length) return 'Sin mensajes todavía'

  const visibleMessages = messages.filter(
    (message) => message.role === 'user' || message.role === 'assistant'
  )

  if (!visibleMessages.length) return 'Sin mensajes todavía'

  const lastMessage = visibleMessages[visibleMessages.length - 1]

  return cleanPreviewContent(lastMessage.content?.trim() || '') || 'Sin contenido'
}

/**
 * Map a backend chat summary to the renderer chat item model.
 *
 * Args:
 *   chat: Backend chat summary.
 *   index: Position in the returned chat list.
 *
 * Returns:
 *   ChatItem
 */
function mapChatToChatItem(chat: ApiChatsResponse['chats'][number], index: number): ChatItem {

  return {
    id: chat.chat_id,
    title: chat.title?.trim() || `Nuevo chat ${index + 1}`,
    lastMessage: 'Abre la conversación para ver los mensajes',
    updatedAt: formatUpdatedAt(chat.updated_at)
  }
}

/**
 * Load chat summaries from the backend.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<ChatItem[]>
 */
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

/**
 * Load a full chat by identifier.
 *
 * Args:
 *   chatId: Backend chat identifier.
 *
 * Returns:
 *   Promise<ApiFullChatResponse>
 */
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

/**
 * Load visible user and assistant messages for a chat.
 *
 * Args:
 *   chatId: Backend chat identifier.
 *
 * Returns:
 *   Promise<Message[]>
 */
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

/**
 * Create a new backend chat and return its identifier.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<string>
 */
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

/**
 * Send one prompt to an existing chat.
 *
 * Args:
 *   chatId: Target chat identifier.
 *   userInput: Prompt text sent by the user.
 *   limitHistory: Maximum history messages included by the backend.
 *
 * Returns:
 *   Promise<SendChatMessageResponse>
 */
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

/**
 * Load one chat and convert it to a sidebar item.
 *
 * Args:
 *   chatId: Backend chat identifier.
 *
 * Returns:
 *   Promise<ChatItem>
 */
export async function getChatItemById(chatId: string): Promise<ChatItem> {

  const chat = await getChatById(chatId)

  return {
    id: chat.chat_id,
    title: chat.title?.trim() || 'Nuevo chat',
    lastMessage: buildLastMessagePreview(chat.messages ?? []),
    updatedAt: formatUpdatedAt(chat.updated_at)
  }
}

/**
 * Permanently delete a chat session and all its messages.
 *
 * Args:
 *   chatId: Backend chat identifier to remove.
 *
 * Returns:
 *   Promise<void>
 */
export async function deleteChat(chatId: string): Promise<void> {

  const baseUrl = await getBaseUrl()

  const response = await fetch(`${baseUrl}/assistant/chats/${chatId}`, {
    method: 'DELETE'
  })

  if (!response.ok) {
    throw new Error('No se pudo eliminar el chat')
  }
}

/**
 * Send the onboarding profile payload to the backend.
 *
 * Args:
 *   data: Structured profile data collected during onboarding.
 *
 * Returns:
 *   Promise<void>
 */
export async function saveUserProfileOnboarding(data: UserProfilePayload): Promise<void> {

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

/**
 * Load the saved user profile from the backend.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<Record<string, unknown>>
 */
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

/**
 * Load chats and the first chat messages for initial renderer state.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<InitialChatBootstrapData>
 */
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
