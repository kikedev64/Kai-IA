import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getChats,
  createChat,
  deleteChat,
  sendMessage,
  getChatById,
  getChatMessages,
  getChatItemById,
} from '@renderer/services/assistant.services'

type MockFetch = ReturnType<typeof vi.fn>

/**
 * Stubs the global fetch implementation with a JSON response body.
 *
 * @param body - Response payload returned by the mocked json method.
 * @param ok - HTTP success flag exposed by the mocked Response object.
 */
function mockFetch(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      json: async () => body,
    } as Response)
  )
}

/**
 * Returns the URL used by the first mocked fetch call.
 *
 * @returns The first requested URL, or an empty string when fetch was not called.
 */
function calledUrl(): string {
  return ((global.fetch as MockFetch).mock.calls[0]?.[0] as string) ?? ''
}

/**
 * Returns the options used by the first mocked fetch call.
 *
 * @returns The first RequestInit object, or an empty object when fetch was not called.
 */
function calledOptions(): RequestInit {
  return ((global.fetch as MockFetch).mock.calls[0]?.[1] as RequestInit) ?? {}
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(window.configApi.getServerUrl as MockFetch).mockResolvedValue('http://localhost')
  ;(window.configApi.getServerPort as MockFetch).mockResolvedValue(8000)
})

describe('getChats', () => {
  it('returns a ChatItem list mapped from the API response', async () => {
    mockFetch({
      chats: [{ chat_id: 'abc', title: 'My chat', updated_at: new Date().toISOString() }],
    })
    const chats = await getChats()
    expect(chats).toHaveLength(1)
    expect(chats[0].id).toBe('abc')
    expect(chats[0].title).toBe('My chat')
  })

  it('returns an empty array when chats is null', async () => {
    mockFetch({ chats: null })
    expect(await getChats()).toEqual([])
  })

  it('returns an empty array when chats is missing', async () => {
    mockFetch({})
    expect(await getChats()).toEqual([])
  })

  it('calls GET /assistant/chats', async () => {
    mockFetch({ chats: [] })
    await getChats()
    expect(calledUrl()).toContain('/assistant/chats')
    expect(calledOptions().method).toBe('GET')
  })

  it('uses fallback base URL when configApi returns null', async () => {
    ;(window.configApi.getServerUrl as MockFetch).mockResolvedValue(null)
    ;(window.configApi.getServerPort as MockFetch).mockResolvedValue(null)
    mockFetch({ chats: [] })
    await getChats()
    expect(calledUrl()).toMatch(/^http:\/\/localhost:8000/)
  })

  it('throws on non-ok HTTP response', async () => {
    mockFetch({}, false)
    await expect(getChats()).rejects.toThrow()
  })

  it('uses "Nuevo chat N" as fallback title when title is blank', async () => {
    mockFetch({ chats: [{ chat_id: 'x', title: '   ', updated_at: null }] })
    const chats = await getChats()
    expect(chats[0].title).toMatch(/Nuevo chat/)
  })
})

describe('createChat', () => {
  it('returns the chat_id from the API', async () => {
    mockFetch({ chat_id: 'new-chat-123' })
    expect(await createChat()).toBe('new-chat-123')
  })

  it('calls POST /assistant/start', async () => {
    mockFetch({ chat_id: 'x' })
    await createChat()
    expect(calledUrl()).toContain('/assistant/start')
    expect(calledOptions().method).toBe('POST')
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false)
    await expect(createChat()).rejects.toThrow()
  })
})

describe('deleteChat', () => {
  it('calls DELETE on /assistant/chats/:id', async () => {
    mockFetch({})
    await deleteChat('chat-to-delete')
    expect(calledUrl()).toContain('/assistant/chats/chat-to-delete')
    expect(calledOptions().method).toBe('DELETE')
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false)
    await expect(deleteChat('x')).rejects.toThrow()
  })
})

describe('sendMessage', () => {
  it('includes chat_id and user_input as query params', async () => {
    mockFetch({ reply: 'ok' })
    await sendMessage('chat-123', 'Hello Kai')
    expect(calledUrl()).toContain('chat_id=chat-123')
    expect(calledUrl()).toContain('user_input=Hello+Kai')
  })

  it('uses default limit_history of 50', async () => {
    mockFetch({})
    await sendMessage('cid', 'msg')
    expect(calledUrl()).toContain('limit_history=50')
  })

  it('accepts a custom limit_history', async () => {
    mockFetch({})
    await sendMessage('cid', 'msg', 10)
    expect(calledUrl()).toContain('limit_history=10')
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false)
    await expect(sendMessage('cid', 'msg')).rejects.toThrow()
  })
})

describe('getChatById', () => {
  it('calls GET /assistant/chats/:id', async () => {
    mockFetch({ chat_id: 'cid', title: 'T', messages: [] })
    await getChatById('cid')
    expect(calledUrl()).toContain('/assistant/chats/cid')
  })

  it('throws on non-ok response', async () => {
    mockFetch({}, false)
    await expect(getChatById('x')).rejects.toThrow()
  })
})

describe('getChatMessages', () => {
  it('returns only user and assistant messages', async () => {
    mockFetch({
      chat_id: 'cid',
      messages: [
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
        { role: 'tool', content: 'ignored' },
      ],
    })
    const msgs = await getChatMessages('cid')
    expect(msgs).toHaveLength(2)
    expect(msgs.every((m) => ['user', 'assistant'].includes(m.role))).toBe(true)
  })

  it('returns empty array when no messages exist', async () => {
    mockFetch({ chat_id: 'cid', messages: [] })
    expect(await getChatMessages('cid')).toEqual([])
  })

  it('assigns a string id to each message', async () => {
    mockFetch({
      chat_id: 'cid',
      messages: [{ role: 'user', content: 'Hello' }],
    })
    const msgs = await getChatMessages('cid')
    expect(typeof msgs[0].id).toBe('string')
  })
})

describe('getChatItemById', () => {
  it('maps chat fields to ChatItem', async () => {
    const now = new Date().toISOString()
    mockFetch({ chat_id: 'cid', title: 'My chat', updated_at: now, messages: [] })
    const item = await getChatItemById('cid')
    expect(item.id).toBe('cid')
    expect(item.title).toBe('My chat')
  })

  it('uses "Nuevo chat" as fallback when title is blank', async () => {
    mockFetch({ chat_id: 'cid', title: null, updated_at: null, messages: [] })
    const item = await getChatItemById('cid')
    expect(item.title).toBe('Nuevo chat')
  })
})
