import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveLocalSettings, getLocalSettings, getBackendSettings } from '@renderer/services/settings.service'

type MockFn = ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  ;(window.configApi.getServerUrl as MockFn).mockResolvedValue('http://localhost')
  ;(window.configApi.getServerPort as MockFn).mockResolvedValue(8000)
  ;(window.configApi.getGmailWatchIntervalMs as MockFn).mockResolvedValue(20000)
  ;(window.configApi.getUserProfileRaw as MockFn).mockResolvedValue('')
  ;(window.configApi.getUserProfileJson as MockFn).mockResolvedValue(null)
})

describe('saveLocalSettings input validation', () => {
  it('throws when server_url is empty', async () => {
    await expect(
      saveLocalSettings({
        server_url: '   ',
        server_port: '8000',
        gmail_watch_interval_ms: '20000',
        user_profile_raw: '',
        user_profile_json: {},
      })
    ).rejects.toThrow('URL')
  })

  it('throws when server_port is not numeric', async () => {
    await expect(
      saveLocalSettings({
        server_url: 'http://localhost',
        server_port: 'abc',
        gmail_watch_interval_ms: '20000',
        user_profile_raw: '',
        user_profile_json: {},
      })
    ).rejects.toThrow('puerto')
  })

  it('throws when gmail_watch_interval_ms is below 5000', async () => {
    await expect(
      saveLocalSettings({
        server_url: 'http://localhost',
        server_port: '8000',
        gmail_watch_interval_ms: '1000',
        user_profile_raw: '',
        user_profile_json: {},
      })
    ).rejects.toThrow('Gmail')
  })

  it('throws when gmail_watch_interval_ms is above 3600000', async () => {
    await expect(
      saveLocalSettings({
        server_url: 'http://localhost',
        server_port: '8000',
        gmail_watch_interval_ms: '99999999',
        user_profile_raw: '',
        user_profile_json: {},
      })
    ).rejects.toThrow('Gmail')
  })

  it('accepts exactly the lower 5000 ms boundary', async () => {
    await expect(
      saveLocalSettings({
        server_url: 'http://localhost',
        server_port: '8000',
        gmail_watch_interval_ms: '5000',
        user_profile_raw: '',
        user_profile_json: {},
      })
    ).resolves.toBeUndefined()
  })
})

describe('saveLocalSettings configApi calls', () => {
  it('calls every configApi setter with valid data', async () => {
    await saveLocalSettings({
      server_url: 'http://my-server',
      server_port: '9090',
      gmail_watch_interval_ms: '30000',
      user_profile_raw: 'profile data',
      user_profile_json: { name: 'Kike' },
    })

    expect(window.configApi.setServerUrl).toHaveBeenCalledWith('http://my-server')
    expect(window.configApi.setServerPort).toHaveBeenCalledWith(9090)
    expect(window.configApi.setGmailWatchIntervalMs).toHaveBeenCalledWith(30000)
    expect(window.configApi.setUserProfileRaw).toHaveBeenCalledWith('profile data')
    expect(window.configApi.setUserProfileJson).toHaveBeenCalledWith({ name: 'Kike' })
  })

  it('trims server_url before persisting it', async () => {
    await saveLocalSettings({
      server_url: '  http://localhost  ',
      server_port: '8000',
      gmail_watch_interval_ms: '20000',
      user_profile_raw: '',
      user_profile_json: {},
    })
    expect(window.configApi.setServerUrl).toHaveBeenCalledWith('http://localhost')
  })
})

describe('getLocalSettings', () => {
  it('returns defaults when configApi returns null', async () => {
    ;(window.configApi.getServerUrl as MockFn).mockResolvedValue(null)
    ;(window.configApi.getServerPort as MockFn).mockResolvedValue(null)
    ;(window.configApi.getGmailWatchIntervalMs as MockFn).mockResolvedValue(null)

    const settings = await getLocalSettings()
    expect(settings.server_url).toBe('http://localhost')
    expect(settings.server_port).toBe('8000')
    expect(settings.gmail_watch_interval_ms).toBe('20000')
    expect(settings.user_profile_raw).toBe('')
    expect(settings.user_profile_json).toBe('{}')
  })

  it('returns configured values when they exist', async () => {
    ;(window.configApi.getServerUrl as MockFn).mockResolvedValue('http://192.168.1.100')
    ;(window.configApi.getServerPort as MockFn).mockResolvedValue(9000)

    const settings = await getLocalSettings()
    expect(settings.server_url).toBe('http://192.168.1.100')
    expect(settings.server_port).toBe('9000')
  })

  it('serializes user_profile_json as a JSON string', async () => {
    ;(window.configApi.getUserProfileJson as MockFn).mockResolvedValue({ name: 'Kai' })
    const settings = await getLocalSettings()
    const parsed = JSON.parse(settings.user_profile_json)
    expect(parsed.name).toBe('Kai')
  })

  it('returns {} as user_profile_json when configApi returns null', async () => {
    ;(window.configApi.getUserProfileJson as MockFn).mockResolvedValue(null)
    const settings = await getLocalSettings()
    expect(settings.user_profile_json).toBe('{}')
  })
})

describe('getBackendSettings', () => {
  it('calls GET /settings on the expected base URL', async () => {
    const mockSettings = { model_name: 'qwen', temperature: '0' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: mockSettings }),
    }))

    await getBackendSettings({ serverUrl: 'http://localhost', serverPort: 8000 })
    const url = ((global.fetch as MockFn).mock.calls[0]?.[0] as string) ?? ''
    expect(url).toContain('/settings')
    expect(url).toContain('http://localhost:8000')
  })

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Server error' }),
    }))

    await expect(
      getBackendSettings({ serverUrl: 'http://localhost', serverPort: 8000 })
    ).rejects.toThrow('Server error')
  })

  it('removes the trailing serverUrl slash before building the URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ settings: {} }),
    }))

    await getBackendSettings({ serverUrl: 'http://localhost/', serverPort: 8000 })
    const url = ((global.fetch as MockFn).mock.calls[0]?.[0] as string) ?? ''
    expect(url).not.toContain('//settings')
  })
})
