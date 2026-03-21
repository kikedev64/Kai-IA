import { HashRouter, Routes, Route } from 'react-router-dom'
import OnboardingFlow from './pages/onboarding/OnboardingFlow'
import HomePage from './pages/home/HomePage'
import SplashPage from './pages/splash/SplashPage'

function App(): React.JSX.Element {
  const handleOnboardingFinish = async () => {
    try {
      await window.startupApi.completeOnboardingAndOpenMain()
    } catch (error) {
      console.error('No se pudo cerrar onboarding y abrir HomePage:', error)
    }
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/splash" element={<SplashPage />} />
        <Route path="/onboarding" element={<OnboardingFlow onFinish={handleOnboardingFinish} />} />
        <Route path="/" element={<HomePage />} />
      </Routes>
    </HashRouter>
  )
}

export default App