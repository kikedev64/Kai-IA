import React from 'react'
import { MessageSquare, Brain, Zap } from 'lucide-react'

type Props = {
  onNext?: () => void
  onPrev?: () => void
}

const HowItWorksSlide = ({ onNext, onPrev }: Props) => {
  return (
    <section className="relative flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 text-white">
      <div className="mx-auto max-w-6xl text-center">
        <h1 className="mb-6 text-4xl font-semibold tracking-tight md:text-5xl">
          ¿Cómo funciona Kai?
        </h1>

        <p className="mx-auto mb-14 max-w-2xl text-lg text-slate-300">
          Solo tienes que decirme lo que necesitas. Yo me encargo de analizar la información y
          ayudarte a resolver la tarea.
        </p>

        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left hover:bg-white/10 transition">
            <MessageSquare className="mb-4 h-8 w-8 text-sky-400" />
            <h3 className="mb-2 text-lg font-medium">Escríbeme</h3>
            <p className="text-sm text-slate-400">
              Puedes hablar conmigo de forma natural, igual que con una persona.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left hover:bg-white/10 transition">
            <Brain className="mb-4 h-8 w-8 text-violet-400" />
            <h3 className="mb-2 text-lg font-medium">Analizo</h3>
            <p className="text-sm text-slate-400">
              Comprendo lo que necesitas y busco la información relevante.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left hover:bg-white/10 transition">
            <Zap className="mb-4 h-8 w-8 text-amber-400" />
            <h3 className="mb-2 text-lg font-medium">Actúo</h3>
            <p className="text-sm text-slate-400">
              Puedo consultar correos, organizar tu agenda o encontrar archivos.
            </p>
          </div>
        </div>
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

export default HowItWorksSlide
