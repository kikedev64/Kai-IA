import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Menu, Plus, Search, Settings, Send, Bot, User, Sparkles, SlidersHorizontal } from 'lucide-react'
import { createChat, getChatItemById, getChatMessages } from '../../services/assistant.services'
import { useChatBootstrap } from '../../context/chat-bootstrap.context'
import type { ChatItem, Message } from '../../types/assistant'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { createNewEmailWatcher } from '@renderer/services/new_email_watcher.service'
import { readEmailById, type GmailApiEmail } from '@renderer/services/gmail_email.service'
import EmailActionModal from '@renderer/components/email/EmailActionModal'
import ShellCommandApprovalModal, {
  type ShellApprovalRequest
} from '@renderer/components/shell/ShellCommandApprovalModal'
import {
  publishDebugLabEvent,
  type DebugLabEvent
} from '@renderer/services/debug_lab.service'

const CHAT_COMPOSER_MIN_HEIGHT = 72
const CHAT_COMPOSER_MAX_HEIGHT = 176

/**
 * Resize the chat composer until the configured maximum height, then scroll inside it.
 *
 * Args:
 *   textarea: Composer textarea element.
 *
 * Returns:
 *   void
 */
function resizeChatComposer(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto'

  const nextHeight = Math.min(textarea.scrollHeight, CHAT_COMPOSER_MAX_HEIGHT)

  textarea.style.height = `${Math.max(CHAT_COMPOSER_MIN_HEIGHT, nextHeight)}px`
  textarea.style.overflowY =
    textarea.scrollHeight > CHAT_COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
}

/**
 * Reset the chat composer to its compact state.
 *
 * Args:
 *   textarea: Composer textarea element.
 *
 * Returns:
 *   void
 */
function resetChatComposer(textarea: HTMLTextAreaElement): void {
  textarea.style.height = `${CHAT_COMPOSER_MIN_HEIGHT}px`
  textarea.style.overflowY = 'hidden'
}

/**
 * Normalize common LaTeX delimiters before rendering markdown content.
 *
 * Args:
 *   content: Assistant message content.
 *
 * Returns:
 *   string
 */
