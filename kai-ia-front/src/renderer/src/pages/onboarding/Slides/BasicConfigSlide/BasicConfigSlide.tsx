import { useEffect, useMemo, useState } from "react"

type Props = {
  onNext?: () => void
  onPrev?: () => void
}

type ConnectionStatus = "idle" | "checking" | "success" | "error"

const DEFAULT_HOST = "http://localhost"
const DEFAULT_PORT = "8000"

/**
 * Render the backend connection step and save the local server settings.
 *
 * Args:
 *   onNext: Moves the user to the next onboarding step.
 *   onPrev: Moves the user back to the previous onboarding step.
 *
 * Returns:
 *   React.JSX.Element
 */
const BasicConfigSlide = ({ onNext, onPrev }: Props) => {

  const [host, setHost] = useState(DEFAULT_HOST)
  const [port, setPort] = useState(DEFAULT_PORT)
  const [status, setStatus] = useState<ConnectionStatus>("idle")
  const [message, setMessage] = useState("")
  const [loadingConfig, setLoadingConfig] = useState(true)

  /**
   * Load saved connection settings into the current onboarding form.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
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
        console.error("No se pudo cargar la configuración guardada:", error)
      } finally {
        setLoadingConfig(false)
      }
    }

    void loadSavedConfig()
  }, [])

  const baseUrl = useMemo(() => {
    const cleanHost = host.trim().replace(/\/+$/, "")
    const cleanPort = port.trim()
    return `${cleanHost}:${cleanPort}`
  }, [host, port])

  /**
   * Persist the server connection settings before continuing onboarding.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const saveConfig = async () => {

    try {
      setStatus("checking")
      setMessage("Comprobando conexión con el backend...")

      const cleanHost = host.trim().replace(/\/+$/, "")
      const cleanPort = port.trim()

      if (!cleanHost || !cleanPort || Number.isNaN(Number(cleanPort))) {
        throw new Error("Introduce una URL y un puerto válidos")
      }

      const response = await fetch(`${cleanHost}:${cleanPort}/health`, {
        method: "GET"
      })

      if (!response.ok) {
        throw new Error(`El backend respondió con ${response.status}`)
      }

      const data = await response.json()

      if (data?.status !== "ok") {
        throw new Error("La respuesta del backend no es válida")
      }

      await window.configApi.setServerUrl(cleanHost)
      await window.configApi.setServerPort(Number(cleanPort))

      setStatus("success")
      setMessage("Conexión correcta con el backend. Configuración guardada.")
      onNext?.()
    } catch (error) {
      setStatus("error")

      if (error instanceof TypeError) {
        setMessage(
          "No se pudo conectar con el backend. Revisa que esté iniciado, la URL o CORS."
        )
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo conectar con el backend"
        )
      }
    }
  }

  if (loadingConfig) {
    return (
      <section className="relative flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 text-white">
        <div className="text-slate-300">Cargando configuración...</div>
      </section>
    )
  }

  return (
    <section className="relative flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-8 backdrop-blur-sm">
        <h1 className="mb-2 text-3xl font-semibold">
          Configuración inicial
        </h1>

        <p className="mb-8 text-slate-400">
          Introduce la dirección del servidor de Kai para establecer conexión.
        </p>

        <div className="space-y-5">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Dirección del servidor
            </label>

            <input
              value={host}
              onChange={(e) => {
                setHost(e.target.value)
                setStatus("idle")
                setMessage("")
              }}
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900/60 p-3 outline-none transition focus:border-white/30"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-slate-500">
              Puerto
            </label>

            <input
              value={port}
              onChange={(e) => {
                setPort(e.target.value)
                setStatus("idle")
                setMessage("")
              }}
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-900/60 p-3 outline-none transition focus:border-white/30"
            />
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
            <p className="text-xs text-slate-500">URL de conexión</p>
            <p className="mt-1 text-sm text-slate-200">
              {baseUrl}/health
            </p>
          </div>

          {message && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                status === "success"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                  : status === "error"
                    ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
                    : "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
              }`}
            >
              {message}
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            onClick={onPrev}
            className="rounded-full border border-white/20 px-5 py-2 text-sm text-white/70 transition hover:border-white hover:text-white"
          >
            ← Atrás
          </button>

          <button
            onClick={saveConfig}
            disabled={status === "checking"}
            className="rounded-lg border border-white/30 px-6 py-3 transition hover:bg-white hover:text-black disabled:opacity-50"
          >
            {status === "checking" ? "Comprobando..." : "Guardar y continuar"}
          </button>
        </div>
      </div>
    </section>
  )
}

export default BasicConfigSlide
