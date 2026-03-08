import React, { useState } from "react"

type Props = {
  onNext?: () => void
  onPrev?: () => void
}

const BasicConfigSlide = ({ onNext, onPrev }: Props) => {

  const [host, setHost] = useState("http://localhost")
  const [port, setPort] = useState("8000")

  const saveConfig = async () => {

    const baseUrl = `${host}:${port}`

    await fetch(`${baseUrl}/config/set`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        backend_url: host,
        backend_port: port
      })
    })

    onNext?.()
  }

  return (
    <section className="relative flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 text-white">

      <div className="w-full max-w-xl">

        <h1 className="mb-6 text-4xl font-semibold">
          Configuración inicial
        </h1>

        <p className="mb-10 text-slate-300">
          Antes de comenzar necesitamos saber dónde está el servidor de Kai.
        </p>

        <div className="space-y-6">

          <div>
            <label className="text-sm text-slate-400">
              Dirección del servidor
            </label>

            <input
              value={host}
              onChange={(e)=>setHost(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/20 bg-white/5 p-3 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-slate-400">
              Puerto
            </label>

            <input
              value={port}
              onChange={(e)=>setPort(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/20 bg-white/5 p-3 outline-none"
            />
          </div>

        </div>

        <button
          onClick={saveConfig}
          className="mt-10 rounded-lg border border-white/30 px-6 py-3 hover:bg-white hover:text-black transition"
        >
          Guardar y continuar
        </button>

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

export default BasicConfigSlide