function normalizeLatex(content: string): string {

  return content
    .replace(/\\\[/g, '$$')
    .replace(/\\\]/g, '$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
}

/**
 * Render assistant markdown with math, GitHub-flavored markdown and syntax highlighting.
 *
 * Args:
 *   content: Markdown text produced by the assistant.
 *
 * Returns:
 *   React.JSX.Element
 */
const MarkdownContent = ({ content }: { content: string }) => {

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 text-sm leading-7 text-slate-100 break-words">{children}</p>
        ),
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        em: ({ children }) => <em className="italic text-slate-200">{children}</em>,
        code: ({ inline, children }: { inline?: boolean; children?: React.ReactNode }) =>
          inline ? (
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs font-mono text-cyan-200 break-all">
              {children}
            </code>
          ) : (
            <pre className="my-2 overflow-x-auto rounded-xl bg-black/40 p-3 text-xs font-mono text-slate-200 border border-white/10">
              <code className="whitespace-pre-wrap">{children}</code>
            </pre>
          ),
        ul: ({ children }) => (
          <ul className="mb-2 ml-4 list-disc space-y-1 text-sm text-slate-100">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 ml-4 list-decimal space-y-1 text-sm text-slate-100">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-6 break-words">{children}</li>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-300 underline break-all hover:text-cyan-200"
          >
            {children}
          </a>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-cyan-400/50 pl-3 text-slate-300 italic">
            {children}
          </blockquote>
        ),
        h1: ({ children }) => <h1 className="mb-2 text-base font-semibold text-white">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 text-sm font-semibold text-white">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 text-sm font-medium text-white">{children}</h3>
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

const STREAM_LIMIT_HISTORY = 6
const DEFAULT_EMAIL_WATCH_INTERVAL_MS = 20000
type UserProfileJson = Record<string, unknown>
type EmailNotificationClickPayload = { messageId: string }

/**
 * Build the complete email context that will be sent together with the user action.
 *
 * Args:
 *   email: Full email payload loaded from the backend.
 *
 * Returns:
 *   string
 */
function buildEmailActionContext(email: GmailApiEmail): string {

  const recipients = [email.to, ...(email.cc ?? []), ...(email.bcc ?? [])]
    .map((recipient) => recipient?.trim())
    .filter(Boolean)
    .join(', ')

  return [
    'CORREO COMPLETO SOBRE EL QUE DEBES TRABAJAR:',
    `message_id: ${email.id}`,
    `thread_id: ${email.thread_id || '-'}`,
    email.message_id ? `rfc_message_id: ${email.message_id}` : null,
    `from: ${email.sender || '-'}`,
    `to_cc_bcc: ${recipients || '-'}`,
    `subject: ${email.subject || '(sin asunto)'}`,
    `date: ${email.date || '-'}`,
    email.reply_to ? `reply_to: ${email.reply_to}` : null,
    email.references ? `references: ${email.references}` : null,
    email.in_reply_to ? `in_reply_to: ${email.in_reply_to}` : null,
    '',
    'CUERPO DEL CORREO:',
    email.body || email.snippet || 'Sin contenido disponible'
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

/**
 * Check that a value is a plain object with at least one key.
 *
 * Args:
 *   value: Unknown value loaded from configuration.
 *
 * Returns:
 *   value is Record<string, unknown>
 */
function isNonEmptyPlainObject(value: unknown): value is UserProfileJson {

  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  )
}

/**
 * Convert stored profile values into compact text suitable for prompt context.
 *
 * Args:
 *   value: Profile value read from the saved profile JSON.
 *
 * Returns:
 *   string | null
 */
function cleanProfileValue(value: unknown): unknown {

  if (value === null || value === undefined) return undefined

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  if (Array.isArray(value)) {
    const cleanedArray = value.map(cleanProfileValue).filter((item) => item !== undefined)

    return cleanedArray.length > 0 ? cleanedArray : undefined
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, cleanProfileValue(item)] as const)
      .filter(([, item]) => item !== undefined)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))

    if (entries.length === 0) return undefined

    return Object.fromEntries(entries)
  }

  return value
}

/**
 * Create a short profile context string for chat requests.
 *
 * Args:
 *   userProfile: Saved structured profile object.
 *
 * Returns:
 *   string
 */
function buildCompactProfileContext(userProfile: UserProfileJson | null): string | null {

  if (!isNonEmptyPlainObject(userProfile)) return null

  const cleanedProfile = cleanProfileValue(userProfile)

  if (!isNonEmptyPlainObject(cleanedProfile)) return null

  return [
    'Perfil persistente del usuario para personalizar la respuesta.',
    'No menciones que tienes este contexto ni lo copies literalmente.',
    `Datos:${JSON.stringify(cleanedProfile)}`
  ].join('\n')
}

/**
 * Render the chat workspace and coordinate chat, email and debug actions.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   React.JSX.Element
 */
