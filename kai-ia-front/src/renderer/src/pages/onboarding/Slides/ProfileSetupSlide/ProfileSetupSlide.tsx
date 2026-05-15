import { useState } from 'react'

type Props = {
  onNext?: () => void
  onPrev?: () => void
}

type AskResponse = {
  reply: string
}

/**
 * Render the profile setup step and save the generated structured profile.
 *
 * Args:
 *   onNext: Moves the user to the next onboarding step after saving.
 *   onPrev: Moves the user back to the previous onboarding step.
 *
 * Returns:
 *   React.JSX.Element
 */
const ProfileSetupSlide = ({ onNext, onPrev }: Props) => {

  const [inputText, setInputText] = useState('')
  const [previewJson, setPreviewJson] = useState<Record<string, unknown> | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  /**
   * Check that a parsed model response is a plain JSON object.
   *
   * Args:
   *   value: Value returned by JSON parsing.
   *
   * Returns:
   *   value is Record<string, unknown>
   */
  const isValidPlainObject = (value: unknown): value is Record<string, unknown> => {

    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  /**
   * Generate and validate the JSON profile preview from the free-text profile.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const handlePreview = async () => {

    setError('')
    setLoadingPreview(true)
    setPreviewJson(null)

    try {
      const backendBaseUrl = await getBackendBaseURL()
      const res = await fetch(`${backendBaseUrl}/assistant/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: inputText,
          system_prompt: 'basic_user_information'
        })
      })

      const data: AskResponse | { detail?: string } = await res.json()

      if (!res.ok) {
        throw new Error(
          'detail' in data
            ? data.detail || 'Error generando la vista previa'
            : 'Error generando la vista previa'
        )
      }

      if (!('reply' in data) || typeof data.reply !== 'string') {
        throw new Error('La respuesta del backend no tiene un formato válido')
      }

      let parsedJson: unknown

      try {
        parsedJson = JSON.parse(data.reply)
      } catch {
        throw new Error('El modelo no devolvió un JSON válido')
      }

      if (!isValidPlainObject(parsedJson)) {
        throw new Error('El JSON devuelto debe ser un objeto válido')
      }

      setPreviewJson(parsedJson)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setPreviewJson(null)
    } finally {
      setLoadingPreview(false)
    }
  }

  /**
   * Validate the current step and continue when its required data is ready.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const handleContinue = async () => {

    setError('')

    try {
      if (!inputText.trim()) {
        throw new Error('Introduce información antes de guardar')
      }

      if (!previewJson) {
        throw new Error('Primero genera una vista previa válida')
      }

      if (!isValidPlainObject(previewJson)) {
        throw new Error('El JSON generado no es válido')
      }

      const serializedJson = JSON.stringify(previewJson)

      try {
        JSON.parse(serializedJson)
      } catch {
        throw new Error('No se pudo validar el JSON antes de guardarlo')
      }

      setSaving(true)

      await window.configApi.setUserProfileRaw(inputText.trim())
      await window.configApi.setUserProfileJson(previewJson)

      onNext?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando la información')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="relative flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="w-full max-w-7xl">
        <div className="mb-10 text-center">
          <h1 className="mb-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Cuéntame sobre ti
          </h1>
          <p className="mx-auto max-w-3xl text-lg text-slate-300">
            Escribe información relevante sobre ti y Kai preparará una estructura organizada para
            personalizar mejor la experiencia.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="mb-4 text-xl font-medium">Tu texto</h2>

            <textarea
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value)
                setError('')
              }}
              placeholder="Ejemplo: Me llamo Enrique, estudio Ingeniería Informática, vivo en Madrid, prefiero respuestas directas, uso Gmail y Calendar a diario..."
              className="min-h-[360px] w-full rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm leading-6 text-white outline-none placeholder:text-slate-500"
            />

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handlePreview}
                disabled={!inputText.trim() || loadingPreview || saving}
                className="rounded-full border border-white/30 bg-transparent px-6 py-2 text-sm text-white/80 transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loadingPreview ? 'Generando...' : 'Probar'}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="mb-4 text-xl font-medium">Vista previa JSON</h2>

            <div className="min-h-[360px] overflow-auto rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
                {previewJson
                  ? JSON.stringify(previewJson, null, 2)
                  : `{
                    "name": "",
                    "age": null,
                    "study": "",
                    "location": "",
                    "interests": [],
                    "goals": []
                  }`}
              </pre>
            </div>

            <p className="mt-4 text-sm text-slate-400">
              Revisa el JSON generado. Si refleja bien tu información, guárdalo para continuar.
            </p>
          </div>
        </div>

        {error && <p className="mt-6 text-center text-sm text-red-400">{error}</p>}

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleContinue}
            disabled={!previewJson || loadingPreview || saving}
            className="rounded-full border border-white/30 bg-transparent px-7 py-3 text-sm text-white/80 transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Guardando...' : 'Guardar y continuar'}
          </button>
        </div>

        <button
          onClick={onPrev}
          disabled={loadingPreview || saving}
          className="absolute bottom-8 left-8 rounded-full border border-white/30 px-6 py-2 text-sm text-white/80 bg-transparent transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Atrás
        </button>
      </div>
    </section>
  )
}

export default ProfileSetupSlide

/**
 * Build the backend origin from the persisted host and port configuration.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   Promise<string>
 */
async function getBackendBaseURL(): Promise<string> {

  const savedHost = await window.configApi.getServerUrl()
  const savedPort = await window.configApi.getServerPort()
  const cleanHost = (savedHost || 'http://localhost').trim().replace(/\/+$/, '')
  const cleanPort = savedPort ?? 8000

  return `${cleanHost}:${cleanPort}`
}
