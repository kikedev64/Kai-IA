import React, { useState } from 'react'

type Props = {
  onNext?: () => void
  onPrev?: () => void
}

const ProfileSetupSlide = ({ onNext, onPrev }: Props) => {
  const [inputText, setInputText] = useState('')
  const [previewJson, setPreviewJson] = useState<Record<string, unknown> | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handlePreview = async () => {
    setError('')
    setLoadingPreview(true)

    try {
      const res = await fetch('http://localhost:8000/user-profile/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: inputText
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.detail || 'Error generando la vista previa')
      }

      setPreviewJson(data.profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleSaveAndContinue = async () => {
    if (!previewJson) return

    setError('')
    setSaving(true)

    try {
      const res = await fetch('http://localhost:8000/user-profile/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          profile: previewJson
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.detail || 'Error guardando el perfil')
      }

      onNext?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
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
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ejemplo: Me llamo Enrique, estudio Ingeniería Informática, vivo en Madrid, prefiero respuestas directas, uso Gmail y Calendar a diario..."
              className="min-h-[360px] w-full rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm leading-6 text-white outline-none placeholder:text-slate-500"
            />

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handlePreview}
                disabled={!inputText.trim() || loadingPreview}
                className="rounded-full border border-white/30 bg-transparent px-6 py-2 text-sm text-white/80 transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loadingPreview ? 'Generando...' : 'Probar'}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="mb-4 text-xl font-medium">Vista previa JSON</h2>

            <div className="min-h-[360px] overflow-auto rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <pre className="text-sm leading-6 text-slate-200 whitespace-pre-wrap break-words">
                {previewJson
                  ? JSON.stringify(previewJson, null, 2)
                  : `{
  "name": "",
  "city": "",
  "studies": "",
  "preferred_tone": "",
  "tools_used": []
}`}
              </pre>
            </div>

            <p className="mt-4 text-sm text-slate-400">
              Kai extraerá únicamente la información útil para personalizar la experiencia.
            </p>
          </div>
        </div>

        {error && <p className="mt-6 text-center text-sm text-red-400">{error}</p>}

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSaveAndContinue}
            disabled={!previewJson || saving}
            className="rounded-full border border-white/30 bg-transparent px-7 py-3 text-sm text-white/80 transition hover:border-white hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Guardando...' : 'Guardar y continuar'}
          </button>
        </div>
        <button
          onClick={onPrev}
          className="absolute bottom-8 left-8 rounded-full border border-white/30 px-6 py-2 text-sm text-white/80 bg-transparent transition hover:border-white hover:text-white"
        >
          ← Atrás
        </button>
      </div>
    </section>
  )
}

export default ProfileSetupSlide
