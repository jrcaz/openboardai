import { Route, Switch } from 'wouter'
import { Landing } from './routes/Landing'
import { BoardPage } from './routes/Board'
import { Dashboard } from './routes/Dashboard'
import { Login } from './routes/Login'
import { SettingsPage } from './routes/Settings'
import { Signup } from './routes/Signup'
import { PublicBoardViewer } from './board/PublicBoardViewer'
import { AuthGate } from './components/AuthGate'
import { ApiKeyProvider } from './settings/useApiKey'
import { ApiKeyGate } from './settings/ApiKeyGate'
import { ModelPreferencesProvider } from './settings/useModelPreferences'
import { AnalyticsProvider } from './analytics/useAnalytics'
import { PageViewTracker } from './analytics/usePageView'

export function App() {
  return (
    <AnalyticsProvider>
      <ApiKeyProvider>
        <ModelPreferencesProvider>
          <PageViewTracker />
          <Switch>
            <Route path="/" component={Landing} />
            <Route path="/login" component={Login} />
            <Route path="/signup" component={Signup} />
            <Route path="/dashboard">
              <AuthGate>
                <Dashboard />
              </AuthGate>
            </Route>
            <Route path="/settings/:section?">
              <AuthGate>
                <SettingsPage />
              </AuthGate>
            </Route>
            <Route path="/b/:boardId">
              <AuthGate>
                <ApiKeyGate>
                  <BoardPage />
                </ApiKeyGate>
              </AuthGate>
            </Route>
            <Route path="/p/:token" component={PublicBoardViewer} />
            <Route>
              <div className="p-6 text-sm text-neutral-600">Not found.</div>
            </Route>
          </Switch>
        </ModelPreferencesProvider>
      </ApiKeyProvider>
    </AnalyticsProvider>
  )
}
