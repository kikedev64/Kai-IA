import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import WelcomeSlide from './Slides/WelcomeSlide/WelcomeSlide'
import WhoamiSlide from './Slides/Whoami/WhoamiSlide'
import HowItWorksSlide from './Slides/HowItWorksSlide/HowItWorksSlide'
import ConnectServicesSlide from './Slides/ConnectServicesSlide/ConnectServiceSlide'
import BasicConfigSlide from './Slides/BasicConfigSlide/BasicConfigSlide'
import ProfileSetupSlide from './Slides/ProfileSetupSlide/ProfileSetupSlide'
import ConnectGoogleSlide from './Slides/ConnectGoogleSlide/ConnectGoogleSlide'

type SlideProps = {
  onNext?: () => void
  onPrev?: () => void
}

type OnboardingFlowProps = {
  onFinish?: () => void
}

const OnboardingFlow = ({ onFinish }: OnboardingFlowProps) => {
  /**
   * Render the onboarding slide controller and move through the setup steps.
   *
   * Args:
   *   onFinish: Called when the last onboarding step is complete.
   *
   * Returns:
   *   React.JSX.Element
   */

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)

  const slides: React.ComponentType<SlideProps>[] = [
    WelcomeSlide,
    WhoamiSlide,
    HowItWorksSlide,
    ConnectServicesSlide,
    BasicConfigSlide,
    ProfileSetupSlide,
    ConnectGoogleSlide
  ]

  const nextSlide = () => {
    /**
     * Advance to the next onboarding slide or finish the flow at the end.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   void
     */

    if (step < slides.length - 1) {
      setDirection(1)
      setStep((s) => s + 1)
      return
    }

    onFinish?.()
  }

  const prevSlide = () => {
    /**
     * Move back to the previous onboarding slide when one exists.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   void
     */

    if (step > 0) {
      setDirection(-1)
      setStep((s) => s - 1)
    }
  }

  const CurrentSlide = slides[step]
  const isLastSlide = step === slides.length - 1

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-950">
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          initial={{ opacity: 0, x: direction > 0 ? 60 : -60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction > 0 ? -60 : 60 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="min-h-screen w-full"
        >
          <CurrentSlide
            onNext={isLastSlide ? onFinish : nextSlide}
            onPrev={step > 0 ? prevSlide : undefined}
          />
        </motion.div>
      </AnimatePresence>

      <div className="absolute left-1/2 top-8 flex -translate-x-1/2 items-center gap-2">
        {slides.map((_, index) => (
          <div
            key={index}
            className={`h-2 rounded-full transition-all ${
              index === step ? 'w-8 bg-white' : 'w-2 bg-white/30'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

export default OnboardingFlow