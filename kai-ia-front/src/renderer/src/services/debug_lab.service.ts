export type DebugStage =
  | 'backend_receive'
  | 'tokenize'
  | 'context'
  | 'lmstudio_request'
  | 'lmstudio_response'
  | 'tool_selected'
  | 'tool_result'
  | 'done'
  | 'error'
  | 'token'

export type DebugLabEvent = {
  type: 'debug' | 'token' | 'done' | 'error'
  chat_id?: string
  request_id?: string
  stage?: DebugStage
  message?: string
  content?: string
  elapsed_ms?: number
  duration_ms?: number
  prompt_chars?: number
  prompt_tokens_estimate?: number
  token_preview?: string[]
  messages_count?: number
  history_messages?: number
  tools_enabled?: boolean
  tool_name?: string
  tool_calls?: Array<{
    name: string
    arguments: string
  }>
  status?: string
  [key: string]: unknown
}

export type DebugLabBroadcastMessage = {
  chatId: string
  event: DebugLabEvent
  output?: string
  createdAt: number
}

export const DEBUG_LAB_CHANNEL = 'kai-debug-lab-events'

export function publishDebugLabEvent(message: DebugLabBroadcastMessage): void {
  /**
   * Broadcast one debug event to any open Debug Lab panel.
   *
   * Args:
   *   message: Debug Lab event payload with chat context.
   *
   * Returns:
   *   void
   */

  const channel = new BroadcastChannel(DEBUG_LAB_CHANNEL)
  channel.postMessage(message)
  channel.close()
}
