export type ChatRole = 'user' | 'assistant' | 'tool'

export type ApiChatSession = {
  chat_id: string
  title?: string | null
  description?: string | null
  created_at?: string
  updated_at?: string
}

export type ApiChatsResponse = {
  chats: ApiChatSession[]
}

export type ApiChatMessage = {
  role: ChatRole
  content: string
  created_at?: string
}

export type ApiFullChatResponse = {
  chat_id: string
  title?: string | null
  description?: string | null
  created_at?: string
  updated_at?: string
  messages: ApiChatMessage[]
}

export type StartChatResponse = {
  chat_id: string
}

export type SendChatMessageResponse = {
  reply: string
  chat_id: string
}

export type UserProfile = Record<string, unknown>

export type ChatItem = {
  id: string
  title: string
  lastMessage: string
  updatedAt: string
}

export type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}