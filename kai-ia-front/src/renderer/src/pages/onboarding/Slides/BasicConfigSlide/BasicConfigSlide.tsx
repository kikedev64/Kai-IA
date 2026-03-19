import React, { useMemo, useState } from "react"

type Props = {
  onNext?: () => void
  onPrev?: () => void
}

type ConnectionStatus = "idle" | "checking" | "success" | "error"

const BasicConfigSlide = ({ onNext, onPrev }: Props) => {
  const [host, setHost] = useState("http://localhost")
  const [port, setPort] = useState("8000")
  const [status, setStatus] = useState<ConnectionStatus>("idle")
  const [message, setMessage] = useState("")

  const baseUrl = useMemo(() => {
    const cleanHost = host.trim().replace(/\/+$/, "")
    const cleanPort = port.trim()
    return `${cleanHost}:${cleanPort}`
  }, [host, port])

  const saveConfig = async () => {
    try {
      setStatus("checking")
      setMessage("Comprobando conexión con el backend...")

      const response = await fetch(`${baseUrl}/health`, {
        method: "GET"
      })

      if (!response.ok) {
        throw new Error(`El backend respondió con ${response.status}`)
      }

      const data = await response.json()

      if (data?.status !== "ok") {
        throw new Error("La respuesta del backend no es válida")
      }

      setStatus("success")
      setMessage("Conexión correcta con el backend")
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