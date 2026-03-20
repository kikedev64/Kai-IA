import React, { useEffect, useMemo, useState } from 'react'
import { LogIn } from 'lucide-react'

type Props = {
  onNext?: () => void
  onPrev?: () => void
}

type GoogleConnectionStatus = 'idle' | 'loading' | 'waiting' | 'success' | 'error'

type GoogleUrlResponse = {
  auth_url: string
}

type GoogleTestResponse = {
  authenticated: boolean
  google_ok: boolean
  message: string
  items_found?: number
}

const DEFAULT_HOST = 'http://localhost'
const DEFAULT_PORT = '8000'

const ConnectGoogleSlide = ({ onNext, onPrev }: Props) => {
  const [host, setHost] = useState(DEFAULT_HOST)
  const [port, setPort] = useState(DEFAULT_PORT)
  const [loadingConfig, setLoadingConfig] = useState(true)

  const [status, setStatus] = useState<GoogleConnectionStatus>('idle')
  const [message, setMessage] = useState('')
  const [connected, setConnected] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const backendUrl = useMemo(() => {
    const cleanHost = host.trim().replace(/\/+$/, '')
    const cleanPort = port.trim()
    return `${cleanHost}:${cleanPort}`
  }, [host, port])

  useEffect(() => {
    const loadSavedConfig = async () => {
      try {
        const savedHost = await window.configApi.getServerUrl()
        const savedPort = await window.configApi.getServerPort()

        if (savedHost) {
          setHost(savedHost)
        }

        if (savedPort !== null && savedPort !== undefined) {
          setPort(String(savedPort))
        }
      } catch (error) {
        console.error('No se pudo cargar la configuración guardada:', error)
      } finally {
        setLoadingConfig(false)
      }
    }

    void loadSavedConfig()
  }, [])

  const checkGoogleConnection = async () => {
    try {
      const res = await fetch(`${backendUrl}/auth/google/test`, {
        method: 'GET'
      })

      const data: GoogleTestResponse = await res.json()

      if (!res.ok) {
        throw new Error(data?.message || 'Error comprobando el estado de Google')
      }

      if (data.authenticated && data.google_ok) {
        setStatus('success')
        setMessage(data.message || 'Cuenta de Google conectada correctamente.')
        setConnected(true)
        return true
      }

      setStatus('error')
      setMessage(data.message || 'La autenticación no se completó correctamente.')
      setConnected(false)
      return false
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'No se pudo comprobar la conexión con Google')
      setConnected(false)
      return false
    }
  }

  const handleGoogleLogin = async () => {
    try {
      setStatus('loading')
      setMessage('Preparando autenticación con Google...')
      setConnected(false)

      const res = await fetch(`${backendUrl}/auth/google/url`, {
        method: 'GET'
      })

      const data: GoogleUrlResponse | { detail?: { error?: string } | string } = await res.json()

      if (!res.ok) {
        const errorMessage =
          'detail' in data && typeof data.detail === 'string'
            ? data.detail
            : 'detail' in data &&
                data.detail &&
                typeof data.detail === 'object' &&
                'error' in data.detail
              ? data.detail.error
              : 'No se pudo obtener la URL de autenticación'
        throw new Error(errorMessage)
      }

      if (!('auth_url' in data) || !data.auth_url) {
        throw new Error('El backend no devolvió una URL válida de autenticación')
      }

      setStatus('waiting')
      setMessage('Se ha abierto la ventana de Google. Completa el acceso para continuar.')

      await window.electronAPI.openGoogleOAuthPopup(data.auth_url)

      setMessage('Comprobando si la autenticación se completó correctamente...')
      await checkGoogleConnection()
    } catch (err) {
      setStatus('error')
      setMessage(
        err instanceof Error ? err.message : 'No se pudo iniciar la autenticación con Google'
      )
      setConnected(false)
    }
  }

  const handleContinue = async () => {
    if (!connected) return

    try {
      setFinishing(true)
      setMessage('Guardando configuración final...')

      await window.configApi.completeOnboarding()

      setStatus('success')
      setMessage('Configuración completada correctamente.')

      onNext?.()
    } catch (err) {
      setStatus('error')
      setMessage(
        err instanceof Error
          ? err.message
          : 'No se pudo finalizar el onboarding'
      )
    } finally {
      setFinishing(false)
    }
  }

  const statusClassName =
    status === 'success'
      ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
      : status === 'error'
        ? 'border-rose-400/30 bg-rose-400/10 text-rose-200'
        : status === 'waiting' || status === 'loading'
          ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
          : 'border-white/10 bg-white/5 text-slate-300'

  if (loadingConfig) {
    return (
      <section className="relative flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 text-white">
        <div className="text-slate-300">Cargando configuración...</div>
      </section>
    )
  }

  return (
    <section className="relative flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 text-white">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="mb-6 text-4xl font-semibold tracking-tight md:text-5xl">
          Conecta tu cuenta de Google
        </h1>

        <p className="mx-auto mb-10 max-w-xl text-lg text-slate-300">
          Para ayudarte con correos, agenda, documentos y tareas, Kai necesita conectarse a tu
          cuenta de Google.
        </p>

        <button
          onClick={handleGoogleLogin}
          disabled={status === 'loading' || status === 'waiting' || finishing}
          className="mx-auto flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-8 py-4 text-lg transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogIn size={24} />
          {status === 'loading'
            ? 'Preparando...'
            : status === 'waiting'
              ? 'Esperando autorización...'
              : 'Conectar con Google'}
        </button>
        <p className="mt-8 text-sm text-slate-400">
          Solo se utilizarán los permisos necesarios. Puedes revocar el acceso en cualquier momento
          desde tu cuenta de Google.
        </p>

        {message && (
          <div
            className={`mx-auto mt-8 max-w-xl rounded-2xl border p-4 text-sm ${statusClassName}`}
          >
            {message}
          </div>
        )}
      </div>

      <button
        onClick={handleContinue}
        disabled={!connected || finishing}
        className="absolute bottom-8 right-8 rounded-full border border-white/30 px-6 py-2 text-sm text-white/80 bg-transparent transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {finishing ? 'Finalizando...' : 'Continuar →'}
      </button>

      <button
        onClick={onPrev}
        disabled={finishing}
        className="absolute bottom-8 left-8 rounded-full border border-white/30 px-6 py-2 text-sm text-white/80 bg-transparent transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        ← Atrás
      </button>
    </section>
  )
}

export default ConnectGoogleSlide