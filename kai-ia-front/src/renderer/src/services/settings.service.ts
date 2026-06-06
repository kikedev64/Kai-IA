import {
  isPlainObject,
  parseProfileJsonReply
} from './profile_json.service'

export type BackendSettings = {
  google_redirect_uri: string
  google_scopes: string
  google_credentials_file: string
  google_token_file: string
  email_max_total_size_attachment: string
  system_prompt_default: string
  model_name: string
  expose_service_endpoints: string
  temperature: string
  'default_prompts.resume_mail': string
  'default_prompts.basic_user_information_json': string
  'default_prompts.chat_summary': string
  lmstudio_timeout: string
  tool_approval_timeout: string
  shell_command_timeout: string
}
export type LocalSettings = {
  server_url: string
  server_port: string
  gmail_watch_interval_ms: string
  user_profile_raw: string
  user_profile_json: string
}

type AskResponse = {
  reply: string
}

type BackendTarget = {
  serverUrl?: string | null
  serverPort?: string | number | null
}

/**
 * Resolve the backend base URL from explicit values or saved settings.
 *
 * Args:
 *   target: Optional backend host and port override.
 *
 * Returns:
 *   Promise<string>
 */
async function resolveBaseUrl(target?: BackendTarget): Promise<string> {

  const fallbackUrl = await window.configApi.getServerUrl()
  const fallbackPort = await window.configApi.getServerPort()

  const serverUrl = String(target?.serverUrl ?? fallbackUrl ?? 'http://localhost').trim()
  const rawPort = target?.serverPort ?? fallbackPort ?? 8000
  const serverPort = Number(rawPort)

  if (!serverUrl) {
    throw new Error('La URL del backend no puede estar vacía')
  }

  if (!Number.isFinite(serverPort)) {
    throw new Error('El puerto del backend no es válido')
  }

  return `${serverUrl.replace(/\/+$/, '')}:${serverPort}`
}

/**
 * Load local settings exposed through the preload bridge.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<LocalSettings>
 */
export async function getLocalSettings(): Promise<LocalSettings> {

  const [serverUrl, serverPort, gmailWatchIntervalMs, userProfileRaw, userProfileJson] = await Promise.all([
    window.configApi.getServerUrl(),
    window.configApi.getServerPort(),
    window.configApi.getGmailWatchIntervalMs(),
    window.configApi.getUserProfileRaw(),
    window.configApi.getUserProfileJson()
  ])

  return {
    server_url: serverUrl ?? 'http://localhost',
    server_port: String(serverPort ?? 8000),
    gmail_watch_interval_ms: String(gmailWatchIntervalMs ?? 20000),
    user_profile_raw: userProfileRaw ?? '',
    user_profile_json: userProfileJson ? JSON.stringify(userProfileJson, null, 2) : '{}'
  }
}

/**
 * Persist local settings through the preload bridge.
 *
 * Args:
 *   payload: Local settings values from the settings form.
 *
 * Returns:
 *   Promise<void>
 */
export async function saveLocalSettings(payload: {
  server_url: string
  server_port: string
  gmail_watch_interval_ms: string
  user_profile_raw: string
  user_profile_json: Record<string, unknown>
}): Promise<void> {

  const parsedPort = Number(payload.server_port)
  const parsedGmailWatchIntervalMs = Number(payload.gmail_watch_interval_ms)

  if (!payload.server_url.trim()) {
    throw new Error('La URL no puede estar vacía')
  }

  if (!Number.isFinite(parsedPort)) {
    throw new Error('El puerto no es válido')
  }

  if (
    !Number.isInteger(parsedGmailWatchIntervalMs) ||
    parsedGmailWatchIntervalMs < 5000 ||
    parsedGmailWatchIntervalMs > 3600000
  ) {
    throw new Error('El intervalo de escucha de Gmail debe estar entre 5000 y 3600000 ms')
  }

  await window.configApi.setServerUrl(payload.server_url.trim())
  await window.configApi.setServerPort(parsedPort)
  await window.configApi.setGmailWatchIntervalMs(parsedGmailWatchIntervalMs)
  await window.configApi.setUserProfileRaw(payload.user_profile_raw.trim())
  await window.configApi.setUserProfileJson(payload.user_profile_json)
}

/**
 * Load editable backend settings from the configured server.
 *
 * Args:
 *   target: Optional backend host and port override.
 *
 * Returns:
 *   Promise<BackendSettings>
 */
export async function getBackendSettings(target?: BackendTarget): Promise<BackendSettings> {

  const baseUrl = await resolveBaseUrl(target)

  const response = await fetch(`${baseUrl}/settings`, {
    method: 'GET'
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.detail || 'No se pudo cargar la configuración del backend')
  }

  return data.settings as BackendSettings
}

/**
 * Persist editable backend settings on the configured server.
 *
 * Args:
 *   settings: Backend settings draft to save.
 *   target: Optional backend host and port override.
 *
 * Returns:
 *   Promise<BackendSettings>
 */
export async function saveBackendSettings(
  settings: BackendSettings,
  target?: BackendTarget
): Promise<BackendSettings> {

  const baseUrl = await resolveBaseUrl(target)

  const response = await fetch(`${baseUrl}/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: settings
    })
  })

  const data = await response.json()

  if (!response.ok) {
    console.error('Error guardando settings:', data)
    throw new Error(
      typeof data?.detail === 'string' ? data.detail : JSON.stringify(data?.detail ?? data)
    )
  }

  return data.settings as BackendSettings
}

/**
 * Regenerate the structured profile from raw profile text.
 *
 * Args:
 *   rawText: Free-text profile used as model input.
 *   target: Optional backend host and port override.
 *
 * Returns:
 *   Promise<Record<string, unknown>>
 */
export async function regenerateUserProfile(
  rawText: string,
  target?: BackendTarget
): Promise<Record<string, unknown>> {

  const baseUrl = await resolveBaseUrl(target)

  const response = await fetch(`${baseUrl}/assistant/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: rawText,
      system_prompt: 'basic_user_information'
    })
  })

  const data: AskResponse | { detail?: string } = await response.json()

  if (!response.ok) {
    throw new Error(
      'detail' in data
        ? data.detail || 'No se pudo regenerar el perfil'
        : 'No se pudo regenerar el perfil'
    )
  }

  if (!('reply' in data) || typeof data.reply !== 'string') {
    throw new Error('La respuesta del backend no tiene un formato válido')
  }

  const parsed = parseProfileJsonReply(data.reply)

  if (!isPlainObject(parsed)) {
    throw new Error('El user profile regenerado no es un objeto válido')
  }

  return parsed
}
