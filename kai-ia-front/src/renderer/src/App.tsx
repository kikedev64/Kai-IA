import { HashRouter, Route, Routes } from 'react-router-dom'
import { ChatBootstrapProvider } from './context/chat-bootstrap.context'
import OnboardingFlow from './pages/onboarding/OnboardingFlow'
import HomePage from './pages/home/HomePage'
import SplashPage from './pages/splash/SplashPage'
import SettingsPage from './pages/settings/SettingsPage'

function App(): React.JSX.Element {
  const handleOnboardingFinish = async () => {
    try {
      await window.startupApi.completeOnboardingAndOpenMain()
    } catch (error) {
      console.error('No se pudo cerrar onboarding y abrir HomePage:', error)
    }
  }

  return (
    <ChatBootstrapProvider>
      <HashRouter>
        <Routes>
          <Route path="/splash" element={<SplashPage />} />
          <Route
            path="/onboarding"
            element={<OnboardingFlow onFinish={handleOnboardingFinish} />}
          />
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </HashRouter>
    </ChatBootstrapProvider>
  )
}

export default App