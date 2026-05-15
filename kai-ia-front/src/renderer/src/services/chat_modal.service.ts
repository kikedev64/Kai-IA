import { createChat } from './assistant.services'

export type CreateChatAndSendMessageOptions = {
  onToken?: (partialText: string) => void
}

export type CreateChatAndSendMessageResult = {
  chatId: string
  fullReply: string
}

async function getBackendBaseUrl(): Promise<string> {
  /**
   * Build the backend base URL from saved local configuration.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   string
   */

  const backendUrl = await window.configApi.getServerUrl()
  const backendPort = await window.configApi.getServerPort()

  if (!backendUrl || !backendPort) {
    throw new Error('Backend URL o puerto no configurados')
  }

  return `${backendUrl}:${backendPort}`
}

export async function createChatAndSendAssistantMessage(
  prompt: string,
  options: CreateChatAndSendMessageOptions = {}
): Promise<CreateChatAndSendMessageResult> {
  /**
   * Create a chat, send a prompt through the streaming endpoint and collect the answer.
   *
   * Args:
   *   prompt: Prompt sent to the assistant.
   *   options: Optional token callback used while streaming.
   *
   * Returns:
   *   Promise<CreateChatAndSendResult>
   */

  const chatId = await createChat()
  const baseUrl = await getBackendBaseUrl()

  const params = new URLSearchParams({
    chat_id: chatId,
    user_input: prompt,
    limit_history: '50'
  })

  const response = await fetch(`${baseUrl}/assistant/chat/stream?${params.toString()}`, {
    method: 'POST'
  })

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || 'No se pudo enviar el mensaje a Kai')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  let accumulated = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue

      const token = line.slice(6)

      if (token === '[DONE]') {
        continue
      }

      accumulated += token
      options.onToken?.(accumulated)
    }
  }

  return {
    chatId,
    fullReply: accumulated
  }
}