const HomePage = (): React.JSX.Element => {

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const [contextFlags, setContextFlags] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('kai-context-flags')
      if (stored) return JSON.parse(stored) as Record<string, boolean>
    } catch { /* ignore */ }
    return { systemPrompt: true, datetime: true, history: true, profile: true, tools: true }
  })

  const toggleContextFlag = (key: string) => {
    setContextFlags((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('kai-context-flags', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [streamingChatId, setStreamingChatId] = useState<string | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const emailWatcherRef = useRef<ReturnType<typeof createNewEmailWatcher> | null>(null)
  const [emailActionOpen, setEmailActionOpen] = useState(false)
  const [selectedEmailForAction, setSelectedEmailForAction] = useState<GmailApiEmail | null>(null)
  const [isEmailActionLoading, setIsEmailActionLoading] = useState(false)
  const [isSubmittingEmailAction, setIsSubmittingEmailAction] = useState(false)
  const pendingEmailsRef = useRef<Map<string, GmailApiEmail>>(new Map())
  const deferredEmailNotificationClicksRef = useRef<EmailNotificationClickPayload[]>([])
  const canOpenEmailNotificationRef = useRef(true)
  const [userProfileJson, setUserProfileJson] = useState<UserProfileJson | null>(null)
  const [emailWatchIntervalMs, setEmailWatchIntervalMs] = useState(DEFAULT_EMAIL_WATCH_INTERVAL_MS)
  const [pendingApproval, setPendingApproval] = useState<ShellApprovalRequest | null>(null)

  const {
    chats,
    selectedChatId,
    messagesByChatId,
    setSelectedChatId,
    setMessagesForChat,
    isReady
  } = useChatBootstrap()

  const [localChats, setLocalChats] = useState<ChatItem[]>(chats)

  /**
   * Open the email action modal with the selected message payload.
   *
   * Args:
   *   email: Email payload to inspect and answer.
   *
   * Returns:
   *   void
   */
  const openEmailActionModal = (email: GmailApiEmail) => {

    canOpenEmailNotificationRef.current = false
    setIsEmailActionLoading(false)
    setSelectedEmailForAction(email)
    setEmailActionOpen(true)
  }

  /**
   * Resolve a notification payload and open the matching email action modal.
   *
   * Args:
   *   payload: Notification payload received from the desktop shell.
   *
   * Returns:
   *   Promise<void>
   */
  const openEmailNotificationPayload = (payload: EmailNotificationClickPayload) => {

    if (!payload || !payload.messageId) return

    const email = pendingEmailsRef.current.get(payload.messageId)
    if (email) {
      openEmailActionModal(email)
      return
    }

    setSelectedEmailForAction(null)
    setIsEmailActionLoading(true)
    setEmailActionOpen(true)
    canOpenEmailNotificationRef.current = false

    void readEmailById(payload.messageId)
      .then((loadedEmail) => {
        pendingEmailsRef.current.set(loadedEmail.id, loadedEmail)
        setSelectedEmailForAction(loadedEmail)
      })
      .catch((error) => {
        console.error('Error cargando correo tras pulsar notificacion:', error)
      })
      .finally(() => {
        setIsEmailActionLoading(false)
      })
  }

  /**
   * Queue a clicked email notification until the UI can safely open the email popup.
   *
   * Args:
   *   payload: Notification click payload.
   *
   * Returns:
   *   void
   */
  const deferEmailNotificationPayload = (payload: EmailNotificationClickPayload) => {

    if (!payload || !payload.messageId) return

    const alreadyQueued = deferredEmailNotificationClicksRef.current.some(
      (queuedPayload) => queuedPayload.messageId === payload.messageId
    )

    if (!alreadyQueued) {
      deferredEmailNotificationClicksRef.current = [
        ...deferredEmailNotificationClicksRef.current,
        payload
      ]
    }
  }

  /**
   * Open the next queued email notification when chat and modal state are idle.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */
  const flushDeferredEmailNotificationPayload = () => {

    if (!canOpenEmailNotificationRef.current) return

    const [nextPayload, ...remainingPayloads] = deferredEmailNotificationClicksRef.current
    if (!nextPayload) return

    deferredEmailNotificationClicksRef.current = remainingPayloads
    openEmailNotificationPayload(nextPayload)
  }

  /**
   * Route notification clicks through the busy-state gate.
   *
   * Args:
   *   payload: Notification click payload.
   *
   * Returns:
   *   void
   */
  const handleEmailNotificationPayload = (payload: EmailNotificationClickPayload) => {

    if (!payload || !payload.messageId) return

    if (!canOpenEmailNotificationRef.current) {
      deferEmailNotificationPayload(payload)
      return
    }

    openEmailNotificationPayload(payload)
  }

  /**
   * Send a prompt to the backend and stream tokens, debug events and completion state.
   *
   * Args:
   *   chatId: Target chat identifier.
   *   promptText: User prompt sent to the backend.
   *
   * Returns:
   *   Promise<string>
   */
  const postChatStream = async (
    chatId: string,
    promptText: string
  ): Promise<string> => {

    const baseUrl = await window.configApi.getServerUrl()
    const port = await window.configApi.getServerPort()
    const url = `${baseUrl || 'http://localhost'}:${port || 8000}`

    const profileContext = buildCompactProfileContext(userProfileJson)

    const response = await fetch(`${url}/assistant/chat/stream`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        prompt: promptText,
        limit_history: STREAM_LIMIT_HISTORY,
        profile_context: profileContext,
        debug: true,
        include_system_prompt: contextFlags.systemPrompt ?? true,
        include_datetime: contextFlags.datetime ?? true,
        include_history: contextFlags.history ?? true,
        include_profile: contextFlags.profile ?? true,
        include_tools: contextFlags.tools ?? true,
      })
    })

    if (!response.ok || !response.body) {
      throw new Error(`Stream no disponible (${response.status})`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    let accumulated = ''
    let buffer = ''
    let streamFinished = false

    /**
     * Apply one parsed stream event to chat state and debug publishing.
     *
     * Args:
     *   event: Parsed server-sent event from the backend stream.
     *
     * Returns:
     *   void
     */
    const processStreamEvent = (event: string): boolean => {

      const lines = event
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      for (const line of lines) {
        if (!line.startsWith('data:')) continue

        const rawData = line.slice(5).trim()
        if (!rawData) continue

        let payload: DebugLabEvent

        try {
          payload = JSON.parse(rawData) as DebugLabEvent
        } catch (parseError) {
          console.error('Error parseando SSE:', rawData, parseError)
          continue
        }

        if (payload.type === 'token') {
          accumulated += payload.content ?? ''
          setStreamingContent(accumulated)
        }

        if (payload.type === 'tool_approval_request') {
          const p = payload as unknown as {
            approval_id: string
            tool_name: string
            command: string
            args: Record<string, unknown>
          }
          setPendingApproval({
            approvalId: p.approval_id,
            toolName: p.tool_name,
            command: p.command,
            args: p.args,
          })
        }

        publishDebugLabEvent({
          chatId,
          event: payload,
          output: accumulated,
          createdAt: Date.now()
        })

        if (payload.type === 'done') {
          setPendingApproval(null)
          return true
        }

        if (payload.type === 'error') {
          setPendingApproval(null)
          throw new Error(payload.message || 'Error recibido desde el stream')
        }
      }

      return false
    }

    while (!streamFinished) {
      const { done, value } = await reader.read()

      if (done) {
        buffer += decoder.decode()

        if (buffer.trim()) {
          const pendingEvents = buffer.split('\n\n').filter((event) => event.trim())

          for (const event of pendingEvents) {
            if (processStreamEvent(event)) {
              streamFinished = true
              break
            }
          }
        }

        break
      }

      buffer += decoder.decode(value, { stream: true })

      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const event of events) {
        if (processStreamEvent(event)) {
          streamFinished = true
          break
        }
      }
    }

    return accumulated.trim() || 'No se recibió contenido desde el asistente.'
  }

  /**
   * Append a user prompt, run the streaming request and store the assistant answer.
   *
   * Args:
   *   chatId: Target chat identifier.
   *   promptText: User prompt sent to the backend.
   *
   * Returns:
   *   Promise<void>
   */
  const sendPromptToChatStream = async (chatId: string, promptText: string) => {

    const currentMessages = messagesByChatId[chatId] ?? []

    const optimisticUserMessage: Message = {
      id: `${chatId}-user-${Date.now()}`,
      role: 'user',
      content: promptText
    }

    setMessagesForChat(chatId, [...currentMessages, optimisticUserMessage])
    setIsSending(true)
    setStreamingChatId(chatId)
    setStreamingContent('')

    try {
      const finalAssistantContent = await postChatStream(chatId, promptText)

      const assistantMessage: Message = {
        id: `${chatId}-assistant-${Date.now()}`,
        role: 'assistant',
        content: finalAssistantContent
      }

      setMessagesForChat(chatId, [...currentMessages, optimisticUserMessage, assistantMessage])
      setStreamingContent('')

      const refreshedChat = await getChatItemById(chatId)
      setLocalChats((prev) => prev.map((chat) => (chat.id === chatId ? refreshedChat : chat)))
    } catch (error) {
      console.error('Error enviando mensaje:', error)

      const errorMessage: Message = {
        id: `${chatId}-assistant-error-${Date.now()}`,
        role: 'assistant',
        content: 'Ha ocurrido un error al procesar el mensaje.'
      }

      setMessagesForChat(chatId, [...currentMessages, optimisticUserMessage, errorMessage])
      setStreamingContent('')
    } finally {
      setIsSending(false)
      setStreamingChatId((currentChatId) => (currentChatId === chatId ? null : currentChatId))
    }
  }

  useEffect(() => {
    if (!contextMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenuOpen])

  useEffect(() => {
    setLocalChats(chats)
  }, [chats])

  useEffect(() => {
    let cancelled = false

    /**
     * Load the structured profile that will be sent with chat prompts.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   Promise<void>
     */
    const loadUserProfile = async () => {

      try {
        const [profile, gmailWatchIntervalMs] = await Promise.all([
          window.configApi.getUserProfileJson(),
          window.configApi.getGmailWatchIntervalMs()
        ])

        if (!cancelled) {
          setUserProfileJson(isNonEmptyPlainObject(profile) ? profile : null)
          setEmailWatchIntervalMs(
            Number.isFinite(gmailWatchIntervalMs) && gmailWatchIntervalMs >= 5000
              ? gmailWatchIntervalMs
              : DEFAULT_EMAIL_WATCH_INTERVAL_MS
          )
        }
      } catch (error) {
        console.error('Error cargando perfil del usuario desde configApi:', error)

        if (!cancelled) {
          setUserProfileJson(null)
          setEmailWatchIntervalMs(DEFAULT_EMAIL_WATCH_INTERVAL_MS)
        }
      }
    }

    void loadUserProfile()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const canOpenEmailNotification =
      !isSending && !isSubmittingEmailAction && !emailActionOpen && !isEmailActionLoading

    canOpenEmailNotificationRef.current = canOpenEmailNotification

    if (canOpenEmailNotification) {
      flushDeferredEmailNotificationPayload()
    }
  }, [isSending, isSubmittingEmailAction, emailActionOpen, isEmailActionLoading])

  useEffect(() => {
    const watcher = createNewEmailWatcher({
      intervalMs: emailWatchIntervalMs,
      onNewEmail: async (email) => {
        console.log('Correo nuevo detectado:', email)

        if (!email?.id) return

        pendingEmailsRef.current.set(email.id, email)
      },
      onError: (error) => {
        console.error('Error en vigilancia de correos:', error)
      }
    })

    emailWatcherRef.current = watcher
    void watcher.start()

    const unsubscribe = window.systemNotificationsApi?.onEmailNotificationClick?.((payload) => {
      handleEmailNotificationPayload(payload)
    })

    /**
     * Drain notification clicks that happened before this view was ready.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   Promise<void>
     */
    const openPendingEmailNotifications = async () => {

      while (true) {
        const payload = await window.systemNotificationsApi?.getPendingEmailNotificationClick?.()
        if (!payload) break

        handleEmailNotificationPayload(payload)
      }
    }

    void openPendingEmailNotifications()

    return () => {
      watcher.stop()
      emailWatcherRef.current = null
      unsubscribe?.()
    }
  }, [emailWatchIntervalMs])

  /**
   * Load persisted messages for the selected chat into the conversation view.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
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
  }, [messagesByChatId, streamingContent, selectedChatId, streamingChatId])

  const filteredChats = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return localChats
    return localChats.filter(
      (chat) =>
        chat.title.toLowerCase().includes(term) || chat.lastMessage.toLowerCase().includes(term)
    )
  }, [search, localChats])

  const selectedChat = localChats.find((chat) => chat.id === selectedChatId) ?? null
  const messages = selectedChatId ? (messagesByChatId[selectedChatId] ?? []) : []
  const selectedChatIsStreaming = Boolean(isSending && selectedChatId === streamingChatId)
  const selectedChatStreamingContent =
    selectedChatId && selectedChatId === streamingChatId ? streamingContent : ''

  /**
   * Send the chosen email action through the active chat stream.
   *
   * Args:
   *   userPrompt: Prompt describing what should be done with the email.
   *
   * Returns:
   *   Promise<void>
   */
  const handleEmailActionSubmit = async (userPrompt: string) => {

    if (!selectedEmailForAction?.id || isSubmittingEmailAction || isSending) return

    const selectedMessageId = selectedEmailForAction.id
    let streamStarted = false

    try {
      setIsSubmittingEmailAction(true)
      setIsSending(true)

      const fullEmail = await readEmailById(selectedMessageId)
      const newChatId = await createChat()
      streamStarted = true

      const optimisticChat: ChatItem = {
        id: newChatId,
        title: 'Acción sobre correo',
        lastMessage: userPrompt,
        updatedAt: 'Hoy'
      }

      setLocalChats((prev) => [optimisticChat, ...prev])
      setMessagesForChat(newChatId, [])
      setSelectedChatId(newChatId)
      setStreamingChatId(newChatId)
      setStreamingContent('')

      const fullInstruction = [
        buildEmailActionContext(fullEmail),
        '',
        'INSTRUCCIÓN DEL USUARIO:',
        userPrompt,
        '',
        'REGLAS PARA ESTA ACCIÓN:',
        'La instrucción del usuario manda por encima de cualquier interpretación automática.',
        'Si el usuario solo pide resumir, explicar, analizar o clasificar el correo, NO uses herramientas de envío ni respuesta.',
        'No respondas al correo, no envíes correos y no modifiques nada salvo que el usuario lo pida explícitamente con verbos como responder, enviar, reenviar, crear, borrar o actualizar.',
        `Debes usar el correo original con message_id ${fullEmail.id} únicamente como contexto principal.`,
        'Si el usuario pide responder a este correo de forma explícita, usa reply_email y nunca send_email.',
        'Devuelve una respuesta final clara y breve.'
      ].join('\n')

      setEmailActionOpen(false)
      setSelectedEmailForAction(null)

      await sendPromptToChatStream(newChatId, fullInstruction)
    } catch (error) {
      console.error('Error ejecutando acción sobre correo:', error)
    } finally {
      if (!streamStarted) {
        setIsSending(false)
        setStreamingChatId(null)
        setStreamingContent('')
      }
      setIsSubmittingEmailAction(false)
    }
  }

  /**
   * Submit the user's approval or denial for a pending shell command.
   *
   * Args:
   *   approved: True to allow the command to run, false to cancel it.
   *
   * Returns:
   *   Promise<void>
   */
  const handleShellApproval = async (approved: boolean) => {

    if (!pendingApproval) return
    const { approvalId } = pendingApproval
    setPendingApproval(null)

    try {
      const baseUrl = await window.configApi.getServerUrl()
      const port = await window.configApi.getServerPort()
      const url = `${baseUrl || 'http://localhost'}:${port || 8000}`
      await fetch(`${url}/assistant/tool/approve/${approvalId}?approved=${approved}`, {
        method: 'POST',
      })
    } catch (error) {
      console.error('Error enviando respuesta de aprobación de herramienta:', error)
    }
  }

  /**
   * Create a new local chat and make it the active conversation.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
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

  /**
   * Switch the workspace to another saved chat.
   *
   * Args:
   *   chatId: Chat identifier selected by the user.
   *
   * Returns:
   *   void
   */
  const handleSelectChat = (chatId: string) => {

    setSelectedChatId(chatId)
  }

  /**
   * Send the text currently written in the chat composer.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const handleSend = async () => {

    const trimmedInput = input.trim()
    if (!trimmedInput || !selectedChatId || isSending) return

    const chatId = selectedChatId
    const currentMessages = messagesByChatId[chatId] ?? []

    const optimisticUserMessage: Message = {
      id: `${chatId}-user-${Date.now()}`,
      role: 'user',
      content: trimmedInput
    }

    const updatedMessages = [...currentMessages, optimisticUserMessage]

    setMessagesForChat(chatId, updatedMessages)
    setLocalChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId ? { ...chat, lastMessage: trimmedInput, updatedAt: 'Hoy' } : chat
      )
    )

    setInput('')

    if (textareaRef.current) {
      resetChatComposer(textareaRef.current)
    }

    setIsSending(true)
    setStreamingChatId(chatId)
    setStreamingContent('')

    try {
      const finalAssistantContent = await postChatStream(chatId, trimmedInput)

      const assistantMessage: Message = {
        id: `${chatId}-assistant-${Date.now()}`,
        role: 'assistant',
        content: finalAssistantContent
      }

      setMessagesForChat(chatId, [...updatedMessages, assistantMessage])
      setStreamingContent('')

      const refreshedChat = await getChatItemById(chatId)

      setLocalChats((prev) => prev.map((chat) => (chat.id === chatId ? refreshedChat : chat)))
    } catch (error) {
      console.error('Error enviando mensaje:', error)

      const errorMessage: Message = {
        id: `${chatId}-assistant-error-${Date.now()}`,
        role: 'assistant',
        content: 'Ha ocurrido un error al procesar el mensaje.'
      }

      setMessagesForChat(chatId, [...updatedMessages, errorMessage])
      setStreamingContent('')
    } finally {
      setIsSending(false)
      setStreamingChatId((currentChatId) => (currentChatId === chatId ? null : currentChatId))
    }
  }


  /**
   * Submit the composer with Enter while preserving multiline input with Shift+Enter.
   *
   * Args:
   *   e: Keyboard event from the chat composer.
   *
   * Returns:
   *   void
   */
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
        className={`relative z-10 shrink-0 border-r border-white/10 bg-white/[0.045] backdrop-blur-2xl transition-all duration-300 ${
          sidebarOpen ? 'w-[330px]' : 'w-0 overflow-hidden border-r-0'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden">
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

          <div className="flex-1 overflow-y-auto p-3 scrollbar-none [&::-webkit-scrollbar]:hidden">
            {' '}
            {filteredChats.length === 0 ? (
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
            <button
              onClick={() => void window.electronAPI.openDebugLabWindow(selectedChatId ?? undefined)}
              className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm backdrop-blur-xl transition hover:bg-white hover:text-black"
            >
              Debug Lab
            </button>
            <button
              onClick={() => void window.electronAPI.openSettingsWindow()}
              className="rounded-2xl border border-white/10 bg-white/[0.08] p-2.5 backdrop-blur-xl transition hover:bg-white hover:text-black"
            >
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

            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:hidden"
            >
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
                            <div className="whitespace-pre-wrap text-sm leading-7 text-slate-100">
                              <MarkdownContent content={normalizeLatex(message.content)} />
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {selectedChatStreamingContent && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                          <div className="mb-2 flex items-center gap-2 text-xs text-slate-300/80">
                            <Bot size={14} />
                            <span>Kai</span>
                          </div>
                          <div className="whitespace-pre-wrap text-sm leading-7 text-slate-100">
                            <MarkdownContent content={normalizeLatex(selectedChatStreamingContent)} />
                            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-cyan-300" />
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedChatIsStreaming && !selectedChatStreamingContent && (
                      <div className="flex justify-start">
                        <div className="rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
                          <div className="mb-2 flex items-center gap-2 text-xs text-slate-300/80">
                            <Bot size={14} />
                            <span>Kai</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                              style={{ animationDelay: '0ms' }}
                            />
                            <span
                              className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                              style={{ animationDelay: '150ms' }}
                            />
                            <span
                              className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
                              style={{ animationDelay: '300ms' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {messages.length === 0 && !selectedChatStreamingContent && !selectedChatIsStreaming && (
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
                <div className="relative flex-1 rounded-[24px] border border-white/10 bg-white/[0.06] shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                  <textarea
                    value={input}
                    ref={textareaRef}
                    disabled={isSending}
                    onChange={(e) => {
                      setInput(e.target.value)
                      resizeChatComposer(e.target)
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={isSending ? 'Kai está terminando una acción...' : 'Escribe un mensaje para Kai...'}
                    rows={1}
                    className="w-full resize-none bg-transparent px-4 py-4 text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      minHeight: `${CHAT_COMPOSER_MIN_HEIGHT}px`,
                      maxHeight: `${CHAT_COMPOSER_MAX_HEIGHT}px`,
                      overflowY: 'hidden'
                    }}
                  />
                </div>

                <div className="relative" ref={contextMenuRef}>
                  <button
                    onClick={() => setContextMenuOpen((prev) => !prev)}
                    title="Contexto del prompt"
                    className={`flex h-[54px] w-[54px] items-center justify-center rounded-[20px] border shadow-[0_12px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl transition ${
                      contextMenuOpen
                        ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-200'
                        : 'border-white/10 bg-white/[0.1] hover:bg-white hover:text-black'
                    }`}
                  >
                    <SlidersHorizontal size={18} />
                  </button>

                  {contextMenuOpen && (
                    <div className="absolute bottom-[64px] right-0 z-50 w-64 rounded-[20px] border border-white/10 bg-[#060f1e]/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[20px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Contexto del prompt
                      </p>
                      <div className="space-y-1">
                        {([
                          { key: 'systemPrompt', label: 'Prompt del sistema', desc: 'Personalidad y reglas de Kai' },
                          { key: 'datetime',     label: 'Fecha y hora',       desc: 'Contexto temporal actual' },
                          { key: 'history',      label: 'Historial',          desc: 'Mensajes previos del chat' },
                          { key: 'profile',      label: 'Perfil de usuario',  desc: 'Datos personales configurados' },
                          { key: 'tools',        label: 'Tools (function calling)', desc: 'Gmail, Calendar, Drive, Tasks...' },
                        ] as const).map(({ key, label, desc }) => {
                          const active = contextFlags[key] ?? true
                          return (
                            <button
                              key={key}
                              onClick={() => toggleContextFlag(key)}
                              className={`flex w-full items-start gap-3 rounded-[14px] px-3 py-2.5 text-left transition ${
                                active ? 'bg-white/[0.06]' : 'opacity-50 hover:opacity-70'
                              } hover:bg-white/[0.1]`}
                            >
                              <span
                                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition ${
                                  active
                                    ? 'border-cyan-400/60 bg-cyan-400/20 text-cyan-300'
                                    : 'border-white/20 bg-white/[0.04]'
                                }`}
                              >
                                {active && (
                                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                    <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-white">{label}</p>
                                <p className="text-xs text-slate-400">{desc}</p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
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
      <EmailActionModal
        email={selectedEmailForAction}
        open={emailActionOpen}
        loading={isEmailActionLoading}
        submitting={isSubmittingEmailAction || isSending}
        onClose={() => {
          setEmailActionOpen(false)
          setSelectedEmailForAction(null)
          setIsEmailActionLoading(false)
        }}
        onSubmit={handleEmailActionSubmit}
      />

      {pendingApproval && (
        <ShellCommandApprovalModal
          request={pendingApproval}
          onApprove={() => void handleShellApproval(true)}
          onDeny={() => void handleShellApproval(false)}
        />
      )}
    </div>
  )
}

export default HomePage
