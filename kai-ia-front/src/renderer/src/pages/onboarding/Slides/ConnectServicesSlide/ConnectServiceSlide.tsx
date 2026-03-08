import React from 'react'
import { Mail, CalendarDays, FolderOpen, CheckSquare } from 'lucide-react'

type Props = {
  onNext?: () => void
  onPrev?: () => void
}

const ConnectServicesSlide = ({ onNext, onPrev }: Props) => {
  return (
    <section className="relative flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 text-white">
      <div className="mx-auto max-w-6xl text-center">
        <h1 className="mb-6 text-4xl font-semibold tracking-tight md:text-5xl">
          Conecta tus servicios
        </h1>

        <p className="mx-auto mb-14 max-w-2xl text-lg text-slate-300">
          Para ayudarte mejor, Kai puede integrarse con tus herramientas habituales y trabajar
          contigo desde un único lugar.
        </p>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left hover:bg-white/10 transition">
            <Mail className="mb-4 h-8 w-8 text-sky-400" />
            <h3 className="mb-2 text-lg font-medium">Gmail</h3>
            <p className="text-sm leading-6 text-slate-400">
              Lee correos, resume mensajes, encuentra conversaciones y te ayuda a responder más
              rápido.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left hover:bg-white/10 transition">
            <CalendarDays className="mb-4 h-8 w-8 text-violet-400" />
            <h3 className="mb-2 text-lg font-medium">Google Calendar</h3>
            <p className="text-sm leading-6 text-slate-400">
              Consulta tu disponibilidad, organiza reuniones y mantén tu agenda al día.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left hover:bg-white/10 transition">
            <FolderOpen className="mb-4 h-8 w-8 text-emerald-400" />
            <h3 className="mb-2 text-lg font-medium">Google Drive</h3>
            <p className="text-sm leading-6 text-slate-400">
              Accede a tus documentos y encuentra información importante para ayudarte mejor.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left hover:bg-white/10 transition">
            <CheckSquare className="mb-4 h-8 w-8 text-amber-400" />
            <h3 className="mb-2 text-lg font-medium">Google Tasks</h3>
            <p className="text-sm leading-6 text-slate-400">
              Gestiona tareas, crea recordatorios y mantén el seguimiento de tus pendientes diarios.
            </p>
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-sm leading-6 text-slate-400 md:text-base">
          Tú decides qué conectar y cuándo hacerlo. Kai solo utilizará los servicios que autorices
          para ofrecerte una experiencia más completa.
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

export default ConnectServicesSlide
