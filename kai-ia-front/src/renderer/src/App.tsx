import { useEffect, useState } from 'react'
import OnboardingFlow from './pages/onboarding/OnboardingFlow'
import HomePage from './pages/home/HomePage'

type AppStatus = 'loading' | 'show-onboarding' | 'show-main'

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
    return <div>Cargando...</div>
  }

  if (status === 'show-onboarding') {
    return <OnboardingFlow onFinish={handleOnboardingFinish} />
  }

  return <HomePage />
}

export default App