export type SystemNotificationPayload = {
  title: string
  body: string
  silent?: boolean
  data?: {
    type?: 'email'
    messageId?: string
  }
}

export async function showSystemNotification(
  payload: SystemNotificationPayload
): Promise<void> {
  if (!window.systemNotificationsApi) {
    throw new Error('systemNotificationsApi no está disponible en window')
  }

  const result = await window.systemNotificationsApi.show(payload)

  if (!result.ok) {
    throw new Error(result.error || 'No se pudo mostrar la notificación del sistema')
  }
}

export function onEmailNotificationClick(
  callback: (payload: { messageId: string }) => void
): () => void {
  if (!window.systemNotificationsApi) {
    throw new Error('systemNotificationsApi no está disponible en window')
  }

  return window.systemNotificationsApi.onEmailNotificationClick(callback)
}