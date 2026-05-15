export type SystemNotificationPayload = {
  title: string
  body: string
  silent?: boolean
  data?: {
    type?: 'email'
    messageId?: string
  }
}

/**
 * Request a desktop notification from the Electron main process.
 *
 * Args:
 *   payload: Notification title, body and optional metadata.
 *
 * Returns:
 *   Promise<void>
 */
export async function showSystemNotification(payload: SystemNotificationPayload): Promise<void> {

  if (!window.systemNotificationsApi) {
    throw new Error('systemNotificationsApi no está disponible en window')
  }

  const result = await window.systemNotificationsApi.show(payload)

  if (!result.ok) {
    throw new Error(result.error || 'No se pudo mostrar la notificación del sistema')
  }
}

export function onEmailNotificationClick(
  /**
   * Subscribe to email notification click events from the main process.
   *
   * Args:
   *   callback: Handler invoked with the clicked email message id.
   *
   * Returns:
   *   () => void
   */
  callback: (payload: { messageId: string }) => void
): () => void {

  if (!window.systemNotificationsApi) {
    throw new Error('systemNotificationsApi no está disponible en window')
  }

  return window.systemNotificationsApi.onEmailNotificationClick(callback)
}
