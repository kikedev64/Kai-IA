import React from 'react'
import { Chrome } from 'lucide-react'

type Props = {
  onNext?: () => void
  onPrev?: () => void
}

const ConnectGoogleSlide = ({ onNext, onPrev }: Props) => {
  const handleGoogleLogin = () => {
    window.location.href = 'http://localhost:8000/auth/google/login'
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
          className="mx-auto flex items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-8 py-4 text-lg transition hover:bg-white hover:text-black"
        >
          <Chrome size={24} />
          Conectar con Google
        </button>

        <p className="mt-8 text-sm text-slate-400">
          Solo se utilizarán los permisos necesarios. Puedes revocar el acceso en cualquier momento
          desde tu cuenta de Google.
        </p>
      </div>

      <button
        onClick={onNext}
        className="absolute bottom-8 right-8 rounded-full border border-white/30 px-6 py-2 text-sm text-white/80 bg-transparent transition hover:border-white hover:text-white"
      >
        Continuar →
      </button>
      <button
        onClick={onPrev}
        className="absolute bottom-8 left-8 rounded-full border border-white/30 px-6 py-2 text-sm text-white/80 bg-transparent transition hover:border-white hover:text-white"
      >
        ← Atrás
      </button>
    </section>
  )
}

export default ConnectGoogleSlide
