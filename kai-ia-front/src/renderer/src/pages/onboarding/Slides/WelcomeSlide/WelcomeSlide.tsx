import React from 'react'
import logo from '../../../../assets/LOGO.png'

type Props  = {
  onNext?: () => void
}

const WelcomeSlide = ({onNext}:Props) => {
  return (
    <section className="flex min-h-screen w-full items-center justify-center bg-slate-950 px-6 text-white">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <img
          src={logo}
          alt="Logo de Kai IA"
          className="mb-8 w-24 md:w-55"
        />

        <p className="mb-3 text-sm font-medium uppercase tracking-[0.3em] text-slate-400">
          Kai IA
        </p>

        <h1 className="mb-6 text-4xl font-semibold tracking-tight md:text-6xl">
          Bienvenido
        </h1>

        <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
          Kai es tu secretaria personal inteligente. Te ayuda a gestionar
          correos, calendario, archivos y tareas desde un único lugar, de forma
          clara, rápida y organizada.
        </p>
      </div>

      <button
        onClick={onNext}
        className="absolute bottom-8 right-8 rounded-full border border-white/30 px-6 py-2 text-sm text-white/80 bg-transparent transition hover:border-white hover:text-white"
      >
        Continuar →
      </button>

    </section>
  )
}

export default WelcomeSlide