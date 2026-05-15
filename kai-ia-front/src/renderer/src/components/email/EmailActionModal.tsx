import { GmailApiEmail } from '@renderer/services/gmail_email.service'
import React, { useState } from 'react'

type Props = {
  email: GmailApiEmail | null
  open: boolean
  loading?: boolean
  submitting?: boolean
  onClose: () => void
  onSubmit: (prompt: string) => Promise<void>
}

/**
 * Show the actionable email popup used to answer a newly received message.
 *
 * Args:
 *   email: Email payload displayed in the modal.
 *   open: Controls whether the modal is visible.
 *   loading: Shows the initial loading state while the email is resolved.
 *   submitting: Disables actions while the answer is being sent.
 *   onClose: Closes the modal without sending a response.
 *   onSubmit: Sends the selected action prompt to the current chat.
 *
 * Returns:
 *   React.JSX.Element | null
 */
export default function EmailActionModal({
  email,
  open,
  loading = false,
  submitting = false,
  onClose,
  onSubmit
}: Props): React.JSX.Element | null {

  const [prompt, setPrompt] = useState('')

  if (!open) return null

  /**
   * Send the selected email action when the user confirms the modal.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   void
   */
  const handleSubmit = async () => {

    if (!prompt.trim()) return
    await onSubmit(prompt.trim())
    setPrompt('')
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Correo recibido</h2>
            <p className="text-sm text-slate-400">
              Revisa el correo y pide a Kai una acción concreta
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
          >
            Cerrar
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="min-h-0 overflow-y-auto border-b border-white/10 p-6 lg:border-b-0 lg:border-r">
            {loading ? (
              <div className="text-sm text-slate-300">Cargando correo...</div>
            ) : email ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-slate-500">Asunto</span>
                    <p className="text-base font-medium text-white">
                      {email.subject || '(sin asunto)'}
                    </p>
                  </div>

                  <div>
                    <span className="text-xs uppercase tracking-wide text-slate-500">Remitente</span>
                    <p className="text-sm text-slate-200">{email.sender || 'Desconocido'}</p>
                  </div>

                  <div>
                    <span className="text-xs uppercase tracking-wide text-slate-500">Fecha</span>
                    <p className="text-sm text-slate-200">{email.date || '-'}</p>
                  </div>
                </div>

                <div>
                  <span className="text-xs uppercase tracking-wide text-slate-500">Vista previa</span>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                    {email.snippet || 'Sin vista previa'}
                  </p>
                </div>

                <div>
                  <span className="text-xs uppercase tracking-wide text-slate-500">Contenido</span>
                  <div className="mt-2 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-100">
                    {email.body || 'Sin contenido'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-300">No se pudo cargar el correo.</div>
            )}
          </div>

          <div className="flex min-h-0 flex-col p-6">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-white">Instrucción para Kai</h3>
              <p className="text-sm text-slate-400">
                Escribe exactamente qué quieres que haga con este correo.
              </p>
            </div>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ejemplo: Resume este correo y dime qué respuesta debería enviar. O redacta una respuesta formal rechazando la propuesta."
              className="min-h-[220px] w-full flex-1 resize-none rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-fuchsia-400/40"
            />

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || !prompt.trim()}
                className="rounded-2xl bg-fuchsia-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Enviando...' : 'Enviar a Kai'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
