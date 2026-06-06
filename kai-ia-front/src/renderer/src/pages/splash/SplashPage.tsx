import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, X } from 'lucide-react'
import icon from '../../assets/icon.png'
import { loadInitialChatBootstrap } from '../../services/assistant.services'
import { useChatBootstrap } from '../../context/chat-bootstrap.context'

type StartupStatus = {
  step: string
  message: string
}

const STEP_LABELS: Record<string, string> = {
  starting: 'Iniciando',
  'local-config': 'Configuración local',
  onboarding: 'Configuración inicial',
  'bootstrap-ok': 'Sistema listo',
  error: 'Error'
}

/**
 * Render the startup screen while configuration and chat data are checked.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   React.JSX.Element
 */
export default function SplashPage(): React.JSX.Element {

  const [status, setStatus] = useState<StartupStatus>({
    step: 'starting',
    message: 'Iniciando Kai IA...'
  })

  const [isLoadingInitialChats, setIsLoadingInitialChats] = useState(false)
  const [chatBootstrapError, setChatBootstrapError] = useState<string | null>(null)

  const { setBootstrapData } = useChatBootstrap()
  const hasBootstrappedChatsRef = useRef(false)

  useEffect(() => {
    const unsubscribe = window.startupApi.onStatus((payload) => {
      setStatus(payload)
    })

    return () => unsubscribe()
  }, [])

  /**
   * Prepare the first chat if the local chat list is empty.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  useEffect(() => {
    const bootstrapChats = async () => {

      if (status.step !== 'bootstrap-ok') return
      if (hasBootstrappedChatsRef.current) return

      hasBootstrappedChatsRef.current = true
      setIsLoadingInitialChats(true)
      setChatBootstrapError(null)

      try {
        const data = await loadInitialChatBootstrap()
        setBootstrapData(data)
      } catch (error) {
        console.error('Error cargando chats iniciales:', error)
        setChatBootstrapError('No se pudieron cargar los chats iniciales')
      } finally {
        setIsLoadingInitialChats(false)
      }
    }

    void bootstrapChats()
  }, [status.step, setBootstrapData])

  const isError = status.step === 'error' || !!chatBootstrapError
  const isSuccess =
    status.step === 'bootstrap-ok' &&
    !isLoadingInitialChats &&
    !chatBootstrapError

  const effectiveMessage = chatBootstrapError
    ? chatBootstrapError
    : isLoadingInitialChats
      ? 'Cargando conversaciones iniciales...'
      : status.message

  const statusIcon = useMemo(() => {
    if (isError) {
      return <AlertTriangle className="h-4 w-4 text-red-200" />
    }

    if (isSuccess) {
      return <CheckCircle2 className="h-4 w-4 text-emerald-200" />
    }

    return <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />
  }, [isError, isSuccess])

  const badgeClasses = isError
    ? 'bg-red-500/12 text-red-100'
    : isSuccess
      ? 'bg-emerald-500/12 text-emerald-100'
      : 'bg-cyan-400/12 text-cyan-100'

  const effectiveStepLabel = chatBootstrapError
    ? 'Error'
    : isLoadingInitialChats
      ? 'Cargando datos'
      : STEP_LABELS[status.step] ?? 'Procesando'

  /**
   * Clear saved configuration so onboarding can run again from scratch.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const handleResetConfiguration = async () => {

    const confirmed = window.confirm(
      '¿Deseas reiniciar la configuración inicial de Kai IA?'
    )

    if (!confirmed) return

    try {
      localStorage.removeItem('kai_bootstrap')
      await window.startupApi.resetAndOpenOnboarding()
    } catch (error) {
      console.error('Error reiniciando configuración:', error)
      alert('No se pudo reiniciar la configuración inicial.')
    }
  }

  /**
   * Request the desktop shell to close the application window.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const handleCloseApp = async () => {

    try {
      await window.electronAPI.closeApp()
    } catch (error) {
      console.error('Error cerrando la app:', error)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020617] px-6 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-70px] top-[-40px] h-[180px] w-[180px] rounded-full bg-cyan-500/14 blur-3xl" />
        <div className="absolute right-[-60px] top-[20%] h-[170px] w-[170px] rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute bottom-[-60px] left-[35%] h-[160px] w-[160px] rounded-full bg-blue-500/10 blur-3xl" />

        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '36px 36px'
          }}
        />
      </div>

      <div className="relative w-full max-w-[720px]">
        <div className="flex items-center gap-5 rounded-[30px] bg-white/[0.07] px-5 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.38)] ring-1 ring-white/10 backdrop-blur-3xl">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-[24px] bg-cyan-400/10 blur-xl" />
            <div className="relative flex h-[88px] w-[88px] items-center justify-center rounded-[24px] bg-white/[0.08] ring-1 ring-white/10 backdrop-blur-2xl">
              <img
                src={icon}
                alt="Kai IA"
                className="h-[52px] w-[52px] object-contain drop-shadow-[0_0_20px_rgba(34,211,238,0.18)]"
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight text-white">
                  Kai IA
                </h1>
                <p className="mt-1 text-xs text-slate-400">
                  Asistente personal inteligente
                </p>
              </div>

              <div
                className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium ${badgeClasses}`}
              >
                {statusIcon}
                <span>{effectiveStepLabel}</span>
              </div>
            </div>

            <div className="mt-4">
              <p className="line-clamp-2 text-sm leading-6 text-slate-200">
                {effectiveMessage}
              </p>

              {!isError && !isSuccess && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300/90" />
                  <span
                    className="h-2 w-2 animate-pulse rounded-full bg-cyan-300/70"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="h-2 w-2 animate-pulse rounded-full bg-cyan-300/50"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              )}

              {isError && (
                <div className="mt-4 rounded-2xl bg-red-500/10 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs leading-5 text-red-100/90">
                      Revisa backend, base de datos y modelo local.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleResetConfiguration}
                        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-xs font-medium text-white transition hover:bg-white hover:text-black"
                      >
                        <RotateCcw size={14} />
                        Reiniciar configuración
                      </button>

                      <button
                        onClick={handleCloseApp}
                        className="inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] text-white transition hover:border-red-400/40 hover:bg-red-500 hover:text-white"
                        aria-label="Salir"
                        title="Salir"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
