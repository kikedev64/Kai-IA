import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DEBUG_LAB_CHANNEL,
  publishDebugLabEvent,
  type DebugLabEvent,
  type DebugLabBroadcastMessage,
} from '@renderer/services/debug_lab.service'

describe('DEBUG_LAB_CHANNEL', () => {
  it('has the expected value', () => {
    expect(DEBUG_LAB_CHANNEL).toBe('kai-debug-lab-events')
  })

  it('is a non-empty string', () => {
    expect(typeof DEBUG_LAB_CHANNEL).toBe('string')
    expect(DEBUG_LAB_CHANNEL.length).toBeGreaterThan(0)
  })
})

describe('publishDebugLabEvent', () => {
  let mockChannel: { postMessage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    mockChannel = { postMessage: vi.fn(), close: vi.fn() }
    vi.stubGlobal('BroadcastChannel', vi.fn().mockReturnValue(mockChannel))
  })

  it('creates a BroadcastChannel with the expected name', () => {
    const msg: DebugLabBroadcastMessage = {
      chatId: 'chat-1',
      event: { type: 'debug', stage: 'backend_receive' } as DebugLabEvent,
      createdAt: Date.now(),
    }
    publishDebugLabEvent(msg)
    expect(global.BroadcastChannel).toHaveBeenCalledWith(DEBUG_LAB_CHANNEL)
  })

  it('calls postMessage with the full message', () => {
    const msg: DebugLabBroadcastMessage = {
      chatId: 'chat-2',
      event: { type: 'token', content: 'Hello' } as DebugLabEvent,
      output: 'Hello',
      createdAt: 12345,
    }
    publishDebugLabEvent(msg)
    expect(mockChannel.postMessage).toHaveBeenCalledWith(msg)
  })

  it('closes the channel after publishing', () => {
    publishDebugLabEvent({
      chatId: 'x',
      event: { type: 'done' } as DebugLabEvent,
      createdAt: 0,
    })
    expect(mockChannel.close).toHaveBeenCalledOnce()
  })

  it('closes the channel for error events', () => {
    publishDebugLabEvent({
      chatId: 'y',
      event: { type: 'error', message: 'Something went wrong' } as DebugLabEvent,
      createdAt: 0,
    })
    expect(mockChannel.close).toHaveBeenCalledOnce()
  })
})

describe('DebugLabEvent valid types', () => {
  it('accepts every known event type', () => {
    const types: DebugLabEvent['type'][] = [
      'debug',
      'token',
      'done',
      'error',
      'tool_approval_request',
    ]
    expect(types).toHaveLength(5)
  })

  it('covers the 10 pipeline stages', () => {
    const stages = [
      'backend_receive',
      'tokenize',
      'context',
      'lmstudio_request',
      'lmstudio_response',
      'tool_selected',
      'tool_result',
      'done',
      'error',
      'token',
    ]
    expect(stages).toHaveLength(10)
  })

  it('allows a minimal event with only the type field', () => {
    const event: DebugLabEvent = { type: 'done' }
    expect(event.type).toBe('done')
    expect(event.stage).toBeUndefined()
    expect(event.elapsed_ms).toBeUndefined()
  })

  it('allows a complete event with every optional field', () => {
    const event: DebugLabEvent = {
      type: 'debug',
      chat_id: 'chat-1',
      request_id: 'req-1',
      stage: 'lmstudio_response',
      message: 'debug info',
      elapsed_ms: 1500,
      duration_ms: 200,
      prompt_chars: 300,
      prompt_tokens_estimate: 75,
      messages_count: 5,
      history_messages: 3,
      tools_enabled: true,
      tool_name: 'send_email',
      status: 'ok',
    }
    expect(event.stage).toBe('lmstudio_response')
    expect(event.tools_enabled).toBe(true)
  })
})

describe('DebugLabBroadcastMessage shape', () => {
  it('requires chatId, event, and createdAt', () => {
    const msg: DebugLabBroadcastMessage = {
      chatId: 'abc',
      event: { type: 'debug' },
      createdAt: Date.now(),
    }
    expect(msg.chatId).toBe('abc')
    expect(msg.event.type).toBe('debug')
    expect(typeof msg.createdAt).toBe('number')
  })

  it('keeps output optional', () => {
    const withOutput: DebugLabBroadcastMessage = {
      chatId: 'x',
      event: { type: 'token' },
      output: 'partial text',
      createdAt: 0,
    }
    const withoutOutput: DebugLabBroadcastMessage = {
      chatId: 'x',
      event: { type: 'token' },
      createdAt: 0,
    }
    expect(withOutput.output).toBe('partial text')
    expect(withoutOutput.output).toBeUndefined()
  })
})
