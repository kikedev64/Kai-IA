export type GmailApiEmail = {
  id: string
  thread_id: string
  sender: string
  to: string
  subject: string
  date: string
  snippet: string
  body: string
  cc: string[]
  bcc: string[]
  reply_to?: string | null
  message_id?: string | null
  references?: string | null
  in_reply_to?: string | null
}

type FullEmailResponse = {
  status: 'success'
  data: GmailApiEmail
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

export async function readEmailById(messageId: string): Promise<GmailApiEmail> {
  /**
   * Load one Gmail message by id through the backend.
   *
   * Args:
   *   messageId: Gmail message identifier.
   *
   * Returns:
   *   Promise<GmailApiEmail>
   */

  const baseUrl = await getBackendBaseUrl()

  const response = await fetch(
    `${baseUrl}/gmail/email-request/email?message_id=${encodeURIComponent(messageId)}&clean_body=true`,
    {
      method: 'GET'
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'No se pudo leer el correo')
  }

  const data: FullEmailResponse = await response.json()
  return data.data
}
