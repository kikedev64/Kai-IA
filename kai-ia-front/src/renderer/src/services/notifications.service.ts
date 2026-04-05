export type SystemNotificationPayload = {
  title: string
  body: string
  silent?: boolean
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