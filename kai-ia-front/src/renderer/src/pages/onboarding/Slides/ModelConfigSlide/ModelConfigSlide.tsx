import { useEffect, useState } from 'react'

import {
  type BackendSettings,
  getBackendSettings,
  saveBackendSettings
} from '../../../../services/settings.service'

type Props = {
  onNext?: () => void
  onPrev?: () => void
}

type SaveStatus = 'idle' | 'loading' | 'saving' | 'error'

const CONTEXT_LENGTH_MIN = 1024
const CONTEXT_LENGTH_MAX = 131072

/**
 * Render the model runtime configuration step used before profile generation.
 *
 * Args:
 *   onNext: Moves the user to the next onboarding step.
 *   onPrev: Moves the user back to the previous onboarding step.
 *
 * Returns:
 *   React.JSX.Element
 */
const ModelConfigSlide = ({ onNext, onPrev }: Props) => {

  const [settings, setSettings] = useState<BackendSettings | null>(null)
  const [modelName, setModelName] = useState('')
  const [temperature, setTemperature] = useState('0')
  const [contextLength, setContextLength] = useState('8192')
  const [status, setStatus] = useState<SaveStatus>('loading')
  const [message, setMessage] = useState('')

  /**
   * Load the backend runtime settings after the connection slide has persisted the endpoint.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  useEffect(() => {
    const loadSettings = async () => {

      try {
        setStatus('loading')
        setMessage('')

        const backendSettings = await getBackendSettings()

        setSettings(backendSettings)
        setModelName(backendSettings.model_name)
        setTemperature(backendSettings.temperature)
        setContextLength(backendSettings.llm_context_length)
        setStatus('idle')
      } catch (error) {
        setStatus('error')
        setMessage(
          error instanceof Error
            ? error.message
            : 'No se pudo cargar la configuracion del modelo'
        )
      }
    }

    void loadSettings()
  }, [])

  /**
   * Validate and persist model settings while preserving every prompt value.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const saveModelConfig = async () => {

    try {
      if (!settings) {
        throw new Error('La configuracion del backend no esta cargada todavia')
      }

      const cleanModelName = modelName.trim()
      const parsedTemperature = Number(temperature)
      const parsedContextLength = Number(contextLength)

      if (!cleanModelName) {
        throw new Error('Introduce el nombre del modelo cargado en LM Studio')
      }

      if (!Number.isFinite(parsedTemperature)) {
        throw new Error('La temperatura debe ser un numero valido')
      }

      if (
        !Number.isInteger(parsedContextLength) ||
        parsedContextLength < CONTEXT_LENGTH_MIN ||
        parsedContextLength > CONTEXT_LENGTH_MAX
      ) {
        throw new Error(
          `El context length debe ser un entero entre ${CONTEXT_LENGTH_MIN} y ${CONTEXT_LENGTH_MAX}`
        )
      }

      setStatus('saving')
      setMessage('Guardando configuracion del modelo...')

      await saveBackendSettings({
        ...settings,
        model_name: cleanModelName,
        temperature: String(parsedTemperature),
        llm_context_length: String(parsedContextLength)
      })

      setStatus('idle')
      setMessage('Configuracion del modelo guardada.')
      onNext?.()
    } catch (error) {
      setStatus('error')
      setMessage(
        error instanceof Error ? error.message : 'No se pudo guardar la configuracion del modelo'
      )
    }
  }

  if (status === 'loading') {
    return (
      <section className="relative flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 text-white">
        <div className="text-slate-300">Cargando configuracion del modelo...</div>
      </section>
    )
  }

  const isSaving = status === 'saving'

  return (
    <section className="relative flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
        <div className="mb-8">
          <p className="mb-3 text-xs uppercase tracking-[0.28em] text-cyan-200/80">
            Modelo local
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Configura el modelo que usará tu agente
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-400 md:text-base">
            Estos valores se guardan en la base de datos y será la configuración que usará tu agente para
            contestarte, puedes modificarlo más adelante.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_180px]">
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Nombre del modelo
            </label>
            <input
              value={modelName}
              onChange={(event) => {
                setModelName(event.target.value)
                setMessage('')
                setStatus('idle')
              }}
              placeholder="qwen/qwen3-14b"
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900/60 p-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-white/30"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Temperatura
            </label>
            <input
              value={temperature}
              onChange={(event) => {
                setTemperature(event.target.value)
                setMessage('')
                setStatus('idle')
              }}
              placeholder="0"
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900/60 p-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-white/30"
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">
              0 prioriza respuestas mas deterministas.
            </p>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Context length
            </label>
            <input
              value={contextLength}
              onChange={(event) => {
                setContextLength(event.target.value)
                setMessage('')
                setStatus('idle')
              }}
              placeholder="8192"
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900/60 p-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-white/30"
            />
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Usa el limite que soporte el modelo cargado.
            </p>
          </div>
        </div>

        {message ? (
          <div
            className={`mt-6 rounded-lg border p-3 text-sm ${
              status === 'error'
                ? 'border-rose-400/30 bg-rose-400/10 text-rose-200'
                : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
            }`}
          >
            {message}
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={onPrev}
            disabled={isSaving}
            className="rounded-full border border-white/20 px-5 py-2 text-sm text-white/70 transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Atras
          </button>

          <button
            onClick={saveModelConfig}
            disabled={isSaving || !settings}
            className="rounded-lg border border-white/30 px-6 py-3 text-sm transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : 'Guardar modelo y continuar'}
          </button>
        </div>
      </div>
    </section>
  )
}

export default ModelConfigSlide
