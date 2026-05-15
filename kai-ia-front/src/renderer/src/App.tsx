import { HashRouter, Route, Routes } from 'react-router-dom'
import { ChatBootstrapProvider } from './context/chat-bootstrap.context'
import OnboardingFlow from './pages/onboarding/OnboardingFlow'
import HomePage from './pages/home/HomePage'
import SplashPage from './pages/splash/SplashPage'
import SettingsPage from './pages/settings/SettingsPage'
import DebugLabPage from './pages/debug/DebugLabPage'

function App(): React.JSX.Element {
  /**
   * Render the top-level renderer shell and switch between onboarding and the main chat.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   React.JSX.Element
   */

  const handleOnboardingFinish = async () => {
    /**
     * Persist the completed onboarding state and open the main application.
     *
     * Args:
     *   None.
     *
     * Returns:
     *   Promise<void>
     */

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
          <Route path="/debug-lab" element={<DebugLabPage />} />
        </Routes>
      </HashRouter>
    </ChatBootstrapProvider>
  )
}

export default App
