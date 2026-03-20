import { useEffect, useState } from 'react'
import OnboardingFlow from './pages/onboarding/OnboardingFlow'

type AppStatus = 'loading' | 'show-onboarding' | 'show-main'

function MainApp(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-semibold">Kai IA</h1>
        <p className="mt-4 text-slate-400">
          Pantalla temporal mientras construimos el resto de la app.
        </p>
      </div>
    </div>
  )
}

function App(): React.JSX.Element {
  const [status, setStatus] = useState<AppStatus>('loading')

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const onboardingCompleted = await window.configApi.getOnboardingCompleted()

        if (!onboardingCompleted) {
          setStatus('show-onboarding')
          return
        }

        setStatus('show-main')
      } catch (error) {
        console.error('Error inicializando la app:', error)
        setStatus('show-main')
      }
    }

    void bootstrap()
  }, [])

  const handleOnboardingFinish = () => {
    setStatus('show-main')
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Cargando...
      </div>
    )
  }

  if (status === 'show-onboarding') {
    return <OnboardingFlow onFinish={handleOnboardingFinish} />
  }

  return <MainApp />
}

export default App