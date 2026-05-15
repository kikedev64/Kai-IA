import { Mail, CalendarDays, FolderOpen, Bell } from 'lucide-react'

type Props = {
  onNext?: () => void
  onPrev?: () => void
}

/**
 * Render the personal introduction step for onboarding.
 *
 * Args:
 *   onNext: Moves the user to the next onboarding step.
 *   onPrev: Moves the user back to the previous onboarding step.
 *
 * Returns:
 *   React.JSX.Element
 */
const WhoamiSlide = ({ onNext,onPrev }: Props) => {

  return (
    <section className="relative flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 text-white">
      <div className="mx-auto max-w-6xl text-center">
        <h1 className="mb-6 text-4xl font-semibold tracking-tight md:text-5xl">¿Quién soy?</h1>

        <p className="mx-auto mb-14 max-w-2xl text-lg text-slate-300">
          Soy una inteligencia artificial diseñada para organizar tu trabajo, gestionar información
          y simplificar tareas diarias para que puedas concentrarte en lo importante.
        </p>

        <div className="grid gap-6 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left">
            <Mail className="mb-4 h-8 w-8 text-sky-400" />
            <h3 className="mb-2 text-lg font-medium">Correos</h3>
            <p className="text-sm leading-6 text-slate-400">
              Puedo leer, resumir y ayudarte a responder correos rápidamente.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left">
            <CalendarDays className="mb-4 h-8 w-8 text-violet-400" />
            <h3 className="mb-2 text-lg font-medium">Agenda</h3>
            <p className="text-sm leading-6 text-slate-400">
              Organizo eventos, reviso tu disponibilidad y te ayudo a planificar tu día.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left">
            <FolderOpen className="mb-4 h-8 w-8 text-emerald-400" />
            <h3 className="mb-2 text-lg font-medium">Archivos</h3>
            <p className="text-sm leading-6 text-slate-400">
              Encuentro documentos importantes y utilizo su contenido para ayudarte mejor.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-left">
            <Bell className="mb-4 h-8 w-8 text-amber-400" />
            <h3 className="mb-2 text-lg font-medium">Recordatorios</h3>
            <p className="text-sm leading-6 text-slate-400">
              Puedo avisarte de tareas, reuniones, fechas importantes y pendientes para que no se te
              pase nada.
            </p>
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-sm leading-6 text-slate-400 md:text-base">
          Todo esto en un único lugar, con una experiencia pensada para ayudarte a trabajar de forma
          más rápida, organizada y cómoda.
        </p>
      </div>

      <button
        onClick={onNext}
        className="absolute bottom-8 right-8 rounded-full border border-white/30 bg-transparent px-6 py-2 text-sm text-white/80 transition hover:border-white hover:text-white"
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

export default WhoamiSlide
